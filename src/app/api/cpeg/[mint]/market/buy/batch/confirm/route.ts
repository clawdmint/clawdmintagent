import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  signature: z.string().min(32),
  buyer: z.string().min(32),
  peg_ids: z.array(z.number().int().min(0)).min(1).max(6),
  trade_indices: z.array(z.union([z.string(), z.number()])).optional(),
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

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: { standardMode: true },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }
  if (launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
    return NextResponse.json(
      { success: false, error: "Legacy custom cPEG batch buys are disabled. This market only supports Metaplex Hybrid cPEGs." },
      { status: 410 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: "Metaplex Hybrid cPEG batch buy confirm is disabled. Confirm each Core asset purchase through the single-buy endpoint.",
    },
    { status: 400 }
  );
}
