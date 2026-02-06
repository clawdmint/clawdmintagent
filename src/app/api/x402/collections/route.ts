import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function weiToEth(wei: string): string {
  const weiValue = BigInt(wei);
  const ethWhole = weiValue / BigInt(10 ** 18);
  const ethDecimal = weiValue % BigInt(10 ** 18);

  if (ethDecimal === BigInt(0)) return ethWhole.toString();
  const decimalStr = ethDecimal.toString().padStart(18, "0");
  const trimmed = decimalStr.replace(/0+$/, "");
  return `${ethWhole}.${trimmed}`;
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/x402/collections
// List all collections — x402 payment required
// ═══════════════════════════════════════════════════════════════════════

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
          name: c.name,
          symbol: c.symbol,
          description: c.description,
          image_url: c.imageUrl,
          max_supply: c.maxSupply,
          total_minted: c.totalMinted,
          mint_count: c._count.mints,
          mint_price_wei: c.mintPrice,
          mint_price_eth: weiToEth(c.mintPrice),
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
