import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { CPEG_HYBRID_ASSET_STATUS_OWNED } from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { fetchMarketplaceCoreAssetOwner } from "@/lib/marketplace-transactions";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  signature: z.string().min(32),
  seller: z.string().min(32),
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
    const listing = await prisma.clawPegMarketListing.findFirst({
      where: {
        tokenMint: launch.tokenMint,
        pegId: parsed.data.peg_id,
        sellerAddress: parsed.data.seller,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!data || !listing) {
      return NextResponse.json({ success: false, error: "Listing not cancellable" }, { status: 404 });
    }
    const ownerAddress = await fetchMarketplaceCoreAssetOwner(listing.listingAddress);
    if (ownerAddress !== parsed.data.seller) {
      return NextResponse.json(
        { success: false, error: "Cancel transaction did not leave the Core cPEG in the seller wallet" },
        { status: 409 }
      );
    }
    const rows = await prisma.$transaction(async (tx) => {
      await tx.clawPegHybridAsset.update({
        where: { assetAddress: listing.listingAddress },
        data: {
          ownerAddress: parsed.data.seller,
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
          captureTxHash: parsed.data.signature,
          capturedAt: new Date(),
        },
      });
      return tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "ClawPegMarketListing"
        SET "status" = ${"CANCELLED"},
          "cancelTxHash" = ${parsed.data.signature},
          "cancelledAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "id" = ${listing.id}
          AND "status" = ${"ACTIVE"}
        RETURNING "id"
      `;
    });
    return NextResponse.json({ success: true, listing: rows[0] || null, core_transfer_signature: parsed.data.signature });
  }
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "ClawPegMarketListing"
    SET "status" = ${"CANCELLED"},
      "cancelTxHash" = ${parsed.data.signature},
      "cancelledAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "tokenMint" = ${launch.tokenMint}
      AND "pegId" = ${parsed.data.peg_id}
      AND "status" = ${"ACTIVE"}
    RETURNING "id"
  `;
  return NextResponse.json({ success: true, listing: rows[0] || null });
}
