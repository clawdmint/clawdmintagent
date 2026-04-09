import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeMarketplaceListing } from "@/lib/marketplace-data";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import {
  filterVisiblePublicCollections,
  PUBLIC_COLLECTION_STATUSES,
} from "@/lib/public-collections";

export const dynamic = "force-dynamic";

type MarketplaceMintRecord = {
  id: string;
  quantity: number;
  totalPaid: string;
  txHash: string;
  startTokenId: number;
  endTokenId: number;
  assetAddresses: string | null;
  mintedAt: Date;
  minterAddress: string;
  collection: {
    id: string;
    address: string;
    name: string;
    symbol: string;
    imageUrl: string | null;
    chain: string;
    agent: {
      name: string;
    };
  };
};

function parseAssetAddresses(raw: string | null) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string");
    }
  } catch {
    return [];
  }

  return [];
}

function toRecentAssets(mints: MarketplaceMintRecord[]) {
  return mints.flatMap((mint) => {
    const assetAddresses = parseAssetAddresses(mint.assetAddresses);
    const tokenCount = Math.max(0, mint.endTokenId - mint.startTokenId + 1);
    const tokenIds = Array.from({ length: tokenCount }, (_, index) => mint.startTokenId + index);
    const paidPerAsset =
      tokenIds.length > 0 ? BigInt(mint.totalPaid || "0") / BigInt(tokenIds.length) : BigInt(0);

    return tokenIds.map((tokenId, index) => ({
      id: `${mint.id}:${tokenId}`,
      asset_address: assetAddresses[index] ?? null,
      token_id: tokenId,
      minted_at: mint.mintedAt.toISOString(),
      tx_hash: mint.txHash,
      minter_address: mint.minterAddress,
      paid_native: formatCollectionMintPrice(paidPerAsset.toString(), mint.collection.chain),
      native_token: getCollectionNativeToken(mint.collection.chain),
      collection: {
        id: mint.collection.id,
        address: mint.collection.address,
        name: mint.collection.name,
        symbol: mint.collection.symbol,
        image_url: mint.collection.imageUrl,
        chain: mint.collection.chain,
        agent_name: mint.collection.agent.name,
      },
    }));
  });
}

export async function GET() {
  try {
    const collectionsRaw = await prisma.collection.findMany({
      where: {
        chain: { in: SOLANA_COLLECTION_CHAINS },
        status: { in: [...PUBLIC_COLLECTION_STATUSES] },
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
    });

    const visibleCollections = filterVisiblePublicCollections(collectionsRaw);
    const visibleCollectionIds = visibleCollections.map((collection) => collection.id);

    const collectionMints = visibleCollectionIds.length
      ? await prisma.mint.findMany({
          where: {
            collectionId: { in: visibleCollectionIds },
          },
          select: {
            collectionId: true,
            minterAddress: true,
            mintedAt: true,
          },
        })
      : [];

    const recentMints = visibleCollectionIds.length
      ? await prisma.mint.findMany({
          where: {
            collectionId: { in: visibleCollectionIds },
          },
          take: 24,
          orderBy: { mintedAt: "desc" },
          include: {
            collection: {
              select: {
                id: true,
                address: true,
                name: true,
                symbol: true,
                imageUrl: true,
                chain: true,
                agent: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        })
      : [];
    const liveListings = visibleCollectionIds.length
      ? await prisma.listing.findMany({
          where: {
            collectionId: { in: visibleCollectionIds },
            status: "ACTIVE",
          },
          include: {
            asset: {
              include: {
                collection: {
                  select: {
                    id: true,
                    address: true,
                    name: true,
                    symbol: true,
                    imageUrl: true,
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 18,
        })
      : [];

    const collectorsByCollection = new Map<string, Set<string>>();
    const latestActivityByCollection = new Map<string, string>();

    for (const mint of collectionMints) {
      const currentCollectors = collectorsByCollection.get(mint.collectionId) ?? new Set<string>();
      currentCollectors.add(mint.minterAddress.toLowerCase());
      collectorsByCollection.set(mint.collectionId, currentCollectors);

      const previousTimestamp = latestActivityByCollection.get(mint.collectionId);
      const mintedAtIso = mint.mintedAt.toISOString();
      if (!previousTimestamp || previousTimestamp < mintedAtIso) {
        latestActivityByCollection.set(mint.collectionId, mintedAtIso);
      }
    }

    const uniqueCollectors = new Set(
      collectionMints.map((mint) => mint.minterAddress.toLowerCase())
    ).size;
    const totalMinted = visibleCollections.reduce(
      (sum, collection) => sum + collection.totalMinted,
      0
    );

    const collections = visibleCollections.map((collection) => ({
      id: collection.id,
      address: collection.address,
      name: collection.name,
      symbol: collection.symbol,
      description: collection.description,
      image_url: collection.imageUrl,
      status: collection.status,
      chain: collection.chain,
      collection_url: `/collection/${collection.address}`,
      max_supply: collection.maxSupply,
      total_minted: collection.totalMinted,
      mint_price_native: formatCollectionMintPrice(collection.mintPrice, collection.chain),
      native_token: getCollectionNativeToken(collection.chain),
      collector_count: collectorsByCollection.get(collection.id)?.size ?? 0,
      latest_activity_at:
        latestActivityByCollection.get(collection.id) ?? collection.createdAt.toISOString(),
      created_at: collection.createdAt.toISOString(),
      agent: {
        id: collection.agent.id,
        name: collection.agent.name,
        avatar_url: collection.agent.avatarUrl,
      },
    }));

    const featuredCollections = [...collections]
      .sort((left, right) => {
        if (right.total_minted !== left.total_minted) {
          return right.total_minted - left.total_minted;
        }
        return right.collector_count - left.collector_count;
      })
      .slice(0, 3);

    const recentAssets = toRecentAssets(recentMints as MarketplaceMintRecord[]).slice(0, 18);

    return NextResponse.json({
      success: true,
      stats: {
        collections: collections.length,
        minted_editions: totalMinted,
        collectors: uniqueCollectors,
        live_collections: collections.filter((collection) => collection.status === "ACTIVE").length,
      },
      featured_collections: featuredCollections,
      collections,
      recent_assets: recentAssets,
      live_listings: liveListings.map((listing) => serializeMarketplaceListing(listing)),
    });
  } catch (error) {
    console.error("Marketplace feed error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "Failed to load marketplace", detail: message },
      { status: 500 }
    );
  }
}
