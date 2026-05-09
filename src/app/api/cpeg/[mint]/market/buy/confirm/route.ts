import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findClawPegCollectionAddress, findTradeArtRecordAddress } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  transferCoreAssetFromAgent,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  signature: z.string().min(32),
  buyer: z.string().min(32),
  peg_id: z.number().int().min(0),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const parsed = ConfirmSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const launch = await prisma.clawPegLaunch.findUnique({ where: { tokenMint: params.mint } });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }
  if (launch.standardMode === CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
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
    const transferSignature = await transferCoreAssetFromAgent(
      data.agent,
      data.launch,
      listing.listingAddress,
      parsed.data.buyer
    );
    const rows = await prisma.$transaction(async (tx) => {
      await tx.clawPegHybridAsset.update({
        where: { assetAddress: listing.listingAddress },
        data: {
          ownerAddress: parsed.data.buyer,
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
          captureTxHash: transferSignature || parsed.data.signature,
          capturedAt: new Date(),
        },
      });
      return tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "ClawPegMarketListing"
        SET "status" = ${"FILLED"},
          "buyerAddress" = ${parsed.data.buyer},
          "buyTxHash" = ${parsed.data.signature},
          "soldAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "id" = ${listing.id}
          AND "status" = ${"ACTIVE"}
        RETURNING "id"
      `;
    });
    return NextResponse.json({
      success: true,
      listing: rows[0] || null,
      core_transfer_signature: transferSignature,
      trade_art: {
        trade_index: parsed.data.peg_id,
        address: listing.listingAddress,
        image_url: `/api/cpeg/${launch.tokenMint}/pegs/${parsed.data.peg_id}/svg`,
        kind: "hybrid_core_transfer",
      },
    });
  }
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "ClawPegMarketListing"
    SET "status" = ${"FILLED"},
      "buyerAddress" = ${parsed.data.buyer},
      "buyTxHash" = ${parsed.data.signature},
      "soldAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "tokenMint" = ${launch.tokenMint}
      AND "pegId" = ${parsed.data.peg_id}
      AND "status" = ${"ACTIVE"}
    RETURNING "id"
  `;
  // Surface the deterministic trade-art coordinates so the client can immediately link the
  // buyer to "your fill just produced this art" without re-querying the chain. The cpeg-market
  // program writes this PDA atomically as part of the buy() instruction via CPI to clawpeg.
  const collectionAddress = findClawPegCollectionAddress(launch.tokenMint).toBase58();
  const tradeArtAddress = findTradeArtRecordAddress(
    collectionAddress,
    BigInt(parsed.data.peg_id)
  ).toBase58();
  return NextResponse.json({
    success: true,
    listing: rows[0] || null,
    trade_art: {
      trade_index: parsed.data.peg_id,
      address: tradeArtAddress,
      image_url: `/api/cpeg/${launch.tokenMint}/trade-art/${parsed.data.peg_id}/svg`,
    },
  });
}
