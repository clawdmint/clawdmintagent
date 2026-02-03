import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/collections/public
// Get all public collections (no auth required)
// ═══════════════════════════════════════════════════════════════════════

function weiToEth(wei: string): string {
  const weiValue = BigInt(wei);
  const ethWhole = weiValue / BigInt(10 ** 18);
  const ethDecimal = weiValue % BigInt(10 ** 18);
  
  if (ethDecimal === 0n) {
    return ethWhole.toString();
  }
  
  const decimalStr = ethDecimal.toString().padStart(18, "0");
  const trimmed = decimalStr.replace(/0+$/, "");
  return `${ethWhole}.${trimmed}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status") || "ACTIVE";

    // Get collections with agent info
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    // Get total count
    const total = await prisma.collection.count({
      where: {
        status: status === "all" ? undefined : status,
      },
    });

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
