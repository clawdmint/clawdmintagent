import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

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
