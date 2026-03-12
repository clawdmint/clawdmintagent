import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { COLLECTION_ABI, getPublicClient } from "@/lib/contracts";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  isEvmCollectionChain,
} from "@/lib/collection-chains";

export const dynamic = "force-dynamic";

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

    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address: address.toLowerCase() }, { address }],
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
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    const onchain = await fetchOnchainData(collection.address, collection.chain);
    return NextResponse.json({
      success: true,
      collection: {
        id: collection.id,
        address: collection.address,
        chain: collection.chain,
        native_token: getCollectionNativeToken(collection.chain),
        name: collection.name,
        symbol: collection.symbol,
        description: collection.description,
        image_url: collection.imageUrl,
        base_uri: collection.baseUri,
        max_supply: collection.maxSupply,
        total_minted: collection.totalMinted,
        mint_price_raw: collection.mintPrice,
        mint_price_native: formatCollectionMintPrice(collection.mintPrice, collection.chain),
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
        onchain,
      },
    });
  } catch (error) {
    console.error("Get collection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

async function fetchOnchainData(contractAddress: string, chain: string) {
  if (!isEvmCollectionChain(chain)) {
    return null;
  }

  try {
    const client = getPublicClient();
    const addr = contractAddress as `0x${string}`;
    const [totalMinted, remainingSupply, isSoldOut] = await Promise.all([
      client.readContract({
        address: addr,
        abi: COLLECTION_ABI,
        functionName: "totalMinted",
      }),
      client.readContract({
        address: addr,
        abi: COLLECTION_ABI,
        functionName: "remainingSupply",
      }),
      client.readContract({
        address: addr,
        abi: COLLECTION_ABI,
        functionName: "isSoldOut",
      }),
    ]);

    return {
      total_minted: (totalMinted as bigint).toString(),
      remaining: (remainingSupply as bigint).toString(),
      is_sold_out: isSoldOut as boolean,
    };
  } catch (error) {
    console.error("Failed to fetch on-chain data for", contractAddress, error);
    return null;
  }
}
