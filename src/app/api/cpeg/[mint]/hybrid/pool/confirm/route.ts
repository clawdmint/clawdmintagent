import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  buildHybridStateSummary,
  fetchHybridCoreAssetOwner,
  getMplHybridCustodyTarget,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridAssetCounts, loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { syncMetaplexHybridPoolAssets } from "@/lib/cpeg-hybrid-inventory";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { deriveMplHybridNftDataPda } from "@/lib/mpl-hybrid-native";
import { getClawPegRpcUrl } from "@/lib/env";
import { getMetaplexCoreConnection } from "@/lib/synapse-sap";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  authority_address: z.string().min(32),
  signature: z.string().min(32),
  assets: z.array(
    z.object({
      asset_address: z.string().min(32),
      peg_id: z.number().int().min(1),
      nft_data_address: z.string().min(32).optional(),
    })
  ).min(1).max(3),
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
        { success: false, error: "Pool confirmation is only available for Metaplex hybrid launches" },
        { status: 400 }
      );
    }
    if (data.launch.cluster !== "mainnet-beta") {
      return NextResponse.json(
        { success: false, error: "Agent PEG pool confirmation is mainnet-only." },
        { status: 409 }
      );
    }
    if (data.launch.hybridStatus !== CPEG_HYBRID_STATUS_CONFIGURED) {
      return NextResponse.json(
        { success: false, error: "Run Enable cPEG before funding the Agent PEG pool." },
        { status: 409 }
      );
    }
    if (parsed.data.authority_address !== data.launch.authorityAddress) {
      return NextResponse.json(
        { success: false, error: "authority_address does not match the launch authority" },
        { status: 403 }
      );
    }
    if (!data.launch.hybridCoreCollectionAddress) {
      return NextResponse.json(
        { success: false, error: "Metaplex Hybrid collection is missing." },
        { status: 409 }
      );
    }

    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const status = await connection.getSignatureStatus(parsed.data.signature, {
      searchTransactionHistory: true,
    });
    if (!status.value || status.value.err) {
      return NextResponse.json(
        { success: false, error: "Agent PEG pool funding transaction is not confirmed on mainnet" },
        { status: 400 }
      );
    }

    const counts = await loadHybridAssetCounts(data.launch.id);
    const summary = await buildHybridStateSummary(data.agent, data.launch, counts);
    const custody = getMplHybridCustodyTarget(data.launch, summary.tokenProgramId);
    if (!custody.isNativeReady || !custody.escrowAddress) {
      return NextResponse.json(
        { success: false, error: "Metaplex Hybrid escrow is not initialized." },
        { status: 409 }
      );
    }

    const coreConnection = getMetaplexCoreConnection({ commitment: "confirmed" });
    const updated = [];
    for (const asset of parsed.data.assets) {
      const onChainOwner = await fetchHybridCoreAssetOwner(asset.asset_address).catch(() => null);
      if (onChainOwner !== custody.escrowAddress) {
        throw new CpegHybridEngineError(409, `Agent PEG #${asset.peg_id} is not owned by the Hybrid escrow`, {
          asset: asset.asset_address,
          expected_owner: custody.escrowAddress,
          on_chain_owner: onChainOwner,
        });
      }
      const nftData = deriveMplHybridNftDataPda(
        new PublicKey(asset.asset_address),
        data.launch.hybridProgramId || undefined
      );
      const nftDataInfo = await coreConnection.getAccountInfo(nftData, "confirmed");
      if (!nftDataInfo) {
        throw new CpegHybridEngineError(409, `Agent PEG #${asset.peg_id} is missing MPL-Hybrid NFT data`, {
          asset: asset.asset_address,
          expected_nft_data: nftData.toBase58(),
        });
      }
      const row = await prisma.clawPegHybridAsset.upsert({
        where: { assetAddress: asset.asset_address },
        update: {
          ownerAddress: custody.escrowAddress,
          status: CPEG_HYBRID_ASSET_STATUS_POOL,
          collectionAddress: data.launch.hybridCoreCollectionAddress,
        },
        create: {
          launchId: data.launch.id,
          tokenMint: data.launch.tokenMint,
          collectionAddress: data.launch.hybridCoreCollectionAddress,
          assetAddress: asset.asset_address,
          pegId: asset.peg_id,
          ownerAddress: custody.escrowAddress,
          status: CPEG_HYBRID_ASSET_STATUS_POOL,
        },
        select: { assetAddress: true, pegId: true, status: true },
      });
      updated.push({
        asset_address: row.assetAddress,
        peg_id: row.pegId,
        status: row.status,
        nft_data_address: nftData.toBase58(),
      });
    }

    const sync = await syncMetaplexHybridPoolAssets({
      launchId: data.launch.id,
      tokenMint: data.launch.tokenMint,
      collectionAddress: data.launch.hybridCoreCollectionAddress,
      configuredEscrowAddress: custody.escrowAddress,
      hybridProgramId: data.launch.hybridProgramId,
      maxPegs: summary.effectiveMaxPegs,
    }).catch((error) => ({
      synced: 0,
      updated: 0,
      skipped: 0,
      escrowAddress: custody.escrowAddress,
      warning: error instanceof Error ? error.message : "Pool sync failed",
    }));
    const refreshedCounts = await loadHybridAssetCounts(data.launch.id);

    return NextResponse.json({
      success: true,
      signature: parsed.data.signature,
      assets: updated,
      counts: refreshedCounts,
      pool_sync: sync,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to confirm Agent PEG pool funding";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
