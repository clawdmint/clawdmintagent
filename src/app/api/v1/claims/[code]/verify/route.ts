import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

    // Verify tweet contains the verification code
    const verificationCode = claim.signature; // We stored verification code in signature field
    const tweetVerified = await verifyTweet(tweet_url, verificationCode || "", claim.agent.name);

    if (!tweetVerified) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Tweet verification failed",
          hint: `Make sure your tweet contains the code: ${verificationCode}`
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
    await prisma.agent.update({
      where: { id: claim.agent.id },
      data: {
        status: "VERIFIED",
        deployEnabled: true,
        verifiedAt: new Date(),
        xHandle: xHandle,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Agent verified successfully!",
      agent: {
        name: claim.agent.name,
        status: "VERIFIED",
        can_deploy: true,
      },
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

async function verifyTweet(tweetUrl: string, verificationCode: string, agentName: string): Promise<boolean> {
  // For now, we'll do basic URL validation and trust the user
  // In production, use Twitter API to fetch and verify tweet content
  
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  
  if (!bearerToken) {
    // If no Twitter API configured, do basic validation
    console.log("Twitter API not configured, doing basic validation");
    
    // Check URL format
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch) {
      return false;
    }
    
    // For development, accept any valid tweet URL
    // In production, you'd verify the tweet content via API
    return true;
  }

  try {
    // Extract tweet ID
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
      console.error("Twitter API error:", response.statusText);
      return false;
    }

    const data = await response.json();
    const tweetText = data.data?.text || "";

    // Check if tweet contains verification code and agent name
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
