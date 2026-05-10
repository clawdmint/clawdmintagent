import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  setupHybridLaunch,
} from "@/lib/cpeg-hybrid-engine";
import {
  loadHybridLaunchAndAgent,
  loadHybridAssetCounts,
} from "@/lib/cpeg-hybrid-loader";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";

export const dynamic = "force-dynamic";

const SetupSchema = z.object({
  authority_address: z.string().min(32).optional(),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = SetupSchema.safeParse(body);
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
        { success: false, error: "Setup is only available for Metaplex hybrid launches" },
        { status: 400 }
      );
    }
    if (parsed.data.authority_address && parsed.data.authority_address !== data.launch.authorityAddress) {
      return NextResponse.json(
        { success: false, error: "authority_address does not match the launch authority" },
        { status: 403 }
      );
    }

    const result = await setupHybridLaunch(data.agent, {
      id: data.launch.id,
      name: data.launch.name,
      symbol: data.launch.symbol,
      cluster: data.launch.cluster,
      tokenMint: data.launch.tokenMint,
      agentTokenMint: data.launch.agentTokenMint,
      hybridCoreCollectionAddress: data.launch.hybridCoreCollectionAddress,
      hybridEscrowAddress: data.launch.hybridEscrowAddress,
      hybridProgramId: data.launch.hybridProgramId,
      hybridStatus: data.launch.hybridStatus,
      feeVaultAddress: data.launch.feeVaultAddress,
      pegUnitRaw: data.launch.pegUnitRaw,
      maxPegs: data.launch.maxPegs,
      rendererId: data.launch.rendererId,
      rendererVersion: data.launch.rendererVersion,
      collectionSeed: data.launch.collectionSeed,
    });

    const updated = await prisma.clawPegLaunch.update({
      where: { id: data.launch.id },
      data: {
        hybridCoreCollectionAddress: result.collectionAddress,
        hybridAssetCollectionAddress: result.collectionAddress,
        hybridEscrowAddress: result.escrowAddress,
        hybridStatus: CPEG_HYBRID_STATUS_CONFIGURED,
        hybridSetupTxHash: result.setupTxSignature || undefined,
        hybridConfiguredAt: new Date(),
        status: "ACTIVE",
        collectionAddress: result.collectionAddress,
      },
      select: {
        id: true,
        hybridCoreCollectionAddress: true,
        hybridEscrowAddress: true,
        hybridStatus: true,
        hybridSetupTxHash: true,
        hybridConfiguredAt: true,
        status: true,
      },
    });

    const counts = await loadHybridAssetCounts(data.launch.id);

    return NextResponse.json({
      success: true,
      launch: {
        id: updated.id,
        token_mint: data.launch.tokenMint,
        collection_address: updated.hybridCoreCollectionAddress,
        hybrid_escrow_address: updated.hybridEscrowAddress,
        hybrid_escrow_account_initialized: result.escrowAccountInitialized,
        vault_token_account: result.escrowTokenAccount,
        vault_token_account_initialized: result.escrowTokenAccountInitialized,
        vault_owner: result.vaultOwner,
        token_program_id: result.tokenProgramId,
        hybrid_status: updated.hybridStatus,
        setup_tx_signature: updated.hybridSetupTxHash,
        configured_at: updated.hybridConfiguredAt,
        status: updated.status,
        assets: counts,
      },
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to set up hybrid launch";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
