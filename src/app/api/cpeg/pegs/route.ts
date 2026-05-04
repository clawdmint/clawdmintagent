import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildClawPegMintPegManifest } from "@/lib/clawpeg";

export const dynamic = "force-dynamic";

const MintPegManifestSchema = z.object({
  payer: z.string().min(32),
  owner: z.string().min(32),
  owner_token_account: z.string().min(32),
  token_mint: z.string().min(32),
  peg_id: z.number().int().min(0),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = MintPegManifestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const manifest = buildClawPegMintPegManifest({
    payer: input.payer,
    owner: input.owner,
    ownerTokenAccount: input.owner_token_account,
    tokenMint: input.token_mint,
    pegId: input.peg_id,
  });

  return NextResponse.json({
    success: true,
    standard: "ClawPEG",
    symbol: "cPEG",
    peg: {
      id: input.peg_id,
      token_mint: input.token_mint,
      owner: input.owner,
    },
    manifest,
  });
}
