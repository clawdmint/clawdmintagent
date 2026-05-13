import { NextRequest, NextResponse } from "next/server";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import {
  buildClawPegBuyPegEscrowManifest,
  buildClawPegInitializeOwnerPegManifest,
  describeCpegMarketListingStatus,
  findClawPegCollectionAddress,
  findMarketListingAddress,
  findMarketSaleCounterAddress,
  findOwnerPegAddress,
  findTradeArtRecordAddress,
  parseClawPegCollectionAccount,
  parseCpegMarketListingAccount,
  parseCpegMarketSaleCounterAccount,
  splitClawPegMarketPayment,
  CPEG_MARKET_LISTING_STATUS_ACTIVE,
} from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { fetchHybridCoreAssetOwner } from "@/lib/cpeg-hybrid-engine";
import { buildMarketplaceFillTransaction } from "@/lib/marketplace-transactions";

async function simulatePreparedHybridBuy(
  serializedTransactionBase64: string,
  rpcUrl: string
): Promise<{ ok: true } | { ok: false; message: string; logs: string[] }> {
  try {
    const tx = (await import("@solana/web3.js")).Transaction.from(
      Buffer.from(serializedTransactionBase64, "base64")
    );
    const conn = new Connection(rpcUrl, { commitment: "confirmed" });
    const sim = await conn.simulateTransaction(tx, undefined, true);
    if (sim.value.err) {
      const errStr = typeof sim.value.err === "string" ? sim.value.err : JSON.stringify(sim.value.err);
      return { ok: false, message: errStr, logs: sim.value.logs || [] };
    }
    return { ok: true };
  } catch (simError) {
    const message = simError instanceof Error ? simError.message : String(simError);
    return { ok: false, message, logs: [] };
  }
}

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  buyer: z.string().min(32),
  peg_id: z.number().int().min(0),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const parsed = PrepareSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }
    const launch = await prisma.clawPegLaunch.findUnique({ where: { tokenMint: params.mint } });
    if (launch?.standardMode === CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      const data = await loadHybridLaunchAndAgent(params.mint);
      if (!data) {
        return NextResponse.json({ success: false, error: "Hybrid cPEG launch not found" }, { status: 404 });
      }
      const listing = await prisma.clawPegMarketListing.findFirst({
        where: { tokenMint: launch.tokenMint, pegId: parsed.data.peg_id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      if (!listing) {
        return NextResponse.json({ success: false, error: "Listing not active" }, { status: 404 });
      }
      const buyer = new PublicKey(parsed.data.buyer);
      const seller = new PublicKey(listing.sellerAddress);
      const creator = new PublicKey(launch.creatorAddress);
      const feeVault = new PublicKey(launch.feeVaultAddress);
      const breakdown = splitClawPegMarketPayment(
        BigInt(listing.priceLamports),
        listing.royaltyBps,
        listing.marketplaceFeeBps
      );
      const asset = await prisma.clawPegHybridAsset.findUnique({
        where: { assetAddress: listing.listingAddress },
      });
      if (!asset || asset.ownerAddress !== listing.sellerAddress) {
        await prisma.clawPegMarketListing.updateMany({
          where: { id: listing.id, status: "ACTIVE" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        return NextResponse.json(
          { success: false, error: "Listing owner no longer matches cPEG state. Refresh the market." },
          { status: 409 }
        );
      }
      const onChainOwner = await fetchHybridCoreAssetOwner(listing.listingAddress);
      if (onChainOwner !== listing.sellerAddress) {
        await prisma.clawPegMarketListing.updateMany({
          where: { id: listing.id, status: "ACTIVE" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await prisma.clawPegHybridAsset
          .update({
            where: { assetAddress: listing.listingAddress },
            data: { ownerAddress: onChainOwner },
          })
          .catch(() => null);
        return NextResponse.json(
          { success: false, error: "This listing is no longer owned by the seller. Refresh the market." },
          { status: 409 }
        );
      }
      let prepared: Awaited<ReturnType<typeof buildMarketplaceFillTransaction>>;
      try {
        prepared = await buildMarketplaceFillTransaction({
          buyerAddress: buyer.toBase58(),
          sellerAddress: seller.toBase58(),
          assetAddress: listing.listingAddress,
          collectionAddress: data.launch.hybridCoreCollectionAddress || listing.collectionAddress,
          priceLamports: listing.priceLamports,
          creatorAddress: creator.toBase58(),
          protocolFeeAddress: feeVault.toBase58(),
          sellerProceedsLamports: breakdown.sellerProceedsLamports,
          creatorRoyaltyLamports: breakdown.creatorRoyaltyLamports,
          protocolFeeLamports: breakdown.protocolFeeLamports,
        });
      } catch (buildError) {
        const message = buildError instanceof Error ? buildError.message : String(buildError);
        // Listings can become invalid between list and buy when the seller
        // captured/released the underlying asset, or when an older listing
        // never finished its delegate approval on chain. Self-heal the DB
        // and tell the user to refresh / re-list with a clear message.
        if (/transfer delegate/i.test(message) || /no longer owned/i.test(message)) {
          await prisma.clawPegMarketListing.updateMany({
            where: { id: listing.id, status: "ACTIVE" },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });
          return NextResponse.json(
            {
              success: false,
              error:
                "This cPEG listing is no longer valid (transfer delegate missing or asset moved). The seller needs to re-list it. Refresh the market.",
              details: { reason: message },
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { success: false, error: `Failed to prepare cPEG buy: ${message}` },
          { status: 500 }
        );
      }
      // Preflight simulate the tx on the same RPC the client will use. This
      // surfaces structural errors (account constraints, missing delegate,
      // plugin authority, etc.) before the user is asked to sign, and lets us
      // self-heal the listing DB row when the on-chain state has drifted.
      const sim = await simulatePreparedHybridBuy(prepared.serializedTransactionBase64, getClawPegRpcUrl());
      if (!sim.ok) {
        const lowered = sim.message.toLowerCase();
        const driftHints = [
          "transferdelegate",
          "transfer delegate",
          "invalidauthority",
          "missing signature",
          "uninitialized",
          "account not found",
        ];
        if (driftHints.some((hint) => lowered.includes(hint))) {
          await prisma.clawPegMarketListing.updateMany({
            where: { id: listing.id, status: "ACTIVE" },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });
          return NextResponse.json(
            {
              success: false,
              error:
                "This cPEG listing is stale on-chain (transfer delegate revoked or asset moved). It was cancelled in our index; ask the seller to re-list.",
              details: { reason: sim.message, logs: sim.logs.slice(-6) },
            },
            { status: 409 }
          );
        }
        const interesting = sim.logs
          .filter((line) =>
            /Program log: Error|custom program error|Invalid|insufficient|owner|authority|mint|account|failed/i.test(line)
          )
          .slice(-3)
          .map((line) => line.replace("Program log: ", ""))
          .join(" | ");
        return NextResponse.json(
          {
            success: false,
            error: `Buy transaction would fail on-chain: ${sim.message}${interesting ? ` (${interesting})` : ""}`,
            details: { logs: sim.logs.slice(-12) },
          },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        listing: {
          id: listing.id,
          kind: "hybrid_core",
          peg_id: listing.pegId,
          seller: listing.sellerAddress,
          price_lamports: listing.priceLamports,
          seller_proceeds_lamports: breakdown.sellerProceedsLamports,
          creator_royalty_lamports: breakdown.creatorRoyaltyLamports,
          protocol_fee_lamports: breakdown.protocolFeeLamports,
          asset_address: listing.listingAddress,
          serialized_transaction_base64: prepared.serializedTransactionBase64,
          delegate_address: prepared.delegateAddress,
        },
        trade_art: {
          peg_id: listing.pegId,
          address: listing.listingAddress,
          image_url: `/api/cpeg/${launch.tokenMint}/pegs/${listing.pegId}/svg`,
          kind: "hybrid_core_transfer",
        },
        instructions: [],
      });
    }
    if (!launch?.collectionAddress) {
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
    }
    const listings = await prisma.$queryRaw<Array<{
      id: string;
      status: string;
      sellerAddress: string;
      escrowTokenAccount: string;
      pegId: number;
      priceLamports: string;
      marketplaceFeeBps: number;
      royaltyBps: number;
    }>>`
      SELECT "id", "status", "sellerAddress", "escrowTokenAccount", "pegId", "priceLamports",
        "marketplaceFeeBps", "royaltyBps"
      FROM "ClawPegMarketListing"
      WHERE "tokenMint" = ${launch.tokenMint} AND "pegId" = ${parsed.data.peg_id} AND "status" = ${"ACTIVE"}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    const listing = listings[0];
    if (!listing) {
      return NextResponse.json({ success: false, error: "Listing not active" }, { status: 404 });
    }

    const buyer = new PublicKey(parsed.data.buyer);
    const mint = new PublicKey(launch.tokenMint);
    const buyerTokenAccount = getAssociatedTokenAddressSync(mint, buyer, false, TOKEN_2022_PROGRAM_ID);

    // Server-side preflight: read on-chain state and reconcile against DB.
    // This catches drift (DB row stale, listing never confirmed on-chain, collection upgraded, etc.)
    // and surfaces a precise error before the user sees a generic "invalid account data" simulation failure.
    const connection = new Connection(getClawPegRpcUrl(), { commitment: "confirmed" });
    const collectionAddress = findClawPegCollectionAddress(launch.tokenMint);
    const listingAddress = findMarketListingAddress(collectionAddress.toBase58(), listing.pegId);
    const saleCounterAddress = findMarketSaleCounterAddress(collectionAddress.toBase58());
    const buyerOwnerPegAddress = findOwnerPegAddress(collectionAddress.toBase58(), buyer.toBase58());

    const [collectionInfo, listingInfo, buyerOwnerPegInfo, saleCounterInfo] = await connection.getMultipleAccountsInfo(
      [collectionAddress, listingAddress, buyerOwnerPegAddress, saleCounterAddress],
      "confirmed"
    );

    if (!collectionInfo) {
      return NextResponse.json(
        { success: false, error: "On-chain cPEG collection account not found. Re-run launchpad confirm." },
        { status: 409 }
      );
    }
    // Auto-heal DB drift: if the on-chain listing is missing or non-ACTIVE, bring the DB
    // row in line with on-chain reality so the listing disappears from the marketplace UI
    // on the next refresh. This protects users from getting stuck on a "ghost" listing
    // produced by a previously-failed list/confirm round trip.
    const healDbStatus = async (status: "FILLED" | "CANCELLED") => {
      try {
        await prisma.$executeRaw`
          UPDATE "ClawPegMarketListing"
          SET "status" = ${status},
            "updatedAt" = NOW(),
            "soldAt" = CASE WHEN ${status} = 'FILLED' THEN COALESCE("soldAt", NOW()) ELSE "soldAt" END,
            "cancelledAt" = CASE WHEN ${status} = 'CANCELLED' THEN COALESCE("cancelledAt", NOW()) ELSE "cancelledAt" END
          WHERE "tokenMint" = ${launch.tokenMint} AND "pegId" = ${listing.pegId} AND "status" = 'ACTIVE'
        `;
      } catch {
        // Drift-healing is best-effort; surfacing the original 409 to the user is the
        // primary contract.
      }
    };
    if (!listingInfo) {
      // After the cpeg-market upgrade, a closed listing PDA returns null here. That means
      // the listing was either (a) previously filled and the PDA closed, or (b) cancelled
      // and the PDA closed, or (c) never confirmed on-chain in the first place.
      await healDbStatus("FILLED");
      return NextResponse.json(
        {
          success: false,
          error:
            "This listing is no longer available on-chain. It may have been sold or cancelled. Refresh the marketplace.",
        },
        { status: 409 }
      );
    }

    const collectionState = parseClawPegCollectionAccount(Buffer.from(collectionInfo.data));
    if (!collectionState.isInitialized) {
      return NextResponse.json(
        { success: false, error: "On-chain cPEG collection is not initialized." },
        { status: 409 }
      );
    }

    const listingState = parseCpegMarketListingAccount(Buffer.from(listingInfo.data));
    if (!listingState.isInitialized) {
      await healDbStatus("FILLED");
      return NextResponse.json(
        { success: false, error: "On-chain listing exists but is not initialized." },
        { status: 409 }
      );
    }
    if (listingState.status !== CPEG_MARKET_LISTING_STATUS_ACTIVE) {
      const statusLabel = describeCpegMarketListingStatus(listingState.status);
      await healDbStatus(statusLabel === "CANCELLED" ? "CANCELLED" : "FILLED");
      return NextResponse.json(
        {
          success: false,
          error: `On-chain listing is ${statusLabel}, not ACTIVE. Refresh the marketplace; the row will disappear.`,
        },
        { status: 409 }
      );
    }
    if (listingState.tokenMint !== launch.tokenMint) {
      return NextResponse.json(
        { success: false, error: "On-chain listing token mint does not match launch." },
        { status: 409 }
      );
    }
    if (listingState.seller !== listing.sellerAddress) {
      return NextResponse.json(
        {
          success: false,
          error: `Seller mismatch: on-chain ${listingState.seller}, database ${listing.sellerAddress}.`,
        },
        { status: 409 }
      );
    }
    if (listingState.escrowToken !== listing.escrowTokenAccount) {
      return NextResponse.json(
        {
          success: false,
          error: `Escrow token mismatch: on-chain ${listingState.escrowToken}, database ${listing.escrowTokenAccount}.`,
        },
        { status: 409 }
      );
    }

    // Always derive `creator` and `feeVault` from the on-chain collection. Even if DB is stale or the
    // collection was launched before launch.creatorAddress / feeVaultAddress were captured, the
    // on-chain values are authoritative, and the cpeg-market `buy()` validates them by byte-equality.
    const onChainCreator = collectionState.creator;
    const onChainFeeVault = collectionState.feeVault;
    const saleCounterState = saleCounterInfo && saleCounterInfo.data.length > 0
      ? parseCpegMarketSaleCounterAccount(Buffer.from(saleCounterInfo.data))
      : null;
    if (saleCounterState && (!saleCounterState.isInitialized || saleCounterState.collection !== collectionAddress.toBase58())) {
      return NextResponse.json(
        { success: false, error: "On-chain sale counter does not match this cPEG collection." },
        { status: 409 }
      );
    }
    const nextTradeIndex = (saleCounterState?.count ?? BigInt(0)) + BigInt(1);

    const setupInstructions: ReturnType<typeof buildClawPegInitializeOwnerPegManifest>[] = [];
    if (!buyerOwnerPegInfo) {
      // Buyer has never received a peg from this collection. Auto-prepend an InitializeOwnerPeg ix
      // so the cpeg-market `buy()` -> clawpeg `release` CPI doesn't fail on an uninitialized PDA.
      setupInstructions.push(
        buildClawPegInitializeOwnerPegManifest({
          payer: buyer.toBase58(),
          owner: buyer.toBase58(),
          tokenMint: launch.tokenMint,
        })
      );
    }

    const buyManifest = buildClawPegBuyPegEscrowManifest({
      buyer: buyer.toBase58(),
      seller: listingState.seller,
      creator: onChainCreator,
      feeVault: onChainFeeVault,
      tokenMint: launch.tokenMint,
      buyerTokenAccount: buyerTokenAccount.toBase58(),
      escrowTokenAccount: listingState.escrowToken,
      pegId: listing.pegId,
      tradeIndex: nextTradeIndex,
    });

    const breakdown = splitClawPegMarketPayment(
      listingState.priceLamports,
      collectionState.royaltyBps,
      collectionState.marketplaceFeeBps
    );

    const tradeArtAddress = findTradeArtRecordAddress(collectionAddress.toBase58(), nextTradeIndex);

    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        peg_id: listing.pegId,
        seller: listingState.seller,
        price_lamports: listingState.priceLamports.toString(),
        buyer_token_account: buyerTokenAccount.toBase58(),
        escrow_token_account: listingState.escrowToken,
        creator: onChainCreator,
        fee_vault: onChainFeeVault,
        royalty_bps: collectionState.royaltyBps,
        marketplace_fee_bps: collectionState.marketplaceFeeBps,
        on_chain_status: describeCpegMarketListingStatus(listingState.status),
      },
      trade_art: {
        trade_index: nextTradeIndex.toString(),
        sale_counter_address: saleCounterAddress.toBase58(),
        address: tradeArtAddress.toBase58(),
        image_url: `/api/cpeg/${launch.tokenMint}/trade-art/${nextTradeIndex.toString()}/svg`,
      },
      breakdown: {
        seller_proceeds_lamports: breakdown.sellerProceedsLamports,
        creator_royalty_lamports: breakdown.creatorRoyaltyLamports,
        protocol_fee_lamports: breakdown.protocolFeeLamports,
      },
      instructions: [...setupInstructions, buyManifest],
      preflight: {
        buyer_owner_peg_initialized: Boolean(buyerOwnerPegInfo),
        on_chain_creator_matches_db: launch.creatorAddress === onChainCreator,
        on_chain_fee_vault_matches_db: launch.feeVaultAddress === onChainFeeVault,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG purchase";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
