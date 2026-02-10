import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/whitelist — Submit wallet for WL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, twitterHandle, completedTasks } = body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    // Validate ETH address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Validate tasks
    if (!Array.isArray(completedTasks) || completedTasks.length < 4) {
      return NextResponse.json({ error: "All tasks must be completed" }, { status: 400 });
    }

    const requiredTasks = ["follow", "like", "retweet", "comment"];
    const allCompleted = requiredTasks.every((t) => completedTasks.includes(t));
    if (!allCompleted) {
      return NextResponse.json({ error: "All tasks must be completed" }, { status: 400 });
    }

    // Upsert (if already submitted, update)
    const entry = await prisma.whitelistEntry.upsert({
      where: { walletAddress: walletAddress.toLowerCase() },
      update: {
        twitterHandle: twitterHandle || null,
        completedTasks: JSON.stringify(completedTasks),
      },
      create: {
        walletAddress: walletAddress.toLowerCase(),
        twitterHandle: twitterHandle || null,
        completedTasks: JSON.stringify(completedTasks),
      },
    });

    // Count total WL entries
    const totalEntries = await prisma.whitelistEntry.count();

    return NextResponse.json({
      success: true,
      message: "Whitelist entry submitted",
      position: totalEntries,
    });
  } catch (error) {
    console.error("Whitelist submission error:", error);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}

// GET /api/whitelist — Check if wallet is already on WL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json({ error: "Wallet param required" }, { status: 400 });
    }

    const entry = await prisma.whitelistEntry.findUnique({
      where: { walletAddress: wallet.toLowerCase() },
    });

    const total = await prisma.whitelistEntry.count();

    return NextResponse.json({
      success: true,
      registered: !!entry,
      totalEntries: total,
    });
  } catch (error) {
    console.error("Whitelist check error:", error);
    return NextResponse.json({ error: "Failed to check" }, { status: 500 });
  }
}
