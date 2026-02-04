import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/collections/[address]
// Get collection details by address
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { success: false, error: "Address is required" },
        { status: 400 }
      );
    }

    // Find collection by address (case-insensitive)
    const collection = await prisma.collection.findFirst({
      where: {
        address: address.toLowerCase(),
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
            eoa: true,
            xHandle: true,
          },
        },
      },
    });

    if (!collection) {
      // Try without lowercase
      const collectionAlt = await prisma.collection.findFirst({
        where: { address },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              description: true,
              avatarUrl: true,
              eoa: true,
              xHandle: true,
            },
          },
        },
      });

      if (!collectionAlt) {
        return NextResponse.json(
          { success: false, error: "Collection not found" },
          { status: 404 }
        );
      }

      return formatResponse(collectionAlt);
    }

    return formatResponse(collection);
  } catch (error) {
    console.error("Get collection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

function weiToEth(wei: string): string {
  const weiValue = BigInt(wei);
  const ethWhole = weiValue / BigInt(10 ** 18);
  const ethDecimal = weiValue % BigInt(10 ** 18);
  
  if (ethDecimal === BigInt(0)) {
    return ethWhole.toString();
  }
  
  // Format with up to 18 decimal places, then trim trailing zeros
  const decimalStr = ethDecimal.toString().padStart(18, "0");
  const trimmed = decimalStr.replace(/0+$/, "");
  return `${ethWhole}.${trimmed}`;
}

function formatResponse(collection: any) {
  return NextResponse.json({
    success: true,
    collection: {
      id: collection.id,
      address: collection.address,
      name: collection.name,
      symbol: collection.symbol,
      description: collection.description,
      image_url: collection.imageUrl,
      base_uri: collection.baseUri,
      max_supply: collection.maxSupply,
      total_minted: collection.totalMinted,
      mint_price_wei: collection.mintPrice,
      mint_price_eth: weiToEth(collection.mintPrice),
      royalty_bps: collection.royaltyBps,
      payout_address: collection.payoutAddress,
      status: collection.status,
      deployed_at: collection.deployedAt?.toISOString(),
      deploy_tx_hash: collection.deployTxHash,
      agent: {
        id: collection.agent.id,
        name: collection.agent.name,
        description: collection.agent.description,
        avatar_url: collection.agent.avatarUrl,
        eoa: collection.agent.eoa,
        x_handle: collection.agent.xHandle,
      },
    },
  });
}
