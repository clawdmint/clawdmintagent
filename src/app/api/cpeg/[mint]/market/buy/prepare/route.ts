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
  findOwnerPegAddress,
  findTradeArtRecordAddress,
  parseClawPegCollectionAccount,
  parseCpegMarketListingAccount,
  splitClawPegMarketPayment,
  CPEG_MARKET_LISTING_STATUS_ACTIVE,
} from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";

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
    const buyerOwnerPegAddress = findOwnerPegAddress(collectionAddress.toBase58(), buyer.toBase58());

    const [collectionInfo, listingInfo, buyerOwnerPegInfo] = await connection.getMultipleAccountsInfo(
      [collectionAddress, listingAddress, buyerOwnerPegAddress],
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
          error: `On-chain listing is ${statusLabel}, not ACTIVE. Refresh the marketplace — the row will disappear.`,
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
    // on-chain values are authoritative — and the cpeg-market `buy()` validates them by byte-equality.
    const onChainCreator = collectionState.creator;
    const onChainFeeVault = collectionState.feeVault;

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
    });

    const breakdown = splitClawPegMarketPayment(
      listingState.priceLamports,
      collectionState.royaltyBps,
      collectionState.marketplaceFeeBps
    );

    const tradeArtAddress = findTradeArtRecordAddress(
      collectionAddress.toBase58(),
      BigInt(listing.pegId)
    );

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
        trade_index: listing.pegId,
        address: tradeArtAddress.toBase58(),
        image_url: `/api/cpeg/${launch.tokenMint}/trade-art/${listing.pegId}/svg`,
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
