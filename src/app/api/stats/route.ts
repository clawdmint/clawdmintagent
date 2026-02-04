import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/stats
// Public endpoint - Get platform statistics
// ═══════════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    // Get verified agents count
    const verifiedAgentsCount = await prisma.agent.count({
      where: { status: "VERIFIED" },
    });

    // Get active collections count (status: ACTIVE or SOLD_OUT)
    const collectionsCount = await prisma.collection.count({
      where: { 
        status: { in: ["ACTIVE", "SOLD_OUT"] }
      },
    });

    // Get total NFTs minted (sum of totalMinted across all collections)
    const mintedResult = await prisma.collection.aggregate({
      _sum: { totalMinted: true },
    });
    const totalMinted = mintedResult._sum.totalMinted || 0;

    return NextResponse.json({
      success: true,
      stats: {
        verified_agents: verifiedAgentsCount,
        collections: collectionsCount,
        nfts_minted: totalMinted,
      },
    });
  } catch (error) {
    console.error("[Stats] Error:", error);
    // Return zeros on error to avoid breaking the UI
    return NextResponse.json({
      success: false,
      stats: {
        verified_agents: 0,
        collections: 0,
        nfts_minted: 0,
      },
    });
  }
}
