import { NextRequest, NextResponse } from "next/server";
import { syncHistoricalEvents, getCurrentBlock } from "@/lib/event-listener";
import { serverEnv } from "@/lib/env";

/**
 * Admin endpoint to sync blockchain events
 * POST /api/admin/sync-events
 * 
 * Body: { from_block?: number }
 * 
 * Note: In production, protect this endpoint with admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Simple auth check (use proper auth in production)
    const authHeader = request.headers.get("authorization");
    const adminSecret = serverEnv.agentHmacSecret;
    
    if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const fromBlock = body.from_block ? BigInt(body.from_block) : 0n;

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
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}

/**
 * Get sync status
 * GET /api/admin/sync-events
 */
export async function GET() {
  try {
    const currentBlock = await getCurrentBlock();

    return NextResponse.json({
      success: true,
      current_block: currentBlock.toString(),
      chain: process.env.NEXT_PUBLIC_CHAIN_ID === "8453" ? "base-mainnet" : "base-sepolia",
    });
  } catch (error) {
    console.error("[SyncEvents] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get status" },
      { status: 500 }
    );
  }
}
