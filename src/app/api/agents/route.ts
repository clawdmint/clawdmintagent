import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";
import { filterVisiblePublicCollections, PUBLIC_COLLECTION_STATUSES } from "@/lib/public-collections";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

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
    const [agents, total, publicCollections] = await Promise.all([
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
    ]);

    const collectionCountByAgent = filterVisiblePublicCollections(publicCollections).reduce(
      (map, collection) => {
        map.set(collection.agentId, (map.get(collection.agentId) || 0) + 1);
        return map;
      },
      new Map<string, number>(),
    );

    return NextResponse.json({
      success: true,
      agents: agents.map((a) => ({
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
        verified_at: a.verifiedAt?.toISOString(),
        created_at: a.createdAt.toISOString(),
      })),
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
