import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { buildCollectionBagsView } from "@/lib/collection-bags";
import { fetchBagsCollectionAnalytics, isBagsConfigured } from "@/lib/bags";
import { isBagsIntegrationEnabled } from "@/lib/env";
import { ipfsToHttp } from "@/lib/ipfs";
import {
  fetchMetaplexCandyMachineState,
  LEGACY_SOLANA_MINT_ENGINE,
  METAPLEX_MINT_ENGINE,
} from "@/lib/metaplex-core-candy-machine";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
    const { address } = await params;
    if (!address) {
      return NextResponse.json(
        { success: false, error: "Address is required" },
        { status: 400 }
      );
    }

    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address: address.toLowerCase() }, { address }],
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
            eoa: true,
            xHandle: true,
            solanaWalletAddress: true,
          },
        },
      },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    if (!SOLANA_COLLECTION_CHAINS.includes(collection.chain as (typeof SOLANA_COLLECTION_CHAINS)[number])) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    const onchain = await fetchOnchainData(collection.mintAddress, collection.mintEngine, collection.maxSupply);
    let bagsCollection = collection;
    const resolvedImageUrl = await resolveCollectionImageUrl(collection.imageUrl, collection.baseUri);

    if (resolvedImageUrl && resolvedImageUrl !== collection.imageUrl) {
      try {
        bagsCollection = await prisma.collection.update({
          where: { id: collection.id },
          data: { imageUrl: resolvedImageUrl },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                description: true,
                avatarUrl: true,
                eoa: true,
                xHandle: true,
                solanaWalletAddress: true,
              },
            },
          },
        });
      } catch (error) {
        console.warn("[Collection] Failed to persist resolved image URL:", error);
      }
    }

    if (collection.bagsStatus === "LIVE" && collection.bagsTokenAddress && isBagsConfigured()) {
      try {
        const analytics = await fetchBagsCollectionAnalytics(collection.bagsTokenAddress);
        bagsCollection = {
          ...collection,
          bagsLifetimeFees: analytics.lifetimeFeesLamports,
          bagsClaimedFees: analytics.claimedFeesLamports,
          bagsScore: analytics.score,
          bagsAnalyticsUpdatedAt: new Date(),
        };

        await prisma.collection.update({
          where: { id: collection.id },
          data: {
            bagsLifetimeFees: analytics.lifetimeFeesLamports,
            bagsClaimedFees: analytics.claimedFeesLamports,
            bagsScore: analytics.score,
            bagsAnalyticsUpdatedAt: new Date(),
          },
        });
      } catch (error) {
        console.warn("[Bags] Collection analytics refresh failed:", error);
      }
    }

    if (
      onchain &&
      (onchain.total_minted !== String(collection.totalMinted) ||
        (onchain.is_sold_out ? "SOLD_OUT" : "ACTIVE") !== collection.status)
    ) {
      try {
        bagsCollection = await prisma.collection.update({
          where: { id: collection.id },
          data: {
            totalMinted: Number(onchain.total_minted),
            status: onchain.is_sold_out ? "SOLD_OUT" : collection.status === "FAILED" ? "FAILED" : "ACTIVE",
          },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                description: true,
                avatarUrl: true,
                eoa: true,
                xHandle: true,
                solanaWalletAddress: true,
              },
            },
          },
        });
      } catch (error) {
        console.warn("[Collection] Failed to sync on-chain mint state:", error);
      }
    }

    const bagsEnabled = isBagsIntegrationEnabled();
    const bagsView = buildCollectionBagsView(bagsCollection);
    const publicCollectionUrl = `${appUrl}/collection/${bagsCollection.address}`;
    const mintEngine = bagsCollection.mintEngine || LEGACY_SOLANA_MINT_ENGINE;
    const isMetaplexMint = mintEngine === METAPLEX_MINT_ENGINE && Boolean(bagsCollection.mintAddress);
    const bagsGateBlockedWhileDisabled =
      !bagsEnabled && bagsCollection.bagsMintAccess === "bags_balance";
    const bagsTokenGatePending =
      !bagsGateBlockedWhileDisabled &&
      bagsView?.mint_access === "bags_balance" &&
      (!bagsView.token_address || bagsView.status !== "LIVE");
    const mintEnabled =
      isMetaplexMint &&
      bagsCollection.status !== "FAILED" &&
      !bagsGateBlockedWhileDisabled &&
      !bagsTokenGatePending &&
      !onchain?.is_sold_out;

    return NextResponse.json({
      success: true,
      collection: {
        id: bagsCollection.id,
        address: bagsCollection.address,
        collection_url: publicCollectionUrl,
        chain: bagsCollection.chain,
        native_token: getCollectionNativeToken(bagsCollection.chain),
        mint_engine: mintEngine,
        mint_address: bagsCollection.mintAddress,
        mint_enabled: mintEnabled,
        mint_prepare_endpoint: mintEnabled ? `/api/collections/${bagsCollection.address}/mint/prepare` : null,
        mint_confirm_endpoint: mintEnabled ? `/api/collections/${bagsCollection.address}/mint/confirm` : null,
        mint_disabled_reason: mintEnabled
          ? null
          : mintEngine !== METAPLEX_MINT_ENGINE
            ? "This legacy Solana collection uses the old state-only runtime and cannot issue NFTs."
            : bagsGateBlockedWhileDisabled
              ? "Bags integration is temporarily disabled for this collection."
            : bagsTokenGatePending
              ? "This collection is waiting for its Bags token gate to go live before mint opens."
              : onchain?.is_sold_out
                ? "This collection is sold out."
                : "Mint is not available for this collection yet.",
        name: bagsCollection.name,
        symbol: bagsCollection.symbol,
        description: bagsCollection.description,
        image_url: resolvedImageUrl || bagsCollection.imageUrl,
        base_uri: bagsCollection.baseUri,
        max_supply: bagsCollection.maxSupply,
        total_minted: bagsCollection.totalMinted,
        mint_price_raw: bagsCollection.mintPrice,
        mint_price_native: formatCollectionMintPrice(bagsCollection.mintPrice, bagsCollection.chain),
        royalty_bps: bagsCollection.royaltyBps,
        payout_address: bagsCollection.payoutAddress,
        authority_address: bagsCollection.authorityAddress,
        status: bagsCollection.status,
        deployed_at: bagsCollection.deployedAt?.toISOString(),
        deploy_tx_hash: bagsCollection.deployTxHash,
        bags: bagsEnabled ? bagsView : null,
        bags_managed_by_agent: Boolean(
          bagsEnabled &&
          bagsCollection.bagsCreatorWallet &&
            bagsCollection.agent.solanaWalletAddress &&
            bagsCollection.bagsCreatorWallet === bagsCollection.agent.solanaWalletAddress
        ),
        agent: {
          id: bagsCollection.agent.id,
          name: bagsCollection.agent.name,
          description: bagsCollection.agent.description,
          avatar_url: bagsCollection.agent.avatarUrl,
          eoa: bagsCollection.agent.eoa,
          x_handle: bagsCollection.agent.xHandle,
        },
        onchain,
      },
    });
  } catch (error) {
    console.error("Get collection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

async function fetchOnchainData(
  mintAddress: string | null,
  mintEngine: string | null,
  fallbackMaxSupply: number
) {
  if (mintEngine !== METAPLEX_MINT_ENGINE || !mintAddress) {
    return null;
  }

  try {
    const state = await fetchMetaplexCandyMachineState(mintAddress);
    return {
      total_minted: String(state.itemsRedeemed),
      remaining: String(state.remaining),
      is_sold_out: state.isSoldOut,
      items_available: String(state.itemsAvailable || fallbackMaxSupply),
    };
  } catch (error) {
    console.warn("[Collection] Failed to load Metaplex candy machine state:", error);
    return null;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveMetadataAssetUrl(candidate: string, baseUri: string): string {
  if (candidate.startsWith("ipfs://")) {
    return ipfsToHttp(candidate);
  }

  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  const normalizedBase = ensureTrailingSlash(baseUri.startsWith("ipfs://") ? ipfsToHttp(baseUri) : baseUri);
  return `${normalizedBase}${candidate.replace(/^\.?\//, "")}`;
}

async function resolveCollectionImageUrl(imageUrl: string | null, baseUri: string): Promise<string | null> {
  const normalizedBase = ensureTrailingSlash(baseUri.startsWith("ipfs://") ? ipfsToHttp(baseUri) : baseUri);

  try {
    const response = await fetch(`${normalizedBase}collection.json`, {
      cache: "no-store",
      redirect: "follow",
    });

    if (response.ok) {
      const metadata = (await response.json()) as { image?: string; image_url?: string };
      const candidate = metadata.image || metadata.image_url;
      if (candidate) {
        return resolveMetadataAssetUrl(candidate, baseUri);
      }
    }
  } catch (error) {
    console.warn("[Collection] Failed to resolve collection metadata image:", error);
  }

  if (!imageUrl) {
    return null;
  }

  return imageUrl.startsWith("ipfs://") ? ipfsToHttp(imageUrl) : imageUrl;
}
