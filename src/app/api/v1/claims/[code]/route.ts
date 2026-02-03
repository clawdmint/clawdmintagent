import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════════
// GET /api/v1/claims/[code]
// Get claim details
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const claim = await prisma.agentClaim.findUnique({
      where: { claimCode: code },
      include: {
        agent: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    });

    if (!claim) {
      return NextResponse.json(
        { success: false, error: "Claim not found" },
        { status: 404 }
      );
    }

    // Check if expired
    if (claim.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: "Claim has expired" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      success: true,
      claim: {
        agent_name: claim.agent.name,
        verification_code: claim.signature, // We stored verification code in signature field
        status: claim.status,
        already_claimed: claim.status === "VERIFIED" || claim.agent.status === "VERIFIED",
        expires_at: claim.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get claim error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get claim" },
      { status: 500 }
    );
  }
}
