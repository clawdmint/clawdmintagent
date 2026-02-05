import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { syncHistoricalEvents, getCurrentBlock } from "@/lib/event-listener";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// ADMIN AUTH (reusable, timing-safe)
// ═══════════════════════════════════════════════════════════════════════

function verifyAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env["AGENT_HMAC_SECRET"];

  if (!adminSecret || adminSecret.length < 32 || !authHeader?.startsWith("Bearer ")) {
    return false;
  }

  try {
    const token = authHeader.slice(7);
    const a = Buffer.from(token, "utf-8");
    const b = Buffer.from(adminSecret, "utf-8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/sync-events
// Sync blockchain events (requires admin auth)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require proper admin authentication
    if (!verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const fromBlock = body.from_block ? BigInt(body.from_block) : BigInt(0);

    // Get current block before sync
    const currentBlock = await getCurrentBlock();

    // Sync events
    await syncHistoricalEvents(fromBlock);

    return NextResponse.json({
      success: true,
      message: "Event sync completed",
      from_block: fromBlock.toString(),
      current_block: currentBlock.toString(),
    });
  } catch (error) {
    console.error("[SyncEvents] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/sync-events
// Get sync status (requires admin auth)
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require admin auth for status too
    if (!verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const currentBlock = await getCurrentBlock();

    return NextResponse.json({
      success: true,
      current_block: currentBlock.toString(),
      chain: process.env["NEXT_PUBLIC_CHAIN_ID"] === "8453" ? "base-mainnet" : "base-sepolia",
    });
  } catch (error) {
    console.error("[SyncEvents] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
