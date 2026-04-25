import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAgentMetaplexSummary } from "@/lib/metaplex-agent-registry";
import { buildMoonPayFundingUrl } from "@/lib/moonpay";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// POST /api/v1/claims/[code]/verify
// Verify claim via tweet
// ═══════════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await request.json();
    const { tweet_url } = body;

    if (!tweet_url) {
      return NextResponse.json(
        { success: false, error: "Tweet URL is required" },
        { status: 400 }
      );
    }

    // Find the claim
    const claim = await prisma.agentClaim.findUnique({
      where: { claimCode: code },
      include: {
        agent: true,
      },
    });

    if (!claim) {
      return NextResponse.json(
        { success: false, error: "Claim not found" },
        { status: 404 }
      );
    }

    // Check if already verified
    if (claim.status === "VERIFIED" || claim.agent.status === "VERIFIED") {
      return NextResponse.json(
        { success: false, error: "Already verified" },
        { status: 409 }
      );
    }

    // Check if expired
    if (claim.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: "Claim has expired" },
        { status: 410 }
      );
    }

    const verificationCode = claim.signature;
    let tweetVerified = false;
    try {
      tweetVerified = await verifyTweet(tweet_url, verificationCode || "", claim.agent.name);
    } catch (error) {
      if (error instanceof TweetVerificationConfigError) {
        return NextResponse.json(
          {
            success: false,
            error: "Tweet verification is temporarily unavailable",
            hint: "Server is missing Twitter API credentials. Contact the administrator.",
          },
          { status: 503 }
        );
      }
      throw error;
    }

    if (!tweetVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "Tweet verification failed",
          hint: `Make sure your tweet contains the code: ${verificationCode}`,
        },
        { status: 400 }
      );
    }

    // Extract X handle from tweet URL
    const xHandle = extractXHandle(tweet_url);

    // Update claim
    await prisma.agentClaim.update({
      where: { id: claim.id },
      data: {
        status: "VERIFIED",
        tweetUrl: tweet_url,
        verifiedAt: new Date(),
      },
    });

    // Update agent
    const updatedAgent = await prisma.agent.update({
      where: { id: claim.agent.id },
      data: {
        status: "VERIFIED",
        deployEnabled: true,
        verifiedAt: new Date(),
        xHandle: xHandle,
      },
    });

    // Metaplex + Synapse SAP on-chain identity sync is intentionally NOT awaited here.
    // It can take 30+ seconds (multiple Metaplex Core + agent-registry transactions plus a
    // Synapse Agent Protocol registration), which exceeds the platform HTTP timeout and
    // would cause the verify request to fail even though the claim itself succeeded.
    // The agent should call POST /api/v1/agents/metaplex (staged, retry-safe) once the
    // wallet is funded to complete the on-chain identity sync.
    let metaplexWarning: string | null = null;
    let metaplexSummary = null;
    try {
      metaplexSummary = await getAgentMetaplexSummary(updatedAgent.id);
    } catch (error) {
      metaplexWarning =
        error instanceof Error
          ? error.message
          : "Metaplex summary could not be loaded yet.";
    }

    return NextResponse.json({
      success: true,
      message: "Agent verified successfully!",
      agent: {
        name: claim.agent.name,
        status: "VERIFIED",
        can_deploy: true,
        wallet_address: claim.agent.solanaWalletAddress,
        moonpay_funding_url: claim.agent.solanaWalletAddress
          ? buildMoonPayFundingUrl({
              walletAddress: claim.agent.solanaWalletAddress,
              redirectUrl: `${process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz"}/agents/${updatedAgent.id}`,
              externalCustomerId: updatedAgent.id,
            })
          : null,
        metaplex: metaplexSummary,
      },
      next_step: {
        action: "sync_metaplex_identity",
        endpoint: "/api/v1/agents/metaplex",
        method: "POST",
        when: "After the agent wallet has SOL for Metaplex + SAP transactions",
        notes:
          "Staged and retry-safe. Re-call until status=ACTIVE. SAP on-chain registration runs in the final step.",
      },
      warning: metaplexWarning,
    });
  } catch (error) {
    console.error("Verify claim error:", error);
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

class TweetVerificationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TweetVerificationConfigError";
  }
}

async function verifyTweet(tweetUrl: string, verificationCode: string, agentName: string): Promise<boolean> {
  const bearerToken = process.env["TWITTER_BEARER_TOKEN"]?.trim();
  const allowUnverifiedTweets =
    process.env["ALLOW_UNVERIFIED_TWEET_CLAIMS"] === "true" &&
    process.env["NODE_ENV"] !== "production";

  const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
  if (!tweetIdMatch) {
    return false;
  }

  if (!verificationCode) {
    return false;
  }

  if (!bearerToken) {
    if (allowUnverifiedTweets) {
      console.warn(
        "[claims/verify] TWITTER_BEARER_TOKEN missing, accepting tweet without content check (dev override)."
      );
      return true;
    }
    throw new TweetVerificationConfigError(
      "Tweet verification is not configured: TWITTER_BEARER_TOKEN is missing on the server."
    );
  }

  try {
    const tweetId = tweetIdMatch[1];

    const response = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Twitter API error:", response.statusText);
      return false;
    }

    const data = await response.json();
    const tweetText = (data.data?.text as string | undefined) || "";

    return (
      tweetText.includes(verificationCode) &&
      tweetText.toLowerCase().includes(agentName.toLowerCase())
    );
  } catch (error) {
    console.error("Tweet verification error:", error);
    return false;
  }
}

function extractXHandle(tweetUrl: string): string | null {
  // Extract handle from URL like https://x.com/handle/status/123 or https://twitter.com/handle/status/123
  const match = tweetUrl.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status/);
  return match ? match[1] : null;
}
