import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshAssetOwner } from "@/lib/marketplace-assets";
import { buildMarketplaceFillTransaction } from "@/lib/marketplace-transactions";
import { formatLamportsToSol } from "@/lib/platform-fees";

export const dynamic = "force-dynamic";

const PrepareBuySchema = z.object({
  listing_id: z.string().min(1),
  wallet_address: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = PrepareBuySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { listing_id: listingId, wallet_address: walletAddress } = validation.data;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        asset: {
          include: {
            collection: {
              select: {
                address: true,
                name: true,
                symbol: true,
              },
            },
          },
        },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { success: false, error: "Listing not found" },
        { status: 404 }
      );
    }

    if (listing.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "This listing is no longer active" },
        { status: 409 }
      );
    }

    if (listing.sellerAddress === walletAddress) {
      return NextResponse.json(
        { success: false, error: "You already own this listing" },
        { status: 409 }
      );
    }

    const refreshedAsset = await refreshAssetOwner(listing.asset.assetAddress);
    const ownerAddress = refreshedAsset?.ownerAddress || listing.asset.ownerAddress;
    if (ownerAddress !== listing.sellerAddress) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      return NextResponse.json(
        { success: false, error: "Listing owner no longer matches chain state" },
        { status: 409 }
      );
    }

    const prepared = await buildMarketplaceFillTransaction({
      buyerAddress: walletAddress,
      sellerAddress: listing.sellerAddress,
      assetAddress: listing.asset.assetAddress,
      collectionAddress: listing.asset.collection.address,
      priceLamports: listing.priceLamports,
    });

    return NextResponse.json({
      success: true,
      purchase: {
        listing_id: listing.id,
        wallet_address: walletAddress,
        seller_address: listing.sellerAddress,
        price_lamports: listing.priceLamports,
        price_native: formatLamportsToSol(BigInt(listing.priceLamports)),
        asset_address: listing.asset.assetAddress,
        asset_name: listing.asset.name,
        token_id: listing.asset.tokenId,
        delegate_address: prepared.delegateAddress,
        serialized_transaction_base64: prepared.serializedTransactionBase64,
      },
    });
  } catch (error) {
    console.error("Prepare marketplace buy error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to prepare purchase" },
      { status: 500 }
    );
  }
}
