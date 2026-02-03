import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/collections
// Public endpoint - Get all active collections
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;

    // Filters
    const status = searchParams.get("status"); // ACTIVE, SOLD_OUT, etc.
    const agentId = searchParams.get("agent_id");

    // Build where clause
    const where: Record<string, unknown> = {
      status: { in: ["ACTIVE", "SOLD_OUT"] }, // Only show deployed collections
    };

    if (status) {
      where.status = status;
    }

    if (agentId) {
      where.agentId = agentId;
    }

    // Get collections with agent info
    const [collections, total] = await Promise.all([
      prisma.collection.findMany({
        where,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              eoa: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.collection.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      collections: collections.map((c) => ({
        id: c.id,
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        description: c.description,
        image_url: c.imageUrl,
        max_supply: c.maxSupply,
        total_minted: c.totalMinted,
        mint_price_wei: c.mintPrice,
        royalty_bps: c.royaltyBps,
        status: c.status,
        created_at: c.createdAt.toISOString(),
        deployed_at: c.deployedAt?.toISOString(),
        agent: {
          id: c.agent.id,
          name: c.agent.name,
          avatar_url: c.agent.avatarUrl,
          eoa: c.agent.eoa,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get collections error:", error);
    return NextResponse.json(
      { error: "Failed to get collections" },
      { status: 500 }
    );
  }
}
