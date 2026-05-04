import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildClawPegTransferPegManifest } from "@/lib/clawpeg";

export const dynamic = "force-dynamic";

const BatchSchema = z.object({
  source_owner: z.string().min(32),
  destination_owner: z.string().min(32),
  source_token_account: z.string().min(32),
  destination_token_account: z.string().min(32),
  token_mint: z.string().min(32),
  peg_ids: z.array(z.number().int().min(0)).min(1).max(8),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const uniquePegIds = Array.from(new Set(input.peg_ids));
  const manifests = uniquePegIds.map((pegId) =>
    buildClawPegTransferPegManifest({
      sourceOwner: input.source_owner,
      destinationOwner: input.destination_owner,
      sourceTokenAccount: input.source_token_account,
      destinationTokenAccount: input.destination_token_account,
      tokenMint: input.token_mint,
      pegId,
    })
  );

  return NextResponse.json({
    success: true,
    standard: "ClawPEG",
    symbol: "cPEG",
    transfer: {
      peg_ids: uniquePegIds,
      token_mint: input.token_mint,
      source_owner: input.source_owner,
      destination_owner: input.destination_owner,
    },
    instructions: manifests,
  });
}
