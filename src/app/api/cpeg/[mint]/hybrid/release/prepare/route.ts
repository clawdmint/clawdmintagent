import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  buildReleaseTransferInstructions,
  fetchHybridCoreAssetOwner,
} from "@/lib/cpeg-hybrid-engine";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  wallet: z.string().min(32),
  asset_address: z.string().min(32),
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
    const asset = await prisma.clawPegHybridAsset.findUnique({
      where: { assetAddress: parsed.data.asset_address },
    });
    if (!asset || asset.launchId !== data.launch.id) {
      return NextResponse.json({ success: false, error: "Asset is not part of this hybrid launch" }, { status: 404 });
    }
    if (asset.ownerAddress !== parsed.data.wallet || asset.status !== CPEG_HYBRID_ASSET_STATUS_OWNED) {
      return NextResponse.json(
        { success: false, error: "Asset is not owned by this wallet" },
        { status: 403 }
      );
    }
    const onChainOwner = await fetchHybridCoreAssetOwner(parsed.data.asset_address);
    if (onChainOwner !== parsed.data.wallet) {
      return NextResponse.json(
        {
          success: false,
          error: "This cPEG is no longer owned by the connected wallet. Refresh the page.",
          details: { on_chain_owner: onChainOwner },
        },
        { status: 409 }
      );
    }
    if (!data.agent.solanaWalletAddress) {
      return NextResponse.json({ success: false, error: "Agent vault wallet is not configured" }, { status: 409 });
    }

    // Validate addresses
    try {
      new PublicKey(parsed.data.wallet);
      new PublicKey(parsed.data.asset_address);
      new PublicKey(data.agent.solanaWalletAddress);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid Solana address in request" }, { status: 400 });
    }

    const transfer = await buildReleaseTransferInstructions(
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
        hybridProgramId: data.launch.hybridProgramId,
        hybridStatus: data.launch.hybridStatus,
        feeVaultAddress: data.launch.feeVaultAddress,
        pegUnitRaw: data.launch.pegUnitRaw,
        maxPegs: data.launch.maxPegs,
        rendererId: data.launch.rendererId,
        rendererVersion: data.launch.rendererVersion,
        collectionSeed: data.launch.collectionSeed,
      },
      parsed.data.wallet,
      parsed.data.asset_address
    );

    return NextResponse.json({
      success: true,
      release: {
        token_mint: data.launch.tokenMint,
        cluster: data.launch.cluster,
        wallet: parsed.data.wallet,
        asset_address: parsed.data.asset_address,
        peg_id: asset.pegId,
        target_owner: transfer.targetOwner,
        collection_address: transfer.collectionAddress,
        serialized_transaction_base64: transfer.serializedTransactionBase64,
      },
      instructions: transfer.instructions,
      serialized_transaction_base64: transfer.serializedTransactionBase64,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare hybrid release";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
