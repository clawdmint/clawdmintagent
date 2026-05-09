import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Connection } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  confirmReleasePayout,
} from "@/lib/cpeg-hybrid-engine";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import {
  loadHybridAssetCounts,
  loadHybridLaunchAndAgent,
} from "@/lib/cpeg-hybrid-loader";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  wallet: z.string().min(32),
  asset_address: z.string().min(32),
  release_signature: z.string().min(32),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = ConfirmSchema.safeParse(body);
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
    const asset = await prisma.clawPegHybridAsset.findUnique({
      where: { assetAddress: parsed.data.asset_address },
    });
    if (!asset || asset.launchId !== data.launch.id) {
      return NextResponse.json({ success: false, error: "Asset is not part of this hybrid launch" }, { status: 404 });
    }
    if (asset.status === CPEG_HYBRID_ASSET_STATUS_POOL) {
      return NextResponse.json({ success: true, already_released: true });
    }
    if (asset.ownerAddress !== parsed.data.wallet || asset.status !== CPEG_HYBRID_ASSET_STATUS_OWNED) {
      return NextResponse.json(
        { success: false, error: "Asset is not owned by this wallet" },
        { status: 403 }
      );
    }

    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const status = await connection.getSignatureStatus(parsed.data.release_signature, {
      searchTransactionHistory: true,
    });
    if (!status.value || status.value.err) {
      return NextResponse.json(
        { success: false, error: "Release transfer transaction is not confirmed on the configured cluster" },
        { status: 400 }
      );
    }

    const payout = await confirmReleasePayout(
      data.agent,
      {
        id: data.launch.id,
        name: data.launch.name,
        symbol: data.launch.symbol,
        cluster: data.launch.cluster,
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
      parsed.data.asset_address
    );

    await prisma.clawPegHybridAsset.update({
      where: { assetAddress: parsed.data.asset_address },
      data: {
        ownerAddress: data.agent.solanaWalletAddress || asset.ownerAddress,
        status: CPEG_HYBRID_ASSET_STATUS_POOL,
        releaseTxHash: parsed.data.release_signature,
        releasedAt: new Date(),
      },
    });

    const counts = await loadHybridAssetCounts(data.launch.id);

    return NextResponse.json({
      success: true,
      release: {
        asset_address: parsed.data.asset_address,
        peg_id: asset.pegId,
        token_payout_signature: payout.payoutTxSignature,
        release_signature: parsed.data.release_signature,
        token_mint: data.launch.tokenMint,
      },
      counts,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to confirm hybrid release";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
