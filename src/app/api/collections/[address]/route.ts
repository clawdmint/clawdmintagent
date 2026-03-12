import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  isEvmCollectionChain,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { buildCollectionBagsView } from "@/lib/collection-bags";
import { fetchBagsCollectionAnalytics, isBagsConfigured } from "@/lib/bags";

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

    if (!SOLANA_COLLECTION_CHAINS.includes(collection.chain as (typeof SOLANA_COLLECTION_CHAINS)[number])) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    const onchain = await fetchOnchainData(collection.address, collection.chain);
    let bagsCollection = collection;

    if (collection.bagsStatus === "LIVE" && collection.bagsTokenAddress && isBagsConfigured()) {
      try {
        const analytics = await fetchBagsCollectionAnalytics(collection.bagsTokenAddress);
        bagsCollection = {
          ...collection,
          bagsLifetimeFees: analytics.lifetimeFeesLamports,
          bagsClaimedFees: analytics.claimedFeesLamports,
          bagsScore: analytics.score,
          bagsAnalyticsUpdatedAt: new Date(),
        };

        await prisma.collection.update({
          where: { id: collection.id },
          data: {
            bagsLifetimeFees: analytics.lifetimeFeesLamports,
            bagsClaimedFees: analytics.claimedFeesLamports,
            bagsScore: analytics.score,
            bagsAnalyticsUpdatedAt: new Date(),
          },
        });
      } catch (error) {
        console.warn("[Bags] Collection analytics refresh failed:", error);
      }
    }

    return NextResponse.json({
      success: true,
      collection: {
        id: bagsCollection.id,
        address: bagsCollection.address,
        chain: bagsCollection.chain,
        native_token: getCollectionNativeToken(bagsCollection.chain),
        name: bagsCollection.name,
        symbol: bagsCollection.symbol,
        description: bagsCollection.description,
        image_url: bagsCollection.imageUrl,
        base_uri: bagsCollection.baseUri,
        max_supply: bagsCollection.maxSupply,
        total_minted: bagsCollection.totalMinted,
        mint_price_raw: bagsCollection.mintPrice,
        mint_price_native: formatCollectionMintPrice(bagsCollection.mintPrice, bagsCollection.chain),
        royalty_bps: bagsCollection.royaltyBps,
        payout_address: bagsCollection.payoutAddress,
        authority_address: bagsCollection.authorityAddress,
        status: bagsCollection.status,
        deployed_at: bagsCollection.deployedAt?.toISOString(),
        deploy_tx_hash: bagsCollection.deployTxHash,
        bags: buildCollectionBagsView(bagsCollection),
        agent: {
          id: bagsCollection.agent.id,
          name: bagsCollection.agent.name,
          description: bagsCollection.agent.description,
          avatar_url: bagsCollection.agent.avatarUrl,
          eoa: bagsCollection.agent.eoa,
          x_handle: bagsCollection.agent.xHandle,
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

  return null;
}
