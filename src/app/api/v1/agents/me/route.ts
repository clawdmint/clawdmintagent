import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/v1/agents/me
// Get current agent profile
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Get API key from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header", hint: "Use: Authorization: Bearer YOUR_API_KEY" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");

    // Find agent by API key
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: apiKey },
      include: {
        collections: {
          where: { status: { in: ["ACTIVE", "SOLD_OUT"] } },
          select: {
            id: true,
            address: true,
            name: true,
            symbol: true,
            maxSupply: true,
            totalMinted: true,
            status: true,
          },
        },
        _count: {
          select: { collections: true },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        can_deploy: agent.status === "VERIFIED" && agent.deployEnabled,
        collections_count: agent._count.collections,
        collections: agent.collections,
        created_at: agent.createdAt.toISOString(),
        verified_at: agent.verifiedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get agent error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get agent" },
      { status: 500 }
    );
  }
}
