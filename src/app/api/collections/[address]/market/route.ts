import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureCollectionAssetsIndexed } from "@/lib/marketplace-assets";
import {
  getCollectionMarketSummary,
  serializeMarketplaceListing,
} from "@/lib/marketplace-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address }, { address: address.toLowerCase() }],
      },
      select: {
        id: true,
        address: true,
        name: true,
      },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    void ensureCollectionAssetsIndexed(collection.id, {
      forceChainSync: true,
      awaitChainSync: false,
    }).catch((error) => {
      console.warn("[Collection Market] Background asset indexing failed:", error);
    });

    const [summary, listings, assets] = await Promise.all([
      getCollectionMarketSummary(collection.id),
      prisma.listing.findMany({
        where: {
          collectionId: collection.id,
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
        orderBy: [{ priceLamports: "asc" }, { createdAt: "desc" }],
        take: 24,
      }),
      prisma.asset.findMany({
        where: { collectionId: collection.id },
        include: {
          listings: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 1,
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
          },
        },
        orderBy: [{ tokenId: "asc" }],
        take: 48,
      }),
    ]);

    return NextResponse.json({
      success: true,
      market: {
        summary,
        listings: listings.map((listing) => serializeMarketplaceListing(listing)),
        assets: assets.map((asset) => ({
          id: asset.id,
          asset_address: asset.assetAddress,
          token_id: asset.tokenId,
          owner_address: asset.ownerAddress,
          name: asset.name,
          image_url: asset.imageUrl,
          metadata_uri: asset.metadataUri,
          minted_at: asset.mintedAt.toISOString(),
          active_listing: asset.listings[0] ? serializeMarketplaceListing(asset.listings[0]) : null,
        })),
      },
    });
  } catch (error) {
    console.error("Collection market error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load collection market" },
      { status: 500 }
    );
  }
}


