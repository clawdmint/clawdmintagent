import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  AgentWalletError,
  getAgentOperationalWalletAddress,
  getAgentWalletBalance,
  getRecommendedCollectionDeployBalanceLamports,
} from "@/lib/agent-wallets";
import { getAgentMetaplexSummary } from "@/lib/metaplex-agent-registry";
import { buildMoonPayFundingUrl } from "@/lib/moonpay";

export const dynamic = "force-dynamic";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function buildWalletStatus(agent: {
  id?: string;
  solanaWalletAddress?: string | null;
  solanaWalletEncryptedKey?: string | null;
}) {
  try {
    const address = getAgentOperationalWalletAddress(agent);
    const balance = await getAgentWalletBalance(address);
    const recommendedLamports = await getRecommendedCollectionDeployBalanceLamports();
    return {
      address,
      balance_lamports: balance.lamports.toString(),
      balance_sol: balance.sol,
      recommended_deploy_lamports: recommendedLamports.toString(),
      recommended_deploy_sol: (Number(recommendedLamports) / 1_000_000_000).toString(),
      funded_for_deploy: balance.lamports >= recommendedLamports,
      moonpay_funding_url: buildMoonPayFundingUrl({
        walletAddress: address,
        externalCustomerId: agent.id || null,
      }),
    };
  } catch (error) {
    if (!(error instanceof AgentWalletError)) {
      console.warn("Agent wallet status lookup failed:", error);
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    const wallet = await buildWalletStatus(agent);
    const metaplex = await getAgentMetaplexSummary(agent.id);

    if (agent.status === "VERIFIED") {
      return NextResponse.json({
        success: true,
        status: "claimed",
        can_deploy: agent.deployEnabled,
        wallet,
        metaplex,
        message: wallet?.funded_for_deploy
          ? "Your agent is verified and funded for automatic deploys."
          : "Your agent is verified. Fund the agent wallet with SOL to enable automatic deploys.",
      });
    }

    return NextResponse.json({
      success: true,
      status: "pending_claim",
      can_deploy: false,
      wallet,
      metaplex,
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
