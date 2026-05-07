import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  buildCaptureTransferInstructions,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  wallet: z.string().min(32),
  count: z.number().int().min(1).max(8).default(1),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PrepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = await loadHybridLaunchAndAgent(params.mint);
    if (!data) {
      return NextResponse.json({ success: false, error: "cPEG hybrid launch not found" }, { status: 404 });
    }
    if (data.launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      return NextResponse.json(
        { success: false, error: "This launch does not use the Metaplex hybrid path" },
        { status: 400 }
      );
    }
    if (data.launch.hybridStatus !== CPEG_HYBRID_STATUS_CONFIGURED) {
      return NextResponse.json(
        { success: false, error: "Hybrid setup is not complete for this launch yet" },
        { status: 409 }
      );
    }

    const result = await buildCaptureTransferInstructions(
      data.agent,
      {
        id: data.launch.id,
        name: data.launch.name,
        symbol: data.launch.symbol,
        tokenMint: data.launch.tokenMint,
        agentTokenMint: data.launch.agentTokenMint,
        hybridCoreCollectionAddress: data.launch.hybridCoreCollectionAddress,
        hybridEscrowAddress: data.launch.hybridEscrowAddress,
        hybridStatus: data.launch.hybridStatus,
        pegUnitRaw: data.launch.pegUnitRaw,
        maxPegs: data.launch.maxPegs,
        rendererId: data.launch.rendererId,
        rendererVersion: data.launch.rendererVersion,
        collectionSeed: data.launch.collectionSeed,
      },
      parsed.data.wallet,
      parsed.data.count
    );

    return NextResponse.json({
      success: true,
      capture: {
        token_mint: data.launch.tokenMint,
        cluster: data.launch.cluster,
        wallet: parsed.data.wallet,
        count: parsed.data.count,
        amount_raw: result.amountRaw,
        peg_unit_raw: data.launch.pegUnitRaw,
        decimals: result.decimals,
        token_program_id: result.tokenProgramId,
        vault_token_account: result.vaultAta,
        vault_owner: result.vaultOwner,
        user_token_account: result.userAta,
      },
      instructions: result.instructions,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare hybrid capture";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
