import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createListingNonce } from "@/lib/marketplace-signatures";
import {
  MARKETPLACE_LISTING_TTL_MS,
  broadcastMarketplaceTransaction,
} from "@/lib/marketplace-transactions";
import { refreshAssetOwner } from "@/lib/marketplace-assets";
import { serializeMarketplaceListing } from "@/lib/marketplace-data";

export const dynamic = "force-dynamic";

const ConfirmListingSchema = z.object({
  asset_address: z.string().min(1),
  wallet_address: z.string().min(1),
  price_lamports: z.string().min(1),
  signed_transaction_base64: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ConfirmListingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { asset_address: assetAddress, wallet_address: walletAddress, price_lamports: priceLamports, signed_transaction_base64: signedTransactionBase64 } = validation.data;

    const asset = await prisma.asset.findUnique({
      where: { assetAddress },
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
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: "Asset not found in marketplace inventory" },
        { status: 404 }
      );
    }

    const refreshedAsset = await refreshAssetOwner(assetAddress);
    const ownerAddress = refreshedAsset?.ownerAddress || asset.ownerAddress;
    if (ownerAddress !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Only the current owner can confirm this listing" },
        { status: 403 }
      );
    }

    const txHash = await broadcastMarketplaceTransaction({
      signedTransactionBase64,
    });

    const listing = await prisma.$transaction(async (tx) => {
      await tx.listing.updateMany({
        where: {
          assetId: asset.id,
          status: "ACTIVE",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      return tx.listing.create({
        data: {
          assetId: asset.id,
          collectionId: asset.collectionId,
          sellerAddress: walletAddress,
          priceLamports,
          status: "ACTIVE",
          signature: txHash,
          message: "delegate-approved",
          nonce: createListingNonce(),
          expiresAt: new Date(Date.now() + MARKETPLACE_LISTING_TTL_MS),
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
      });
    });

    return NextResponse.json({
      success: true,
      tx_hash: txHash,
      listing: serializeMarketplaceListing(listing),
    });
  } catch (error) {
    console.error("Confirm marketplace listing error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to confirm listing" },
      { status: 500 }
    );
  }
}
