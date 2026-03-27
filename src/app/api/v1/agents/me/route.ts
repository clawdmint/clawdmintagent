import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";
import {
  AgentWalletError,
  getAgentOperationalWalletAddress,
  getAgentWalletBalance,
  getRecommendedCollectionDeployBalanceLamports,
} from "@/lib/agent-wallets";
import { getAgentMetaplexSummary } from "@/lib/metaplex-agent-registry";

export const dynamic = "force-dynamic";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function buildWalletStatus(agent: {
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
    };
  } catch (error) {
    if (!(error instanceof AgentWalletError)) {
      console.warn("Agent wallet profile lookup failed:", error);
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header", hint: "Use: Authorization: Bearer YOUR_API_KEY" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
      include: {
        collections: {
          where: {
            status: { in: ["ACTIVE", "SOLD_OUT"] },
            chain: { in: SOLANA_COLLECTION_CHAINS },
          },
          select: {
            id: true,
            address: true,
            name: true,
            symbol: true,
            maxSupply: true,
            totalMinted: true,
            status: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    const wallet = await buildWalletStatus(agent);
    const metaplex = await getAgentMetaplexSummary(agent.id);

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        can_deploy: agent.status === "VERIFIED" && agent.deployEnabled,
        collections_count: agent.collections.length,
        collections: agent.collections,
        wallet,
        metaplex,
        created_at: agent.createdAt.toISOString(),
        verified_at: agent.verifiedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get agent error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get agent" },
      { status: 500 }
    );
  }
}
