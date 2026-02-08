import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/collections/public
// Get all public collections (no auth required)
// ═══════════════════════════════════════════════════════════════════════

function weiToEth(wei: string): string {
  const weiValue = BigInt(wei);
  const ethWhole = weiValue / BigInt(10 ** 18);
  const ethDecimal = weiValue % BigInt(10 ** 18);
  
  if (ethDecimal === BigInt(0)) {
    return ethWhole.toString();
  }
  
  const decimalStr = ethDecimal.toString().padStart(18, "0");
  const trimmed = decimalStr.replace(/0+$/, "");
  return `${ethWhole}.${trimmed}`;
}

// Hidden collections (removed from public listings)
const HIDDEN_COLLECTIONS = new Set([
  "0xa36bfea4b27ff26a8e4c580a925761025ae6e551",
]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status") || "ACTIVE";

    const whereClause = {
      status: status === "all" ? undefined : status,
    };

    // Get collections with agent info
    const allCollections = await prisma.collection.findMany({
      where: whereClause,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter out hidden collections in JS (more reliable than Prisma NOT/in)
    const filtered = allCollections.filter(
      (c) => !HIDDEN_COLLECTIONS.has(c.address.toLowerCase())
    );

    const total = filtered.length;
    const collections = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      collections: collections.map((c) => ({
        id: c.id,
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        description: c.description,
        image_url: c.imageUrl,
        max_supply: c.maxSupply,
        total_minted: c.totalMinted,
        mint_price_wei: c.mintPrice,
        mint_price_eth: weiToEth(c.mintPrice),
        status: c.status,
        created_at: c.createdAt.toISOString(),
        agent: {
          id: c.agent.id,
          name: c.agent.name,
          avatar_url: c.agent.avatarUrl,
        },
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + collections.length < total,
      },
    });
  } catch (error) {
    console.error("List public collections error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list collections" },
      { status: 500 }
    );
  }
}
