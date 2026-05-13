import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { prisma } from "@/lib/db";
import { buildMarketplaceCancelListingTransaction } from "@/lib/marketplace-transactions";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  seller: z.string().min(32),
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
    if (!launch) {
      return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
    }
    if (launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      return NextResponse.json(
        { success: false, error: "Legacy custom cPEG listing cancels are disabled. This market only supports Metaplex Hybrid cPEGs." },
        { status: 410 }
      );
    }

    const listings = await prisma.$queryRaw<Array<{
      id: string;
      status: string;
      sellerAddress: string;
      escrowTokenAccount: string;
      pegId: number;
    }>>`
      SELECT "id", "status", "sellerAddress", "escrowTokenAccount", "pegId"
      FROM "ClawPegMarketListing"
      WHERE "tokenMint" = ${launch.tokenMint} AND "pegId" = ${parsed.data.peg_id}
      LIMIT 1
    `;
    const listing = listings[0];
    if (!listing || listing.status !== "ACTIVE" || listing.sellerAddress !== parsed.data.seller) {
      return NextResponse.json({ success: false, error: "Listing not cancellable" }, { status: 404 });
    }

    const data = await loadHybridLaunchAndAgent(params.mint);
    if (!data?.launch.hybridCoreCollectionAddress) {
      return NextResponse.json({ success: false, error: "Hybrid cPEG launch is not configured" }, { status: 409 });
    }
    const prepared = await buildMarketplaceCancelListingTransaction({
      walletAddress: parsed.data.seller,
      assetAddress: listing.escrowTokenAccount,
      collectionAddress: data.launch.hybridCoreCollectionAddress,
    });

    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        kind: "hybrid_core",
        peg_id: listing.pegId,
        asset_address: listing.escrowTokenAccount,
        serialized_transaction_base64: prepared.serializedTransactionBase64,
      },
      instructions: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG cancel";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
