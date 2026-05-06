import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";
import { formatCollectionMintPrice, getCollectionNativeToken } from "@/lib/collection-chains";

export const dynamic = "force-dynamic";

const COLLECTIONS_X402_OPTIONS = {
  price: X402_PRICING.API_COLLECTIONS_READ,
  description: "List all NFT collections on Clawdmint with agent info",
  discovery: {
    name: "Clawdmint Solana Collections Index (x402)",
    category: "nft-discovery",
    tags: ["solana", "x402", "usdc", "metaplex", "collections", "discovery"],
    input: {
      type: "http" as const,
      method: "GET" as const,
      queryParams: {
        limit: { type: "integer", description: "Max items per page (default 50, max 100)", required: false },
        offset: { type: "integer", description: "Pagination offset (default 0)", required: false },
        status: { type: "string", description: "Filter by status, e.g. ACTIVE, SOLD_OUT, all", required: false },
      },
    },
    output: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        payment_method: { type: "string" },
        settlement_network: { type: "string" },
        collections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              address: { type: "string" },
              chain: { type: "string" },
              name: { type: "string" },
              symbol: { type: "string" },
              total_minted: { type: "integer" },
              max_supply: { type: "integer" },
              status: { type: "string" },
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
    COLLECTIONS_X402_OPTIONS,
    async () => {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
      const offset = parseInt(searchParams.get("offset") || "0");
      const status = searchParams.get("status") || "all";

      const solanaChains = ["solana", "solana-devnet"];
      const collections = await prisma.collection.findMany({
        where: {
          status: status === "all" ? undefined : status,
          chain: { in: solanaChains },
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              description: true,
              solanaWalletAddress: true,
            },
          },
          _count: { select: { mints: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.collection.count({
        where: {
          status: status === "all" ? undefined : status,
          chain: { in: solanaChains },
        },
      });

      return NextResponse.json({
        success: true,
        payment_method: "x402",
        settlement_network: "solana",
        collections: collections.map((c) => ({
          id: c.id,
          address: c.address,
          chain: c.chain,
          name: c.name,
          symbol: c.symbol,
          description: c.description,
          image_url: c.imageUrl,
          max_supply: c.maxSupply,
          total_minted: c.totalMinted,
          mint_count: c._count.mints,
          mint_price_raw: c.mintPrice,
          mint_price_native: formatCollectionMintPrice(c.mintPrice, c.chain),
          native_token: getCollectionNativeToken(c.chain),
          royalty_bps: c.royaltyBps,
          payout_address: c.payoutAddress,
          status: c.status,
          deployed_at: c.deployedAt?.toISOString() || null,
          created_at: c.createdAt.toISOString(),
          agent: {
            id: c.agent.id,
            name: c.agent.name,
            avatar_url: c.agent.avatarUrl,
            description: c.agent.description,
            solana_wallet_address: c.agent.solanaWalletAddress,
          },
        })),
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + collections.length < total,
        },
      });
    }
  );
}
