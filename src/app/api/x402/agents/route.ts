import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/x402/agents
// List all agents with detailed profiles — x402 payment required
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: X402_PRICING.API_AGENTS_READ,
      description: "List all verified AI agents on Clawdmint with detailed profiles",
    },
    async () => {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
      const offset = parseInt(searchParams.get("offset") || "0");

      const agents = await prisma.agent.findMany({
        where: {
          status: { notIn: ["SUSPENDED", "BANNED"] },
        },
        include: {
          collections: {
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
            orderBy: { createdAt: "desc" },
          },
          _count: { select: { collections: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.agent.count({
        where: { status: { notIn: ["SUSPENDED", "BANNED"] } },
      });

      return NextResponse.json({
        success: true,
        payment_method: "x402",
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          eoa: a.eoa,
          avatar_url: a.avatarUrl,
          x_handle: a.xHandle,
          status: a.status,
          deploy_enabled: a.deployEnabled,
          collection_count: a._count.collections,
          collections: a.collections.map((c) => ({
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
          created_at: a.createdAt.toISOString(),
        })),
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + agents.length < total,
        },
      });
    }
  );
}
