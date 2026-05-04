import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { findClawPegCollectionAddress, findTradeArtRecordAddress } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  signature: z.string().min(32),
  buyer: z.string().min(32),
  peg_ids: z.array(z.number().int().min(0)).min(1).max(6),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const parsed = ConfirmSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const launch = await prisma.clawPegLaunch.findUnique({ where: { tokenMint: params.mint } });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }
  const uniquePegIds = Array.from(new Set(parsed.data.peg_ids));
  const idList = Prisma.join(uniquePegIds);
  const rows = await prisma.$queryRaw<Array<{ id: string; pegId: number }>>`
    UPDATE "ClawPegMarketListing"
    SET "status" = ${"FILLED"},
      "buyerAddress" = ${parsed.data.buyer},
      "buyTxHash" = ${parsed.data.signature},
      "soldAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "tokenMint" = ${launch.tokenMint}
      AND "pegId" IN (${idList})
      AND "status" = ${"ACTIVE"}
    RETURNING "id", "pegId"
  `;
  // Each fill in this batch atomically wrote its own deterministic trade-art via CPI from
  // cpeg-market::buy -> clawpeg::record_trade_art. Surface the PDA + image URL for each so
  // the client can render a "your batch produced this art" gallery immediately.
  const collectionAddress = findClawPegCollectionAddress(launch.tokenMint).toBase58();
  const trade_art = parsed.data.peg_ids.map((pegId) => ({
    peg_id: pegId,
    trade_index: pegId,
    address: findTradeArtRecordAddress(collectionAddress, BigInt(pegId)).toBase58(),
    image_url: `/api/cpeg/${launch.tokenMint}/trade-art/${pegId}/svg`,
  }));
  return NextResponse.json({ success: true, listings: rows, trade_art });
}
