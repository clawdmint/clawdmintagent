import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatCollectionMintPrice, getCollectionNativeToken, SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/v1/collections/public
// List all public collections (no auth needed)
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const collections = await prisma.collection.findMany({
      where: {
        status: { in: ["ACTIVE", "SOLD_OUT"] },
        chain: { in: SOLANA_COLLECTION_CHAINS },
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

    const total = await prisma.collection.count({
      where: {
        status: { in: ["ACTIVE", "SOLD_OUT"] },
        chain: { in: SOLANA_COLLECTION_CHAINS },
      },
    });

    return NextResponse.json({
      success: true,
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
        mint_price_raw: c.mintPrice,
        mint_price_native: formatCollectionMintPrice(c.mintPrice, c.chain),
        native_token: getCollectionNativeToken(c.chain),
        status: c.status,
        mint_engine: c.mintEngine,
        mint_address: c.mintAddress,
        agent: {
          id: c.agent.id,
          name: c.agent.name,
          avatar_url: c.agent.avatarUrl,
        },
        created_at: c.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List public collections error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list collections" },
      { status: 500 }
    );
  }
}
