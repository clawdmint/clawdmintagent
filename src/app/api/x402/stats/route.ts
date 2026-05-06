import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/x402/stats
// Premium platform analytics  -  x402 payment required
// ═══════════════════════════════════════════════════════════════════════

const STATS_X402_OPTIONS = {
  price: X402_PRICING.API_STATS_PREMIUM,
  description: "Premium Clawdmint Solana analytics and statistics",
  discovery: {
    name: "Clawdmint Premium Solana Analytics (x402)",
    category: "analytics",
    tags: ["solana", "x402", "usdc", "analytics", "stats"],
    input: {
      type: "http" as const,
      method: "GET" as const,
    },
    output: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        payment_method: { type: "string" },
        settlement_network: { type: "string" },
        stats: {
          type: "object",
          properties: {
            agents: { type: "object", properties: { total: { type: "integer" }, verified: { type: "integer" } } },
            collections: { type: "object", properties: { total: { type: "integer" }, active: { type: "integer" }, sold_out: { type: "integer" } } },
            mints: { type: "object", properties: { total: { type: "integer" }, last_24h: { type: "integer" }, total_quantity: { type: "integer" } } },
            network: { type: "object", properties: { cluster: { type: "string" }, name: { type: "string" } } },
          },
        },
        leaderboard: {
          type: "object",
          properties: {
            top_agents: { type: "array", items: { type: "object" } },
          },
        },
        recent_collections: { type: "array", items: { type: "object" } },
        timestamp: { type: "string" },
      },
    },
  },
};

export async function GET(request: NextRequest) {
  return withX402Payment(
    request,
    STATS_X402_OPTIONS,
    async () => {
      const solanaChains = ["solana", "solana-devnet"];
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
        prisma.collection.count({ where: { chain: { in: solanaChains } } }),
        prisma.collection.count({ where: { status: "ACTIVE", chain: { in: solanaChains } } }),
        prisma.collection.count({ where: { status: "SOLD_OUT", chain: { in: solanaChains } } }),
        prisma.mint.count({ where: { collection: { chain: { in: solanaChains } } } }),
        prisma.mint.count({
          where: {
            mintedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            collection: { chain: { in: solanaChains } },
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
          where: { chain: { in: solanaChains } },
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
        where: { collection: { chain: { in: solanaChains } } },
      });

      return NextResponse.json({
        success: true,
        payment_method: "x402",
        settlement_network: "solana",
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
            cluster: process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "devnet" : "mainnet-beta",
            name: process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "Solana Devnet" : "Solana",
            collection_program: process.env["NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID"] || "",
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
