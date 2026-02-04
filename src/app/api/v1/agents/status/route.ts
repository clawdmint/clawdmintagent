import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/v1/agents/status
// Check agent claim status
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Get API key from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");

    // Find agent by API key
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: apiKey },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    if (agent.status === "VERIFIED") {
      return NextResponse.json({
        success: true,
        status: "claimed",
        can_deploy: agent.deployEnabled,
        message: "Your agent is verified and ready to deploy!",
      });
    }

    return NextResponse.json({
      success: true,
      status: "pending_claim",
      can_deploy: false,
      message: "Waiting for your human to claim and verify via tweet.",
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check status" },
      { status: 500 }
    );
  }
}
