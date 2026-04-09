import "server-only";

import { prisma } from "@/lib/db";
import { formatLamportsToSol } from "@/lib/platform-fees";

export function serializeMarketplaceListing(
  listing: {
    id: string;
    sellerAddress: string;
    priceLamports: string;
    status: string;
    createdAt: Date;
    asset: {
      assetAddress: string;
      tokenId: number;
      name: string;
      imageUrl: string | null;
      ownerAddress: string;
      collection: {
        id: string;
        address: string;
        name: string;
        symbol: string;
        imageUrl: string | null;
      };
    };
  }
) {
  return {
    id: listing.id,
    seller_address: listing.sellerAddress,
    price_lamports: listing.priceLamports,
    price_native: formatLamportsToSol(BigInt(listing.priceLamports)),
    status: listing.status,
    created_at: listing.createdAt.toISOString(),
    asset: {
      address: listing.asset.assetAddress,
      token_id: listing.asset.tokenId,
      name: listing.asset.name,
      image_url: listing.asset.imageUrl,
      owner_address: listing.asset.ownerAddress,
    },
    collection: {
      id: listing.asset.collection.id,
      address: listing.asset.collection.address,
      name: listing.asset.collection.name,
      symbol: listing.asset.collection.symbol,
      image_url: listing.asset.collection.imageUrl,
      collection_url: `/marketplace/${listing.asset.collection.address}`,
    },
  };
}

export async function getCollectionMarketSummary(collectionId: string) {
  const [owners, activeListings, recentSales] = await Promise.all([
    prisma.asset.findMany({
      where: {
        collectionId,
        ownerAddress: {
          not: "",
        },
      },
      distinct: ["ownerAddress"],
      select: { ownerAddress: true },
    }),
    prisma.listing.findMany({
      where: {
        collectionId,
        status: "ACTIVE",
      },
      select: {
        priceLamports: true,
      },
    }),
    prisma.sale.findMany({
      where: { collectionId },
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

  const floorLamports = activeListings.reduce<bigint | null>((currentFloor, listing) => {
    const current = BigInt(listing.priceLamports);
    if (currentFloor === null || current < currentFloor) {
      return current;
    }
    return currentFloor;
  }, null);

  const totalVolumeLamports = recentSales.reduce(
    (sum, sale) => sum + BigInt(sale.priceLamports),
    BigInt(0)
  );

  return {
    ownersCount: owners.length,
    listedCount: activeListings.length,
    floorPriceLamports: floorLamports?.toString() ?? null,
    floorPriceNative: floorLamports ? formatLamportsToSol(floorLamports) : null,
    totalVolumeLamports: totalVolumeLamports.toString(),
    totalVolumeNative: formatLamportsToSol(totalVolumeLamports),
    recentSales: recentSales.map((sale) => ({
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
  };
}

