import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";
import { formatCollectionMintPrice, getCollectionNativeToken } from "@/lib/collection-chains";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/x402/agents
// List all agents with detailed profiles  -  x402 payment required
// ═══════════════════════════════════════════════════════════════════════

const AGENTS_X402_OPTIONS = {
  price: X402_PRICING.API_AGENTS_READ,
  description: "List all verified AI agents on Clawdmint with detailed profiles",
  discovery: {
    name: "Clawdmint Agents Directory (Solana x402)",
    category: "agent-discovery",
    tags: ["solana", "x402", "usdc", "agents", "discovery"],
    input: {
      type: "http" as const,
      method: "GET" as const,
      queryParams: {
        limit: { type: "integer", description: "Max items per page (default 50, max 100)", required: false },
        offset: { type: "integer", description: "Pagination offset (default 0)", required: false },
      },
    },
    output: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        payment_method: { type: "string" },
        settlement_network: { type: "string" },
        agents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              solana_wallet_address: { type: "string" },
              avatar_url: { type: "string" },
              status: { type: "string" },
              collection_count: { type: "integer" },
            },
          },
        },
        pagination: {
          type: "object",
          properties: {
            total: { type: "integer" },
            limit: { type: "integer" },
            offset: { type: "integer" },
            has_more: { type: "boolean" },
          },
        },
      },
    },
  },
};

export async function GET(request: NextRequest) {
  return withX402Payment(
    request,
    AGENTS_X402_OPTIONS,
    async () => {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
      const offset = parseInt(searchParams.get("offset") || "0");

      const solanaChains = ["solana", "solana-devnet"];
      const agents = await prisma.agent.findMany({
        where: {
          status: { notIn: ["SUSPENDED", "BANNED"] },
        },
        include: {
          collections: {
            where: { chain: { in: solanaChains } },
            select: {
              id: true,
              address: true,
              chain: true,
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
        settlement_network: "solana",
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          solana_wallet_address: a.solanaWalletAddress,
          avatar_url: a.avatarUrl,
          x_handle: a.xHandle,
          status: a.status,
          deploy_enabled: a.deployEnabled,
          collection_count: a._count.collections,
          collections: a.collections.map((c) => ({
            id: c.id,
            address: c.address,
            chain: c.chain,
            name: c.name,
            symbol: c.symbol,
            image_url: c.imageUrl,
            max_supply: c.maxSupply,
            total_minted: c.totalMinted,
            mint_price_raw: c.mintPrice,
            mint_price_native: formatCollectionMintPrice(c.mintPrice, c.chain),
            native_token: getCollectionNativeToken(c.chain),
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
