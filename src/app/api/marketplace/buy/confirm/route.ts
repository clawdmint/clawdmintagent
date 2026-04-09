import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshAssetOwner } from "@/lib/marketplace-assets";
import { broadcastMarketplaceTransaction } from "@/lib/marketplace-transactions";
import { formatLamportsToSol } from "@/lib/platform-fees";

export const dynamic = "force-dynamic";

const ConfirmBuySchema = z.object({
  listing_id: z.string().min(1),
  wallet_address: z.string().min(1),
  signed_transaction_base64: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ConfirmBuySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const {
      listing_id: listingId,
      wallet_address: walletAddress,
      signed_transaction_base64: signedTransactionBase64,
    } = validation.data;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        asset: true,
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

    const txHash = await broadcastMarketplaceTransaction({
      signedTransactionBase64,
    });

    const sale = await prisma.$transaction(async (tx) => {
      const listingUpdate = await tx.listing.updateMany({
        where: {
          id: listing.id,
          status: "ACTIVE",
        },
        data: {
          status: "FILLED",
          filledAt: new Date(),
          signature: txHash,
        },
      });

      if (listingUpdate.count === 0) {
        throw new Error("Listing was already filled or cancelled");
      }

      await tx.listing.updateMany({
        where: {
          assetId: listing.assetId,
          status: "ACTIVE",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      await tx.asset.update({
        where: { id: listing.assetId },
        data: {
          ownerAddress: walletAddress,
        },
      });

      return tx.sale.create({
        data: {
          assetId: listing.assetId,
          collectionId: listing.collectionId,
          listingId: listing.id,
          buyerAddress: walletAddress,
          sellerAddress: listing.sellerAddress,
          priceLamports: listing.priceLamports,
          txHash,
          soldAt: new Date(),
        },
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
      });
    });

    return NextResponse.json({
      success: true,
      tx_hash: txHash,
      sale: {
        id: sale.id,
        price_lamports: sale.priceLamports,
        price_native: formatLamportsToSol(BigInt(sale.priceLamports)),
        sold_at: sale.soldAt.toISOString(),
        buyer_address: sale.buyerAddress,
        seller_address: sale.sellerAddress,
        asset: {
          address: sale.asset.assetAddress,
          token_id: sale.asset.tokenId,
          name: sale.asset.name,
          image_url: sale.asset.imageUrl,
        },
      },
    });
  } catch (error) {
    console.error("Confirm marketplace buy error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to settle purchase" },
      { status: 500 }
    );
  }
}
