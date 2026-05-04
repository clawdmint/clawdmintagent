import { NextRequest, NextResponse } from "next/server";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { buildClawPegCancelPegEscrowManifest } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";

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
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
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

    const seller = new PublicKey(parsed.data.seller);
    const mint = new PublicKey(launch.tokenMint);
    const sellerTokenAccount = getAssociatedTokenAddressSync(mint, seller, false, TOKEN_2022_PROGRAM_ID);
    const manifest = buildClawPegCancelPegEscrowManifest({
      seller: seller.toBase58(),
      tokenMint: launch.tokenMint,
      sellerTokenAccount: sellerTokenAccount.toBase58(),
      escrowTokenAccount: listing.escrowTokenAccount,
      pegId: listing.pegId,
    });
    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        peg_id: listing.pegId,
        seller_token_account: sellerTokenAccount.toBase58(),
        escrow_token_account: listing.escrowTokenAccount,
      },
      instructions: [manifest],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG cancel";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
