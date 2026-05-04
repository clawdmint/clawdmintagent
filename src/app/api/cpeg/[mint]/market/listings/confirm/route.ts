import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  signature: z.string().min(32),
  listing_address: z.string().min(32),
  escrow_owner_peg_address: z.string().min(32),
  escrow_token_account: z.string().min(32),
  peg_record_address: z.string().min(32),
  seller: z.string().min(32),
  peg_id: z.number().int().min(0),
  price_lamports: z.string().regex(/^\d+$/),
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
  if (!launch?.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }

  const input = parsed.data;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "ClawPegMarketListing" (
      "id", "launchId", "tokenMint", "collectionAddress", "listingAddress",
      "escrowOwnerPegAddress", "escrowTokenAccount", "pegRecordAddress", "pegId",
      "sellerAddress", "priceLamports", "marketplaceFeeBps", "royaltyBps",
      "status", "listTxHash", "listedAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${randomUUID()}, ${launch.id}, ${launch.tokenMint}, ${launch.collectionAddress}, ${input.listing_address},
      ${input.escrow_owner_peg_address}, ${input.escrow_token_account}, ${input.peg_record_address}, ${input.peg_id},
      ${input.seller}, ${input.price_lamports}, ${launch.marketplaceFeeBps}, ${launch.royaltyBps},
      ${"ACTIVE"}, ${input.signature}, NOW(), NOW(), NOW()
    )
    ON CONFLICT ("tokenMint", "pegId") DO UPDATE SET
      "listingAddress" = EXCLUDED."listingAddress",
      "escrowOwnerPegAddress" = EXCLUDED."escrowOwnerPegAddress",
      "escrowTokenAccount" = EXCLUDED."escrowTokenAccount",
      "pegRecordAddress" = EXCLUDED."pegRecordAddress",
      "sellerAddress" = EXCLUDED."sellerAddress",
      "priceLamports" = EXCLUDED."priceLamports",
      "marketplaceFeeBps" = EXCLUDED."marketplaceFeeBps",
      "royaltyBps" = EXCLUDED."royaltyBps",
      "status" = EXCLUDED."status",
      "listTxHash" = EXCLUDED."listTxHash",
      "buyerAddress" = NULL,
      "buyTxHash" = NULL,
      "cancelTxHash" = NULL,
      "listedAt" = NOW(),
      "soldAt" = NULL,
      "cancelledAt" = NULL,
      "updatedAt" = NOW()
    RETURNING "id"
  `;

  return NextResponse.json({ success: true, listing: rows[0] });
}
