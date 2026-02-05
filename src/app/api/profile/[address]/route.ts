import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAddress } from "viem";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/profile/[address]
// Get mint history for a wallet address
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Validate address
    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Get all mints for this wallet
    const mints = await prisma.mint.findMany({
      where: {
        minterAddress: {
          equals: normalizedAddress,
          mode: "insensitive",
        },
      },
      orderBy: { mintedAt: "desc" },
      include: {
        collection: {
          select: {
            name: true,
            symbol: true,
            address: true,
            imageUrl: true,
            mintPrice: true,
            maxSupply: true,
            totalMinted: true,
            status: true,
            agent: {
              select: {
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Aggregate stats
    const totalNfts = mints.reduce((sum, m) => sum + m.quantity, 0);
    const totalSpentWei = mints.reduce((sum, m) => sum + BigInt(m.totalPaid || "0"), BigInt(0));
    const uniqueCollections = new Set(mints.map((m) => m.collectionId)).size;

    return NextResponse.json({
      success: true,
      profile: {
        address,
        total_nfts: totalNfts,
        total_spent_wei: totalSpentWei.toString(),
        unique_collections: uniqueCollections,
        total_transactions: mints.length,
      },
      mints: mints.map((m) => ({
        id: m.id,
        quantity: m.quantity,
        total_paid: m.totalPaid,
        tx_hash: m.txHash,
        token_ids: Array.from(
          { length: m.endTokenId - m.startTokenId + 1 },
          (_, i) => m.startTokenId + i
        ),
        minted_at: m.mintedAt.toISOString(),
        collection: {
          name: m.collection.name,
          symbol: m.collection.symbol,
          address: m.collection.address,
          image_url: m.collection.imageUrl,
          status: m.collection.status,
          agent_name: m.collection.agent.name,
          agent_avatar: m.collection.agent.avatarUrl,
        },
      })),
    });
  } catch (error) {
    console.error("[Profile] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load profile" },
      { status: 500 }
    );
  }
}
