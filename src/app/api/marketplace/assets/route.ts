import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureCollectionAssetsIndexed } from "@/lib/marketplace-assets";
import { serializeMarketplaceListing } from "@/lib/marketplace-data";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  collection: z.string().optional(),
  listed_only: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return 24;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 100)) : 24;
    }),
});

export async function GET(request: NextRequest) {
  try {
    const validation = QuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { collection, listed_only: listedOnly, limit } = validation.data;

    let collectionId: string | undefined;
    if (collection) {
      const collectionRecord = await prisma.collection.findFirst({
        where: {
          OR: [{ id: collection }, { address: collection }],
        },
        select: { id: true },
      });

      if (!collectionRecord) {
        return NextResponse.json(
          { success: false, error: "Collection not found" },
          { status: 404 }
        );
      }

      collectionId = collectionRecord.id;
      await ensureCollectionAssetsIndexed(collectionRecord.id, { forceChainSync: true });
    }

    const assets = await prisma.asset.findMany({
      where: {
        ...(collectionId ? { collectionId } : {}),
        ...(listedOnly
          ? {
              listings: {
                some: {
                  status: "ACTIVE",
                },
              },
            }
          : {}),
      },
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
      orderBy: [{ mintedAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({
      success: true,
      assets: assets.map((asset) => ({
        id: asset.id,
        asset_address: asset.assetAddress,
        token_id: asset.tokenId,
        owner_address: asset.ownerAddress,
        name: asset.name,
        image_url: asset.imageUrl,
        metadata_uri: asset.metadataUri,
        minted_at: asset.mintedAt.toISOString(),
        collection: {
          id: asset.collection.id,
          address: asset.collection.address,
          name: asset.collection.name,
          symbol: asset.collection.symbol,
          image_url: asset.collection.imageUrl,
          collection_url: `/marketplace/${asset.collection.address}`,
        },
        active_listing: asset.listings[0] ? serializeMarketplaceListing(asset.listings[0]) : null,
      })),
    });
  } catch (error) {
    console.error("Marketplace assets error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load marketplace assets" },
      { status: 500 }
    );
  }
}

