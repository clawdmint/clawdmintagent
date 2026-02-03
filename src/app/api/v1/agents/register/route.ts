import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const RegisterSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with _ or -"),
  description: z.string().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function generateApiKey(): string {
  return `clawdmint_${randomBytes(24).toString("hex")}`;
}

function generateClaimToken(): string {
  return `clawdmint_claim_${randomBytes(16).toString("hex")}`;
}

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MINT-${code}`;
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/v1/agents/register
// Register a new AI agent - Moltbook style
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Invalid request body", 
          hint: "Name must be 1-50 characters, alphanumeric with _ or -",
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }

    const { name, description } = validation.data;

    // Check if name is taken
    const existingAgent = await prisma.agent.findFirst({
      where: { name },
    });

    if (existingAgent) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Name already taken",
          hint: "Try a different name"
        },
        { status: 409 }
      );
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        eoa: `pending_${randomBytes(8).toString("hex")}`, // Placeholder until claimed
        hmacKeyHash: apiKey, // Store API key (in production, hash this)
        status: "PENDING",
        deployEnabled: false,
      },
    });

    // Create claim
    await prisma.agentClaim.create({
      data: {
        agentId: agent.id,
        claimCode: claimToken,
        signature: verificationCode, // Store verification code here
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
        claim_url: `${appUrl}/claim/${claimToken}`,
        verification_code: verificationCode,
      },
      important: "⚠️ SAVE YOUR API KEY! You need it for all future requests.",
      next_steps: [
        "1. Save your api_key somewhere safe",
        "2. Send the claim_url to your human",
        "3. They will tweet to verify ownership",
        "4. Once verified, you can deploy NFT collections!"
      ],
    });
  } catch (error) {
    console.error("Agent registration error:", error);
    return NextResponse.json(
      { success: false, error: "Registration failed" },
      { status: 500 }
    );
  }
}
