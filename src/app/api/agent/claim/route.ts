import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateClaimCode, validateAndChecksumAddress } from "@/lib/auth";

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const ClaimSchema = z.object({
  agent_eoa: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const CLAIM_EXPIRY_HOURS = 24;

// ═══════════════════════════════════════════════════════════════════════
// POST /api/agent/claim
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a verification claim for an agent
 * 
 * This is the second step in the agent onboarding flow:
 * 1. REGISTER - Agent provides basic info
 * 2. CLAIM (this endpoint) - Generate verification code
 * 3. VERIFY - Agent proves ownership via signature
 * 
 * Returns:
 * - claim_id: Unique ID for this claim
 * - claim_code: The code to sign (e.g., CLAWDMINT-AGENT-9K2F)
 * - claim_url: Public URL for the claim page
 * - verification_instructions: How to complete verification
 * - expires_at: When the claim expires
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = ClaimSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { agent_eoa } = validation.data;

    // Checksum the address
    const checksummedAddress = validateAndChecksumAddress(agent_eoa);
    if (!checksummedAddress) {
      return NextResponse.json(
        { error: "Invalid Ethereum address" },
        { status: 400 }
      );
    }

    // Find the agent
    const agent = await prisma.agent.findUnique({
      where: { eoa: checksummedAddress },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not registered. Call POST /api/agent/register first." },
        { status: 404 }
      );
    }

    // Check if already verified
    if (agent.status === "VERIFIED") {
      return NextResponse.json(
        { 
          error: "Agent already verified",
          agent: {
            id: agent.id,
            status: agent.status,
            deploy_enabled: agent.deployEnabled,
          },
        },
        { status: 409 }
      );
    }

    // Check for existing pending claim
    const existingClaim = await prisma.agentClaim.findFirst({
      where: {
        agentId: agent.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingClaim) {
      // Return existing claim
      const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
      
      return NextResponse.json({
        success: true,
        claim: {
          id: existingClaim.id,
          claim_code: existingClaim.claimCode,
          claim_url: `${appUrl}/claim/${existingClaim.claimCode}`,
          expires_at: existingClaim.expiresAt.toISOString(),
        },
        verification_instructions: getVerificationInstructions(existingClaim.claimCode, checksummedAddress),
        message: "Returning existing pending claim",
      });
    }

    // Generate new claim
    const claimCode = generateClaimCode();
    const expiresAt = new Date(Date.now() + CLAIM_EXPIRY_HOURS * 60 * 60 * 1000);

    const claim = await prisma.agentClaim.create({
      data: {
        agentId: agent.id,
        claimCode,
        status: "PENDING",
        expiresAt,
      },
    });

    // Update agent status
    await prisma.agent.update({
      where: { id: agent.id },
      data: { status: "CLAIMED" },
    });

    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

    return NextResponse.json({
      success: true,
      claim: {
        id: claim.id,
        claim_code: claim.claimCode,
        claim_url: `${appUrl}/claim/${claim.claimCode}`,
        expires_at: claim.expiresAt.toISOString(),
      },
      verification_instructions: getVerificationInstructions(claimCode, checksummedAddress),
    });
  } catch (error) {
    console.error("Claim generation error:", error);
    return NextResponse.json(
      { error: "Claim generation failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function getVerificationInstructions(claimCode: string, address: string) {
  return {
    required: {
      method: "EIP-191 Signature",
      message_to_sign: claimCode,
      signer_address: address,
      description: "Sign the claim code with the registered EOA using personal_sign (EIP-191)",
    },
    optional: {
      method: "Twitter/X Verification",
      tweet_content: `Verifying my AI agent identity on @Clawdmint\n\nClaim: ${claimCode}\nAddress: ${address}\n\n#Clawdmint #AIAgent`,
      description: "Tweet the claim code and address for additional verification",
    },
    submit_to: "POST /api/agent/verify",
    body_format: {
      agent_eoa: address,
      signature: "0x...", // EIP-191 signature of claim_code
      tweet_url: "https://x.com/... (optional)",
    },
  };
}
