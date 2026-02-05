import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/stats
// Public endpoint - Get platform statistics + recent activity
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeActivity = searchParams.get("activity") === "true";

    // Get verified agents count
    const verifiedAgentsCount = await prisma.agent.count({
      where: { status: "VERIFIED" },
    });

    // Get active collections count (status: ACTIVE or SOLD_OUT)
    const collectionsCount = await prisma.collection.count({
      where: { 
        status: { in: ["ACTIVE", "SOLD_OUT"] }
      },
    });

    // Get total NFTs minted (sum of totalMinted across all collections)
    const mintedResult = await prisma.collection.aggregate({
      _sum: { totalMinted: true },
    });
    const totalMinted = mintedResult._sum.totalMinted || 0;

    // Recent activity feed
    let recent_activity: Array<Record<string, unknown>> = [];

    if (includeActivity) {
      // Get recent mints
      const recentMints = await prisma.mint.findMany({
        take: 10,
        orderBy: { mintedAt: "desc" },
        include: {
          collection: {
            select: {
              name: true,
              symbol: true,
              address: true,
              imageUrl: true,
              agent: {
                select: { name: true },
              },
            },
          },
        },
      });

      // Get recently deployed collections
      const recentDeploys = await prisma.collection.findMany({
        take: 5,
        where: { status: { in: ["ACTIVE", "SOLD_OUT"] } },
        orderBy: { deployedAt: "desc" },
        select: {
          name: true,
          symbol: true,
          address: true,
          imageUrl: true,
          deployedAt: true,
          agent: {
            select: { name: true },
          },
        },
      });

      // Merge and sort by time
      const mintEvents = recentMints.map((m) => ({
        type: "mint" as const,
        time: m.mintedAt.toISOString(),
        minter: `${m.minterAddress.slice(0, 6)}...${m.minterAddress.slice(-4)}`,
        quantity: m.quantity,
        collection_name: m.collection.name,
        collection_symbol: m.collection.symbol,
        collection_address: m.collection.address,
        collection_image: m.collection.imageUrl,
        agent_name: m.collection.agent.name,
        tx_hash: m.txHash,
      }));

      const deployEvents = recentDeploys
        .filter((c) => c.deployedAt)
        .map((c) => ({
          type: "deploy" as const,
          time: c.deployedAt!.toISOString(),
          collection_name: c.name,
          collection_symbol: c.symbol,
          collection_address: c.address,
          collection_image: c.imageUrl,
          agent_name: c.agent.name,
        }));

      recent_activity = [...mintEvents, ...deployEvents]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 10);
    }

    // Trending collections (most minted in last 7 days)
    let trending: Array<Record<string, unknown>> = [];

    if (includeActivity) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get collections with recent mint activity
      const trendingCollections = await prisma.collection.findMany({
        where: {
          status: { in: ["ACTIVE", "SOLD_OUT"] },
          mints: {
            some: { mintedAt: { gte: sevenDaysAgo } },
          },
        },
        select: {
          name: true,
          symbol: true,
          address: true,
          imageUrl: true,
          mintPrice: true,
          maxSupply: true,
          totalMinted: true,
          status: true,
          agent: {
            select: { name: true, avatarUrl: true },
          },
          _count: {
            select: {
              mints: {
                where: { mintedAt: { gte: sevenDaysAgo } },
              } as never,
            },
          },
          mints: {
            where: { mintedAt: { gte: sevenDaysAgo } },
            select: { quantity: true },
          },
        },
        take: 6,
      });

      // Sort by recent mint quantity
      trending = trendingCollections
        .map((c) => ({
          name: c.name,
          symbol: c.symbol,
          address: c.address,
          image_url: c.imageUrl,
          mint_price: c.mintPrice,
          max_supply: c.maxSupply,
          total_minted: c.totalMinted,
          status: c.status,
          agent_name: c.agent.name,
          agent_avatar: c.agent.avatarUrl,
          recent_mints: c.mints.reduce((sum, m) => sum + m.quantity, 0),
        }))
        .sort((a, b) => b.recent_mints - a.recent_mints);
    }

    return NextResponse.json({
      success: true,
      stats: {
        verified_agents: verifiedAgentsCount,
        collections: collectionsCount,
        nfts_minted: totalMinted,
      },
      ...(includeActivity && { recent_activity, trending }),
    });
  } catch (error) {
    console.error("[Stats] Error:", error);
    return NextResponse.json({
      success: false,
      stats: {
        verified_agents: 0,
        collections: 0,
        nfts_minted: 0,
      },
    });
  }
}
