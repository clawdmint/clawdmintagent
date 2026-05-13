import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

export const dynamic = "force-dynamic";

const BatchSchema = z.object({
  buyer: z.string().min(32),
  peg_ids: z.array(z.number().int().min(0)).min(1).max(6),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const parsed = BatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const launch = await prisma.clawPegLaunch.findUnique({ where: { tokenMint: params.mint } });
    if (!launch?.collectionAddress) {
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
    }

    const uniquePegIds = Array.from(new Set(parsed.data.peg_ids));
    const idList = Prisma.join(uniquePegIds);
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
      WHERE "tokenMint" = ${launch.tokenMint}
        AND "pegId" IN (${idList})
        AND "status" = ${"ACTIVE"}
    `;

    if (listings.length !== uniquePegIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more listings are not active" },
        { status: 404 }
      );
    }

    const buyer = new PublicKey(parsed.data.buyer);
    const mint = new PublicKey(launch.tokenMint);
    const buyerTokenAccount = getAssociatedTokenAddressSync(mint, buyer, false, TOKEN_2022_PROGRAM_ID);

    // On-chain preflight: read every listing PDA and the collection PDA in one batched RPC call so
    // we can detect drift, reject stale DB rows, and substitute the on-chain creator/feeVault.
    const connection = new Connection(getClawPegRpcUrl(), { commitment: "confirmed" });
    const collectionAddress = findClawPegCollectionAddress(launch.tokenMint);
    const saleCounterAddress = findMarketSaleCounterAddress(collectionAddress.toBase58());
    const buyerOwnerPegAddress = findOwnerPegAddress(collectionAddress.toBase58(), buyer.toBase58());
    const orderedListings = [...listings].sort(
      (a, b) => uniquePegIds.indexOf(a.pegId) - uniquePegIds.indexOf(b.pegId)
    );
    const listingPdas = orderedListings.map((row) =>
      findMarketListingAddress(collectionAddress.toBase58(), row.pegId)
    );
    const accounts = await connection.getMultipleAccountsInfo(
      [collectionAddress, buyerOwnerPegAddress, saleCounterAddress, ...listingPdas],
      "confirmed"
    );
    const collectionInfo = accounts[0];
    const buyerOwnerPegInfo = accounts[1];
    const saleCounterInfo = accounts[2];
    const listingInfos = accounts.slice(3);

    if (!collectionInfo) {
      return NextResponse.json(
        { success: false, error: "On-chain cPEG collection account not found." },
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
    const nextTradeIndexStart = (saleCounterState?.count ?? BigInt(0)) + BigInt(1);

    let totalPrice = BigInt(0);
    let totalRoyalty = BigInt(0);
    let totalProtocol = BigInt(0);
    let totalSeller = BigInt(0);
    const manifests: ReturnType<typeof buildClawPegBuyPegEscrowManifest>[] = [];

    for (let i = 0; i < orderedListings.length; i += 1) {
      const row = orderedListings[i];
      const info = listingInfos[i];
      if (!info) {
        return NextResponse.json(
          {
            success: false,
            error: `On-chain listing for cPEG #${row.pegId} not found. The seller's list transaction may have failed.`,
          },
          { status: 409 }
        );
      }
      const state = parseCpegMarketListingAccount(Buffer.from(info.data));
      if (!state.isInitialized || state.status !== CPEG_MARKET_LISTING_STATUS_ACTIVE) {
        return NextResponse.json(
          {
            success: false,
            error: `On-chain listing for cPEG #${row.pegId} is ${describeCpegMarketListingStatus(state.status)}, not ACTIVE.`,
          },
          { status: 409 }
        );
      }
      if (state.tokenMint !== launch.tokenMint) {
        return NextResponse.json(
          { success: false, error: `On-chain mint mismatch for cPEG #${row.pegId}.` },
          { status: 409 }
        );
      }
      if (state.seller !== row.sellerAddress || state.escrowToken !== row.escrowTokenAccount) {
        return NextResponse.json(
          {
            success: false,
            error: `On-chain seller/escrow mismatch for cPEG #${row.pegId}; database is stale.`,
          },
          { status: 409 }
        );
      }
      const breakdown = splitClawPegMarketPayment(
        state.priceLamports,
        collectionState.royaltyBps,
        collectionState.marketplaceFeeBps
      );
      totalPrice += BigInt(breakdown.priceLamports);
      totalRoyalty += BigInt(breakdown.creatorRoyaltyLamports);
      totalProtocol += BigInt(breakdown.protocolFeeLamports);
      totalSeller += BigInt(breakdown.sellerProceedsLamports);
      const tradeIndex = nextTradeIndexStart + BigInt(i);
      manifests.push(
        buildClawPegBuyPegEscrowManifest({
          buyer: buyer.toBase58(),
          seller: state.seller,
          creator: onChainCreator,
          feeVault: onChainFeeVault,
          tokenMint: launch.tokenMint,
          buyerTokenAccount: buyerTokenAccount.toBase58(),
          escrowTokenAccount: state.escrowToken,
          pegId: row.pegId,
          tradeIndex,
        })
      );
    }

    const setupInstructions: ReturnType<typeof buildClawPegInitializeOwnerPegManifest>[] = [];
    if (!buyerOwnerPegInfo) {
      setupInstructions.push(
        buildClawPegInitializeOwnerPegManifest({
          payer: buyer.toBase58(),
          owner: buyer.toBase58(),
          tokenMint: launch.tokenMint,
        })
      );
    }

    return NextResponse.json({
      success: true,
      buyer_token_account: buyerTokenAccount.toBase58(),
      peg_ids: uniquePegIds,
      breakdown: {
        total_price_lamports: totalPrice.toString(),
        total_seller_proceeds_lamports: totalSeller.toString(),
        total_creator_royalty_lamports: totalRoyalty.toString(),
        total_protocol_fee_lamports: totalProtocol.toString(),
      },
      trade_art: orderedListings.map((row, index) => {
        const tradeIndex = nextTradeIndexStart + BigInt(index);
        return {
          peg_id: row.pegId,
          trade_index: tradeIndex.toString(),
          address: findTradeArtRecordAddress(collectionAddress.toBase58(), tradeIndex).toBase58(),
          image_url: `/api/cpeg/${launch.tokenMint}/trade-art/${tradeIndex.toString()}/svg`,
        };
      }),
      instructions: [...setupInstructions, ...manifests],
      preflight: {
        buyer_owner_peg_initialized: Boolean(buyerOwnerPegInfo),
        on_chain_creator: onChainCreator,
        on_chain_fee_vault: onChainFeeVault,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare batch purchase";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
