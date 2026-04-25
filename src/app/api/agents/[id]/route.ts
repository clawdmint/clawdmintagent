import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatCollectionMintPrice, getCollectionNativeToken, SOLANA_COLLECTION_CHAINS } from "@/lib/collection-chains";
import { filterVisiblePublicCollections, PUBLIC_COLLECTION_STATUSES } from "@/lib/public-collections";
import { getAgentWalletReputation, getHumanWalletReputation } from "@/lib/fairscale";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// GET /api/agents/[id]
// Public endpoint - Get single agent details
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
    const { id } = await params;
    const viewerWallet = request.nextUrl.searchParams.get("viewer_wallet")?.trim() || null;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        collections: {
          where: {
            status: { in: [...PUBLIC_COLLECTION_STATUSES] },
            chain: { in: SOLANA_COLLECTION_CHAINS },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            address: true,
            chain: true,
            name: true,
            symbol: true,
            imageUrl: true,
            maxSupply: true,
            totalMinted: true,
            mintPrice: true,
            status: true,
            createdAt: true,
          },
        },
        tokenLaunches: {
          where: {
            chain: { in: ["solana", "solana-devnet"] },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            tokenName: true,
            tokenSymbol: true,
            tokenAddress: true,
            txHash: true,
            launchType: true,
            network: true,
            launchUrl: true,
            imageUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agent || agent.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    const publicCollections = filterVisiblePublicCollections(agent.collections);

    const reputationWallet = agent.solanaWalletAddress || null;
    const reputationSource = agent.solanaWalletAddress ? "agent" : null;
    const ownerWalletAddress =
      agent.ownerWalletAddress ||
      (agent.ownerWalletChain === "solana" && agent.eoa && !agent.eoa.startsWith("0x") ? agent.eoa : null);
    const [reputation, ownerReputation, followersCount, existingFollow] = await Promise.all([
      reputationWallet ? getAgentWalletReputation(reputationWallet) : Promise.resolve(null),
      ownerWalletAddress ? getHumanWalletReputation(ownerWalletAddress) : Promise.resolve(null),
      prisma.agentFollow.count({ where: { agentId: agent.id } }),
      viewerWallet
        ? prisma.agentFollow.findUnique({
            where: {
              agentId_walletAddress: {
                agentId: agent.id,
                walletAddress: viewerWallet,
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatar_url: agent.avatarUrl,
        eoa: agent.eoa,
        solana_wallet_address: agent.solanaWalletAddress,
        owner_wallet_address: ownerWalletAddress,
        owner_wallet_chain: agent.ownerWalletChain || (ownerWalletAddress ? "solana" : null),
        metaplex: {
          registered: Boolean(agent.metaplexAssetAddress && agent.metaplexIdentityPda),
          delegated: Boolean(agent.metaplexExecutionDelegatePda),
          asset_address: agent.metaplexAssetAddress,
          collection_address: agent.metaplexCollectionAddress,
          registration_uri: agent.metaplexRegistrationUri,
          identity_pda: agent.metaplexIdentityPda,
          executive_profile_pda: agent.metaplexExecutiveProfilePda,
          execution_delegate_pda: agent.metaplexExecutionDelegatePda,
          registered_at: agent.metaplexRegisteredAt?.toISOString() || null,
          delegated_at: agent.metaplexDelegatedAt?.toISOString() || null,
          synapse_sap: agent.synapseSapAgentPda
            ? {
                registered: true,
                agent_pda: agent.synapseSapAgentPda,
                stats_pda: agent.synapseSapStatsPda,
                tx_signature: agent.synapseSapTxSignature,
                agent_id: `did:sap:clawdmint:${agent.id}`,
                agent_uri: agent.metaplexRegistrationUri,
                x402_endpoint: process.env["SYNAPSE_SAP_X402_ENDPOINT"] || `${appUrl}/api/x402/pricing`,
                registered_at: agent.synapseSapRegisteredAt?.toISOString() || null,
              }
            : null,
        },
        x_handle: agent.xHandle,
        verified_at: agent.verifiedAt?.toISOString(),
        followers_count: followersCount,
        is_following: Boolean(existingFollow),
        reputation: reputation
          ? {
              wallet_address: reputation.walletAddress,
              source: reputationSource,
              score: reputation.score,
              wallet_score: reputation.walletScore,
              social_score: reputation.socialScore,
              tier: reputation.tier,
              badges: reputation.badges,
              availability: reputation.availability,
              trust_signal: reputation.trustSignal,
              profile_state: reputation.profileState,
              is_thin_profile: reputation.isThinProfile,
              warning_label: reputation.warningLabel,
              warning_text: reputation.warningText,
              breakdown: reputation.breakdown,
              fetched_at: reputation.fetchedAt,
            }
          : null,
        owner_reputation: ownerReputation
          ? {
              wallet_address: ownerReputation.walletAddress,
              source: "owner",
              score: ownerReputation.score,
              wallet_score: ownerReputation.walletScore,
              social_score: ownerReputation.socialScore,
              tier: ownerReputation.tier,
              badges: ownerReputation.badges,
              availability: ownerReputation.availability,
              trust_signal: ownerReputation.trustSignal,
              profile_state: ownerReputation.profileState,
              is_thin_profile: ownerReputation.isThinProfile,
              warning_label: ownerReputation.warningLabel,
              warning_text: ownerReputation.warningText,
              breakdown: ownerReputation.breakdown,
              fetched_at: ownerReputation.fetchedAt,
            }
          : null,
        collections: publicCollections.map((c) => ({
          id: c.id,
          address: c.address,
          collection_url: `${appUrl}/collection/${c.address}`,
          chain: c.chain,
          name: c.name,
          symbol: c.symbol,
          image_url: c.imageUrl,
          max_supply: c.maxSupply,
          total_minted: c.totalMinted,
          mint_price_raw: c.mintPrice,
          mint_price_native: formatCollectionMintPrice(c.mintPrice, c.chain),
          native_token: getCollectionNativeToken(c.chain),
          status: c.status,
          created_at: c.createdAt.toISOString(),
        })),
        token_launches: agent.tokenLaunches.map((launch) => ({
          id: launch.id,
          name: launch.tokenName,
          symbol: launch.tokenSymbol,
          token_address: launch.tokenAddress,
          tx_hash: launch.txHash,
          launch_type: launch.launchType,
          network: launch.network,
          launch_url: launch.launchUrl,
          image_url: launch.imageUrl,
          created_at: launch.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Get agent error:", error);
    return NextResponse.json(
      { error: "Failed to get agent" },
      { status: 500 }
    );
  }
}
