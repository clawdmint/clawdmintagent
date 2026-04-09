import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshAssetOwner, syncMintAssets } from "@/lib/marketplace-assets";
import { serializeMarketplaceListing } from "@/lib/marketplace-data";
import { formatLamportsToSol } from "@/lib/platform-fees";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetAddress: string }> }
) {
  try {
    const { assetAddress } = await params;

    let asset = await prisma.asset.findUnique({
      where: { assetAddress },
      include: {
        collection: {
          select: {
            id: true,
            address: true,
            name: true,
            symbol: true,
            imageUrl: true,
            description: true,
            totalMinted: true,
            maxSupply: true,
            mintPrice: true,
            chain: true,
            agent: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
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
    });

    if (!asset) {
      const mint = await prisma.mint.findFirst({
        where: {
          assetAddresses: {
            contains: assetAddress,
          },
        },
        select: { id: true },
      });

      if (mint) {
        await syncMintAssets(mint.id);
        asset = await prisma.asset.findUnique({
          where: { assetAddress },
          include: {
            collection: {
              select: {
                id: true,
                address: true,
                name: true,
                symbol: true,
                imageUrl: true,
                description: true,
                totalMinted: true,
                maxSupply: true,
                mintPrice: true,
                chain: true,
                agent: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
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
        });
      }
    }

    if (!asset) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }

    const refreshed = await refreshAssetOwner(asset.assetAddress).catch(() => null);
    const ownerAddress = refreshed?.ownerAddress || asset.ownerAddress;

    const [relatedAssets, activeListings, recentCollectionSales] = await Promise.all([
      prisma.asset.findMany({
        where: { collectionId: asset.collectionId },
        orderBy: { tokenId: "asc" },
        take: 18,
        select: {
          id: true,
          assetAddress: true,
          tokenId: true,
          name: true,
          imageUrl: true,
          ownerAddress: true,
        },
      }),
      prisma.listing.findMany({
        where: {
          collectionId: asset.collectionId,
          status: "ACTIVE",
        },
        orderBy: [{ priceLamports: "asc" }, { createdAt: "desc" }],
        take: 12,
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
      }),
      prisma.sale.findMany({
        where: { collectionId: asset.collectionId },
        orderBy: { soldAt: "desc" },
        take: 8,
        include: {
          asset: {
            select: {
              assetAddress: true,
              tokenId: true,
              name: true,
              imageUrl: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        asset_address: asset.assetAddress,
        token_id: asset.tokenId,
        owner_address: ownerAddress,
        name: asset.name,
        image_url: asset.imageUrl,
        metadata_uri: asset.metadataUri,
        minted_at: asset.mintedAt.toISOString(),
        active_listing: asset.listings[0] ? serializeMarketplaceListing(asset.listings[0]) : null,
        collection: {
          id: asset.collection.id,
          address: asset.collection.address,
          name: asset.collection.name,
          symbol: asset.collection.symbol,
          image_url: asset.collection.imageUrl,
          description: asset.collection.description,
          total_minted: asset.collection.totalMinted,
          max_supply: asset.collection.maxSupply,
          mint_price_native: formatLamportsToSol(BigInt(asset.collection.mintPrice)),
          chain: asset.collection.chain,
          agent: {
            id: asset.collection.agent.id,
            name: asset.collection.agent.name,
            avatar_url: asset.collection.agent.avatarUrl,
          },
        },
      },
      related_assets: relatedAssets.map((related) => ({
        id: related.id,
        asset_address: related.assetAddress,
        token_id: related.tokenId,
        name: related.name,
        image_url: related.imageUrl,
        owner_address: related.ownerAddress,
      })),
      best_listings: activeListings.map((listing) => serializeMarketplaceListing(listing)),
      recent_sales: recentCollectionSales.map((sale) => ({
        id: sale.id,
        price_lamports: sale.priceLamports,
        price_native: formatLamportsToSol(BigInt(sale.priceLamports)),
        buyer_address: sale.buyerAddress,
        seller_address: sale.sellerAddress,
        tx_hash: sale.txHash,
        sold_at: sale.soldAt.toISOString(),
        asset: {
          address: sale.asset.assetAddress,
          token_id: sale.asset.tokenId,
          name: sale.asset.name,
          image_url: sale.asset.imageUrl,
        },
      })),
    });
  } catch (error) {
    console.error("Marketplace asset detail error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load asset detail" },
      { status: 500 }
    );
  }
}

