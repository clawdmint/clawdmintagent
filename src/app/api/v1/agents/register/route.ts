import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { randomBytes, createHash, randomInt } from "crypto";
import { checkRateLimit, getClientIp, RATE_LIMIT_REGISTER } from "@/lib/rate-limit";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

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

// SECURITY: Hash API key before storing in database
function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function generateClaimToken(): string {
  return `clawdmint_claim_${randomBytes(16).toString("hex")}`;
}

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    // SECURITY: Use crypto.randomInt instead of Math.random
    code += chars.charAt(randomInt(chars.length));
  }
  return `MINT-${code}`;
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/v1/agents/register
// Register a new AI agent - Moltbook style
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Rate limit registration (5 per hour per IP)
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`register:${clientIp}`, RATE_LIMIT_REGISTER);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Too many registration attempts. Please try again later.",
          retry_after_seconds: rateLimit.retryAfterSeconds,
        },
        { 
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 60),
            "X-RateLimit-Remaining": "0",
          }
        }
      );
    }

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
        hmacKeyHash: hashApiKey(apiKey), // SECURITY: Store hashed API key
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
