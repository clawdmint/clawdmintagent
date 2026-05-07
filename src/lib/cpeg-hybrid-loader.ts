import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_POOL,
  type HybridAgentRecord,
  type HybridLaunchSnapshot,
} from "@/lib/cpeg-hybrid-engine";

export interface HybridLoadResult {
  launch: HybridLaunchSnapshot & {
    standardMode: string;
    creatorAddress: string;
    authorityAddress: string;
    cluster: string;
  };
  agent: HybridAgentRecord;
}

export async function loadHybridLaunchAndAgent(tokenMint: string): Promise<HybridLoadResult | null> {
  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint },
    select: {
      id: true,
      name: true,
      symbol: true,
      tokenMint: true,
      agentTokenMint: true,
      agentId: true,
      hybridCoreCollectionAddress: true,
      hybridEscrowAddress: true,
      hybridStatus: true,
      pegUnitRaw: true,
      maxPegs: true,
      rendererId: true,
      rendererVersion: true,
      collectionSeed: true,
      standardMode: true,
      creatorAddress: true,
      authorityAddress: true,
      cluster: true,
    },
  });
  if (!launch || !launch.agentId) return null;

  const agent = await prisma.agent.findUnique({
    where: { id: launch.agentId },
    select: {
      id: true,
      name: true,
      solanaWalletAddress: true,
      solanaWalletEncryptedKey: true,
    },
  });
  if (!agent) return null;

  return {
    launch: {
      id: launch.id,
      name: launch.name,
      symbol: launch.symbol,
      tokenMint: launch.tokenMint,
      agentTokenMint: launch.agentTokenMint,
      hybridCoreCollectionAddress: launch.hybridCoreCollectionAddress,
      hybridEscrowAddress: launch.hybridEscrowAddress,
      hybridStatus: launch.hybridStatus,
      pegUnitRaw: launch.pegUnitRaw,
      maxPegs: launch.maxPegs,
      rendererId: launch.rendererId,
      rendererVersion: launch.rendererVersion,
      collectionSeed: launch.collectionSeed,
      standardMode: launch.standardMode,
      creatorAddress: launch.creatorAddress,
      authorityAddress: launch.authorityAddress,
      cluster: launch.cluster,
    },
    agent,
  };
}

export async function loadHybridAssetCounts(launchId: string) {
  const grouped = await prisma.clawPegHybridAsset.groupBy({
    by: ["status"],
    where: { launchId },
    _count: { _all: true },
  });
  let total = 0;
  let owned = 0;
  let pool = 0;
  for (const row of grouped) {
    const count = row._count._all;
    total += count;
    if (row.status === CPEG_HYBRID_ASSET_STATUS_OWNED) owned += count;
    else if (row.status === CPEG_HYBRID_ASSET_STATUS_POOL) pool += count;
  }
  return { total, owned, pool };
}

export async function listHybridAssetPegIds(launchId: string): Promise<Set<number>> {
  const rows = await prisma.clawPegHybridAsset.findMany({
    where: { launchId },
    select: { pegId: true },
  });
  return new Set(rows.map((row) => row.pegId));
}
