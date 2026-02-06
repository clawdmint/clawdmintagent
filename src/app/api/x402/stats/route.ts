import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/x402/stats
// Premium platform analytics — x402 payment required
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: X402_PRICING.API_STATS_PREMIUM,
      description: "Premium Clawdmint platform analytics and statistics",
    },
    async () => {
      // Get comprehensive stats
      const [
        totalAgents,
        verifiedAgents,
        totalCollections,
        activeCollections,
        soldOutCollections,
        totalMints,
        recentMints,
        topAgents,
        recentCollections,
      ] = await Promise.all([
        prisma.agent.count(),
        prisma.agent.count({ where: { status: "VERIFIED" } }),
        prisma.collection.count(),
        prisma.collection.count({ where: { status: "ACTIVE" } }),
        prisma.collection.count({ where: { status: "SOLD_OUT" } }),
        prisma.mint.count(),
        prisma.mint.count({
          where: {
            mintedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.agent.findMany({
          where: { status: "VERIFIED" },
          include: {
            _count: { select: { collections: true } },
          },
          orderBy: { collections: { _count: "desc" } },
          take: 10,
        }),
        prisma.collection.findMany({
          include: {
            agent: { select: { name: true, avatarUrl: true } },
            _count: { select: { mints: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

      // Calculate total volume
      const volumeResult = await prisma.mint.aggregate({
        _sum: { quantity: true },
      });

      return NextResponse.json({
        success: true,
        payment_method: "x402",
        stats: {
          agents: {
            total: totalAgents,
            verified: verifiedAgents,
          },
          collections: {
            total: totalCollections,
            active: activeCollections,
            sold_out: soldOutCollections,
          },
          mints: {
            total: totalMints,
            last_24h: recentMints,
            total_quantity: volumeResult._sum.quantity || 0,
          },
          network: {
            chain_id: parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453"),
            name: process.env["NEXT_PUBLIC_CHAIN_ID"] === "84532" ? "Base Sepolia" : "Base",
            factory: process.env["NEXT_PUBLIC_FACTORY_ADDRESS"] || "",
          },
        },
        leaderboard: {
          top_agents: topAgents.map((a) => ({
            id: a.id,
            name: a.name,
            avatar_url: a.avatarUrl,
            collection_count: a._count.collections,
          })),
        },
        recent_collections: recentCollections.map((c) => ({
          id: c.id,
          address: c.address,
          name: c.name,
          image_url: c.imageUrl,
          total_minted: c.totalMinted,
          max_supply: c.maxSupply,
          mint_count: c._count.mints,
          status: c.status,
          agent_name: c.agent.name,
          created_at: c.createdAt.toISOString(),
        })),
        timestamp: new Date().toISOString(),
      });
    }
  );
}
