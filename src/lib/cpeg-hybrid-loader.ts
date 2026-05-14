import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CPEG_HYBRID_ASSET_STATUS_LISTED,
  CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
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
      agentAssetAddress: true,
      agentWalletAddress: true,
      hybridCoreCollectionAddress: true,
      hybridEscrowAddress: true,
      hybridProgramId: true,
      hybridStatus: true,
      feeVaultAddress: true,
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
  if (!launch) return null;

  // Try the direct foreign key first; fall back to the agent identity persisted
  // on the launch row so launches saved before the linked-agent query was
  // hardened can still resolve their operational signer. When the fallback
  // succeeds we backfill agentId so subsequent calls take the fast path.
  let agent = launch.agentId
    ? await prisma.agent.findUnique({
        where: { id: launch.agentId },
        select: {
          id: true,
          name: true,
          solanaWalletAddress: true,
          solanaWalletEncryptedKey: true,
        },
      })
    : null;

  if (!agent && (launch.agentAssetAddress || launch.agentWalletAddress)) {
    const fallbackOr: Array<Record<string, string>> = [];
    if (launch.agentAssetAddress) fallbackOr.push({ metaplexAssetAddress: launch.agentAssetAddress });
    if (launch.agentWalletAddress) fallbackOr.push({ solanaWalletAddress: launch.agentWalletAddress });
    agent = await prisma.agent
      .findFirst({
        where: {
          status: "VERIFIED",
          deployEnabled: true,
          OR: fallbackOr,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          solanaWalletAddress: true,
          solanaWalletEncryptedKey: true,
        },
      })
      .catch(() => null);
    if (agent) {
      await prisma.clawPegLaunch
        .update({ where: { id: launch.id }, data: { agentId: agent.id } })
        .catch(() => null);
    }
  }

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
      hybridProgramId: launch.hybridProgramId,
      hybridStatus: launch.hybridStatus,
      feeVaultAddress: launch.feeVaultAddress,
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
    if (row.status === CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE) {
      // Pending captures hold a deterministic peg id reservation but are not
      // yet committed on-chain. They MUST NOT reduce the public-facing
      // capacity, otherwise a failed/abandoned capture would shrink
      // "Available cPEGs" until the row's TTL clears.
      continue;
    }
    total += count;
    if (row.status === CPEG_HYBRID_ASSET_STATUS_OWNED) owned += count;
    else if (row.status === CPEG_HYBRID_ASSET_STATUS_POOL || row.status === CPEG_HYBRID_ASSET_STATUS_LISTED) pool += count;
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
