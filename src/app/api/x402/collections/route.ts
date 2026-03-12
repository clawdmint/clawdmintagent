import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";
import { formatCollectionMintPrice, getCollectionNativeToken } from "@/lib/collection-chains";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: X402_PRICING.API_COLLECTIONS_READ,
      description: "List all NFT collections on Clawdmint with agent info",
    },
    async () => {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
      const offset = parseInt(searchParams.get("offset") || "0");
      const status = searchParams.get("status") || "all";

      const collections = await prisma.collection.findMany({
        where: {
          status: status === "all" ? undefined : status,
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              description: true,
              eoa: true,
            },
          },
          _count: { select: { mints: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.collection.count({
        where: { status: status === "all" ? undefined : status },
      });

      return NextResponse.json({
        success: true,
        payment_method: "x402",
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
            eoa: c.agent.eoa,
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
