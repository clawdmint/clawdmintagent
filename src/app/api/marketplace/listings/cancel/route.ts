import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { broadcastMarketplaceTransaction } from "@/lib/marketplace-transactions";

export const dynamic = "force-dynamic";

const CancelListingSchema = z.object({
  listing_id: z.string().min(1),
  wallet_address: z.string().min(1),
  signed_transaction_base64: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CancelListingSchema.safeParse(body);

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

    const txHash = await broadcastMarketplaceTransaction({
      signedTransactionBase64,
    });

    await prisma.listing.update({
      where: { id: listingId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        signature: txHash,
      },
    });

    return NextResponse.json({
      success: true,
      tx_hash: txHash,
      listing: {
        id: listingId,
        status: "CANCELLED",
      },
    });
  } catch (error) {
    console.error("Cancel marketplace listing error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to cancel listing" },
      { status: 500 }
    );
  }
}

