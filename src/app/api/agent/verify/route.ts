import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyEip191Signature, validateAndChecksumAddress } from "@/lib/auth";
import { addAgentToAllowlist } from "@/lib/contracts";

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const VerifySchema = z.object({
  agent_eoa: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid signature format"),
  tweet_url: z.string().url().optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/agent/verify
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify agent ownership via EIP-191 signature
 * 
 * This is the final step in the agent onboarding flow:
 * 1. REGISTER - Agent provides basic info
 * 2. CLAIM - Generate verification code
 * 3. VERIFY (this endpoint) - Prove ownership via signature
 * 
 * Required:
 * - signature: EIP-191 signature of the claim code
 * 
 * Optional:
 * - tweet_url: Twitter post containing claim code
 * 
 * On success:
 * - Agent status updated to VERIFIED
 * - Agent added to on-chain factory allowlist
 * - Deploy enabled
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = VerifySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { agent_eoa, signature, tweet_url } = validation.data;

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
        { error: "Agent not registered" },
        { status: 404 }
      );
    }

    // Check if already verified
    if (agent.status === "VERIFIED") {
      return NextResponse.json(
        {
          success: true,
          message: "Agent already verified",
          agent: {
            id: agent.id,
            status: agent.status,
            deploy_enabled: agent.deployEnabled,
          },
        }
      );
    }

    // Find pending claim
    const claim = await prisma.agentClaim.findFirst({
      where: {
        agentId: agent.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!claim) {
      return NextResponse.json(
        { error: "No pending claim found. Generate a new claim first." },
        { status: 404 }
      );
    }

    // Verify EIP-191 signature
    const isValidSignature = await verifyEip191Signature(
      claim.claimCode,
      signature as `0x${string}`,
      checksummedAddress
    );

    if (!isValidSignature) {
      // Mark claim as failed after multiple attempts could be added here
      return NextResponse.json(
        { error: "Invalid signature. Make sure you signed the exact claim code with the registered address." },
        { status: 401 }
      );
    }

    // Optional: Verify tweet (if Twitter API is configured)
    let tweetVerified = false;
    if (tweet_url) {
      tweetVerified = await verifyTweet(tweet_url, claim.claimCode, checksummedAddress);
    }

    // Add agent to on-chain allowlist
    let txHash: string | null = null;
    try {
      txHash = await addAgentToAllowlist(checksummedAddress as `0x${string}`);
    } catch (error) {
      console.error("Failed to add agent to on-chain allowlist:", error);
      // Continue with verification - admin can add manually
      // In production, you might want to retry or queue this
    }

    // Update claim
    await prisma.agentClaim.update({
      where: { id: claim.id },
      data: {
        status: "VERIFIED",
        signature,
        tweetUrl: tweet_url,
        verifiedAt: new Date(),
      },
    });

    // Update agent
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: "VERIFIED",
        deployEnabled: true,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Agent verified successfully!",
      agent: {
        id: updatedAgent.id,
        name: updatedAgent.name,
        eoa: updatedAgent.eoa,
        status: updatedAgent.status,
        deploy_enabled: updatedAgent.deployEnabled,
        verified_at: updatedAgent.verifiedAt?.toISOString(),
      },
      verification: {
        signature_valid: true,
        tweet_verified: tweetVerified,
        onchain_allowlist_tx: txHash,
      },
      next_steps: [
        "Your agent is now verified and can deploy NFT collections!",
        "Use POST /api/agent/collections to deploy a new collection",
        "Authentication: Use HMAC-SHA256 headers for all API calls",
      ],
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify a tweet contains the claim code and address
 * Requires TWITTER_BEARER_TOKEN environment variable
 */
async function verifyTweet(
  tweetUrl: string,
  claimCode: string,
  address: string
): Promise<boolean> {
  const bearerToken = process.env["TWITTER_BEARER_TOKEN"];
  if (!bearerToken) {
    console.log("Twitter verification skipped: no bearer token configured");
    return false;
  }

  try {
    // Extract tweet ID from URL
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
      return false;
    }
    const tweetId = tweetIdMatch[1];

    // Fetch tweet from Twitter API
    const response = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const tweetText = data.data?.text || "";

    // Check if tweet contains claim code and address
    return (
      tweetText.includes(claimCode) &&
      tweetText.toLowerCase().includes(address.toLowerCase())
    );
  } catch (error) {
    console.error("Tweet verification error:", error);
    return false;
  }
}
