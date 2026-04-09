import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildMarketplaceCancelListingTransaction } from "@/lib/marketplace-transactions";

export const dynamic = "force-dynamic";

const PrepareCancelListingSchema = z.object({
  listing_id: z.string().min(1),
  wallet_address: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = PrepareCancelListingSchema.safeParse(body);

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

    if (listing.sellerAddress !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Only the seller can cancel this listing" },
        { status: 403 }
      );
    }

    if (listing.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Only active listings can be cancelled" },
        { status: 409 }
      );
    }

    const prepared = await buildMarketplaceCancelListingTransaction({
      walletAddress,
      assetAddress: listing.asset.assetAddress,
      collectionAddress: listing.asset.collection.address,
    });

    return NextResponse.json({
      success: true,
      cancellation: {
        listing_id: listingId,
        wallet_address: walletAddress,
        serialized_transaction_base64: prepared.serializedTransactionBase64,
      },
    });
  } catch (error) {
    console.error("Prepare marketplace cancel error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to prepare listing cancellation",
      },
      { status: 500 }
    );
  }
}
