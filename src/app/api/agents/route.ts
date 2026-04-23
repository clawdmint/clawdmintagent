import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";
import { filterVisiblePublicCollections, PUBLIC_COLLECTION_STATUSES } from "@/lib/public-collections";
import { getWalletReputation } from "@/lib/fairscale";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

async function buildReputationMap(wallets: string[]) {
  const uniqueWallets = [...new Set(wallets.map((wallet) => wallet.trim()).filter(Boolean))];
  const reputationMap = new Map<string, Awaited<ReturnType<typeof getWalletReputation>>>();
  const batchSize = 5;

  for (let index = 0; index < uniqueWallets.length; index += batchSize) {
    const batch = uniqueWallets.slice(index, index + batchSize);
    const reputations = await Promise.all(batch.map((wallet) => getWalletReputation(wallet)));

    batch.forEach((wallet, batchIndex) => {
      reputationMap.set(wallet, reputations[batchIndex] ?? null);
    });
  }

  return reputationMap;
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/agents
// Public endpoint - Get all verified agents
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;

    // Get all registered agents (excluding suspended/banned)
    const statusFilter = { status: { notIn: ["SUSPENDED", "BANNED"] } };
    const [agents, total, publicCollections, tokenLaunches] = await Promise.all([
      prisma.agent.findMany({
        where: statusFilter,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.agent.count({ where: statusFilter }),
      prisma.collection.findMany({
        where: {
          chain: { in: SOLANA_COLLECTION_CHAINS },
          status: { in: [...PUBLIC_COLLECTION_STATUSES] },
        },
        select: {
          agentId: true,
          address: true,
        },
      }),
      prisma.tokenLaunch.findMany({
        where: {
          agentId: { not: null },
          chain: { in: ["solana", "solana-devnet"] },
        },
        select: {
          agentId: true,
        },
      }),
    ]);

    const collectionCountByAgent = filterVisiblePublicCollections(publicCollections).reduce(
      (map, collection) => {
        map.set(collection.agentId, (map.get(collection.agentId) || 0) + 1);
        return map;
      },
      new Map<string, number>(),
    );

    const tokenCountByAgent = tokenLaunches.reduce((map, launch) => {
      if (!launch.agentId) return map;
      map.set(launch.agentId, (map.get(launch.agentId) || 0) + 1);
      return map;
    }, new Map<string, number>());

    const reputationMap = await buildReputationMap(
      agents
        .map((agent) => agent.solanaWalletAddress)
        .filter((wallet): wallet is string => Boolean(wallet)),
    );

    const enrichedAgents = agents.map((a) => {
      const reputationWallet = a.solanaWalletAddress || null;
      const reputationSource = a.solanaWalletAddress ? "agent" : null;
      const reputation = reputationWallet ? reputationMap.get(reputationWallet) ?? null : null;

      return {
        id: a.id,
        name: a.name,
        description: a.description,
        avatar_url: a.avatarUrl,
        eoa: a.eoa,
        solana_wallet_address: a.solanaWalletAddress,
        metaplex_registered: Boolean(a.metaplexAssetAddress && a.metaplexIdentityPda),
        metaplex_asset_address: a.metaplexAssetAddress,
        metaplex_identity_pda: a.metaplexIdentityPda,
        x_handle: a.xHandle,
        status: a.status,
        deploy_enabled: a.deployEnabled,
        collections_count: collectionCountByAgent.get(a.id) || 0,
        token_launches_count: tokenCountByAgent.get(a.id) || 0,
        verified_at: a.verifiedAt?.toISOString(),
        created_at: a.createdAt.toISOString(),
        reputation: reputation
          ? {
              wallet_address: reputation.walletAddress,
              source: reputationSource,
              score: reputation.score,
              tier: reputation.tier,
              badges: reputation.badges,
              availability: reputation.availability,
              trust_signal: reputation.trustSignal,
              profile_state: reputation.profileState,
              is_thin_profile: reputation.isThinProfile,
              warning_label: reputation.warningLabel,
              warning_text: reputation.warningText,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      agents: enrichedAgents,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get agents error:", error);
    return NextResponse.json(
      { error: "Failed to get agents" },
      { status: 500 }
    );
  }
}
