import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where: statusFilter,
        include: {
          _count: {
            select: { collections: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.agent.count({ where: statusFilter }),
    ]);

    return NextResponse.json({
      success: true,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        avatar_url: a.avatarUrl,
        eoa: a.eoa,
        x_handle: a.xHandle,
        status: a.status,
        collections_count: a._count.collections,
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
