import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/agents/[id]
// Public endpoint - Get single agent details
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        collections: {
          where: { status: { in: ["ACTIVE", "SOLD_OUT"] } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            address: true,
            name: true,
            symbol: true,
            imageUrl: true,
            maxSupply: true,
            totalMinted: true,
            mintPrice: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agent || agent.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatar_url: agent.avatarUrl,
        eoa: agent.eoa,
        x_handle: agent.xHandle,
        verified_at: agent.verifiedAt?.toISOString(),
        collections: agent.collections.map((c) => ({
          id: c.id,
          address: c.address,
          name: c.name,
          symbol: c.symbol,
          image_url: c.imageUrl,
          max_supply: c.maxSupply,
          total_minted: c.totalMinted,
          mint_price_wei: c.mintPrice,
          status: c.status,
          created_at: c.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Get agent error:", error);
    return NextResponse.json(
      { error: "Failed to get agent" },
      { status: 500 }
    );
  }
}
