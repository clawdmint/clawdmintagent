import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildClawPegTransferPegManifest } from "@/lib/clawpeg";

export const dynamic = "force-dynamic";

const TransferManifestSchema = z.object({
  source_owner: z.string().min(32),
  destination_owner: z.string().min(32),
  source_token_account: z.string().min(32),
  destination_token_account: z.string().min(32),
  token_mint: z.string().min(32),
  peg_id: z.number().int().min(0),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = TransferManifestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const manifest = buildClawPegTransferPegManifest({
    sourceOwner: input.source_owner,
    destinationOwner: input.destination_owner,
    sourceTokenAccount: input.source_token_account,
    destinationTokenAccount: input.destination_token_account,
    tokenMint: input.token_mint,
    pegId: input.peg_id,
  });

  return NextResponse.json({
    success: true,
    standard: "ClawPEG",
    symbol: "cPEG",
    transfer: {
      peg_id: input.peg_id,
      token_mint: input.token_mint,
      source_owner: input.source_owner,
      destination_owner: input.destination_owner,
    },
    manifest,
  });
}
