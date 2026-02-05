import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAddress, getAddress } from "viem";
import { publicClient } from "@/lib/contracts";
import { checkRateLimit, getClientIp, RATE_LIMIT_MINT } from "@/lib/rate-limit";
import { notifyAgentMint } from "@/lib/notifications";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════

function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function isValidQuantity(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isInteger(qty) && qty > 0 && qty <= 100;
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/collections/[address]/mint
// Record a mint transaction (with on-chain verification)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    // SECURITY: Rate limit mint recording (30 per minute per IP)
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`mint:${clientIp}`, RATE_LIMIT_MINT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds || 60) } }
      );
    }

    const { address } = await params;
    const body = await request.json();
    
    const { 
      minter_address, 
      quantity, 
      tx_hash, 
      total_paid 
    } = body;

    // ── Input validation ──────────────────────────────────────────────
    if (!minter_address || !quantity || !tx_hash) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // SECURITY: Validate tx_hash format
    if (!isValidTxHash(tx_hash)) {
      return NextResponse.json(
        { success: false, error: "Invalid transaction hash format" },
        { status: 400 }
      );
    }

    // SECURITY: Validate minter_address
    if (!isAddress(minter_address)) {
      return NextResponse.json(
        { success: false, error: "Invalid minter address" },
        { status: 400 }
      );
    }

    // SECURITY: Validate quantity range
    if (!isValidQuantity(quantity)) {
      return NextResponse.json(
        { success: false, error: "Invalid quantity (must be 1-100)" },
        { status: 400 }
      );
    }

    // ── Find collection ───────────────────────────────────────────────
    const collectionAddress = address.toLowerCase();
    const collection = await prisma.collection.findFirst({
      where: { address: collectionAddress },
    });

    if (!collection) {
      // Also try with original case
      const collectionAlt = await prisma.collection.findFirst({
        where: { address },
      });
      if (!collectionAlt) {
        return NextResponse.json(
          { success: false, error: "Collection not found" },
          { status: 404 }
        );
      }
    }

    const col = collection || (await prisma.collection.findFirst({ where: { address } }))!;

    // ── Check if mint already recorded ────────────────────────────────
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

    // ── SECURITY: Verify transaction on-chain ─────────────────────────
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: tx_hash as `0x${string}`,
        timeout: 10_000, // 10s timeout - don't block forever
      });

      // Verify the transaction was successful
      if (receipt.status !== "success") {
        return NextResponse.json(
          { success: false, error: "Transaction failed on-chain" },
          { status: 400 }
        );
      }

      // Verify the transaction was sent to the collection contract
      const txTo = receipt.to?.toLowerCase();
      if (txTo !== col.address.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: "Transaction target does not match collection" },
          { status: 400 }
        );
      }

      // Verify the sender matches claimed minter (from receipt logs)
      const txFrom = receipt.from?.toLowerCase();
      if (txFrom && txFrom !== minter_address.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: "Transaction sender does not match minter" },
          { status: 400 }
        );
      }
    } catch (verifyError) {
      // Transaction might not be mined yet or timeout - allow with warning
      console.warn("[Mint] On-chain verification failed, tx may be pending:", tx_hash);
    }

    // ── Calculate token IDs ───────────────────────────────────────────
    const startTokenId = col.totalMinted + 1;
    const endTokenId = startTokenId + quantity - 1;

    // ── Record mint ───────────────────────────────────────────────────
    const mint = await prisma.mint.create({
      data: {
        collectionId: col.id,
        minterAddress: getAddress(minter_address), // Checksum address
        quantity,
        totalPaid: total_paid || "0",
        txHash: tx_hash,
        startTokenId,
        endTokenId,
        mintedAt: new Date(),
      },
    });

    // Update collection totalMinted
    const newTotalMinted = col.totalMinted + quantity;
    const isSoldOut = newTotalMinted >= col.maxSupply;

    await prisma.collection.update({
      where: { id: col.id },
      data: {
        totalMinted: newTotalMinted,
        status: isSoldOut ? "SOLD_OUT" : "ACTIVE",
      },
    });

    // ── Send Telegram notification to agent (non-blocking) ────────────
    try {
      const agent = await prisma.agent.findUnique({
        where: { id: col.agentId },
        select: { telegramChatId: true },
      });

      if (agent?.telegramChatId) {
        // Fire and forget - don't block the response
        notifyAgentMint(agent.telegramChatId, {
          collectionName: col.name,
          collectionAddress: col.address,
          minterAddress: getAddress(minter_address),
          quantity,
          totalPaid: total_paid || "0",
          txHash: tx_hash,
          totalMinted: newTotalMinted,
          maxSupply: col.maxSupply,
        }).catch((err) => console.error("[Mint] Notification error:", err));
      }
    } catch (notifyErr) {
      // Never let notification failure break mint recording
      console.error("[Mint] Notification lookup error:", notifyErr);
    }

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
        remaining: col.maxSupply - newTotalMinted,
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
