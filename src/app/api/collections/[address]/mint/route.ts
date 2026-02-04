import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// POST /api/collections/[address]/mint
// Record a mint transaction (updates database)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();
    
    const { 
      minter_address, 
      quantity, 
      tx_hash, 
      total_paid 
    } = body;

    if (!minter_address || !quantity || !tx_hash) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find collection
    const collection = await prisma.collection.findFirst({
      where: { address },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    // Check if mint already recorded
    const existingMint = await prisma.mint.findUnique({
      where: { txHash: tx_hash },
    });

    if (existingMint) {
      return NextResponse.json({
        success: true,
        message: "Mint already recorded",
        mint: {
          id: existingMint.id,
          quantity: existingMint.quantity,
        },
      });
    }

    // Calculate token IDs
    const startTokenId = collection.totalMinted + 1;
    const endTokenId = startTokenId + quantity - 1;

    // Record mint
    const mint = await prisma.mint.create({
      data: {
        collectionId: collection.id,
        minterAddress: minter_address.toLowerCase(),
        quantity,
        totalPaid: total_paid || "0",
        txHash: tx_hash,
        startTokenId,
        endTokenId,
        mintedAt: new Date(),
      },
    });

    // Update collection totalMinted
    const newTotalMinted = collection.totalMinted + quantity;
    const isSoldOut = newTotalMinted >= collection.maxSupply;

    await prisma.collection.update({
      where: { id: collection.id },
      data: {
        totalMinted: newTotalMinted,
        status: isSoldOut ? "SOLD_OUT" : "ACTIVE",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Mint recorded successfully!",
      mint: {
        id: mint.id,
        quantity: mint.quantity,
        token_ids: Array.from({ length: quantity }, (_, i) => startTokenId + i),
      },
      collection: {
        total_minted: newTotalMinted,
        remaining: collection.maxSupply - newTotalMinted,
        is_sold_out: isSoldOut,
      },
    });
  } catch (error) {
    console.error("Record mint error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record mint" },
      { status: 500 }
    );
  }
}
