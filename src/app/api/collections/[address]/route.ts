import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
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

    let currentCollection = collection;
    const onchain = await fetchOnchainData(collection.mintAddress, collection.mintEngine, collection.maxSupply);
    const resolvedImageUrl = await resolveCollectionImageUrl(collection.imageUrl, collection.baseUri);

    if (resolvedImageUrl && resolvedImageUrl !== collection.imageUrl) {
      try {
        currentCollection = await prisma.collection.update({
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

    const derivedOnchainStatus =
      onchain?.is_sold_out
        ? "SOLD_OUT"
        : onchain && !onchain.is_fully_loaded
          ? "DEPLOYING"
          : "ACTIVE";

    if (
      onchain &&
      (onchain.total_minted !== String(collection.totalMinted) ||
        derivedOnchainStatus !== collection.status)
    ) {
      try {
        currentCollection = await prisma.collection.update({
          where: { id: collection.id },
          data: {
            totalMinted: Number(onchain.total_minted),
            status: collection.status === "FAILED" ? "FAILED" : derivedOnchainStatus,
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

    const publicCollectionUrl = `${appUrl}/collection/${currentCollection.address}`;
    const mintEngine = currentCollection.mintEngine || LEGACY_SOLANA_MINT_ENGINE;
    const isMetaplexMint = mintEngine === METAPLEX_MINT_ENGINE && Boolean(currentCollection.mintAddress);
    const mintEnabled =
      isMetaplexMint &&
      currentCollection.status !== "FAILED" &&
      Boolean(onchain?.is_fully_loaded ?? true) &&
      !onchain?.is_sold_out;

    return NextResponse.json({
      success: true,
      collection: {
        id: currentCollection.id,
        address: currentCollection.address,
        collection_url: publicCollectionUrl,
        chain: currentCollection.chain,
        native_token: getCollectionNativeToken(currentCollection.chain),
        mint_engine: mintEngine,
        mint_address: currentCollection.mintAddress,
        mint_enabled: mintEnabled,
        mint_prepare_endpoint: mintEnabled ? `/api/collections/${currentCollection.address}/mint/prepare` : null,
        mint_confirm_endpoint: mintEnabled ? `/api/collections/${currentCollection.address}/mint/confirm` : null,
        mint_disabled_reason: mintEnabled
          ? null
          : mintEngine !== METAPLEX_MINT_ENGINE
            ? "This legacy Solana collection uses the old state-only runtime and cannot issue NFTs."
            : onchain && !onchain.is_fully_loaded
              ? "This collection is still loading Candy Machine config lines. Retry the staged deploy until it is fully loaded."
              : onchain?.is_sold_out
                ? "This collection is sold out."
                : "Mint is not available for this collection yet.",
        name: currentCollection.name,
        symbol: currentCollection.symbol,
        description: currentCollection.description,
        image_url: resolvedImageUrl || currentCollection.imageUrl,
        base_uri: currentCollection.baseUri,
        max_supply: currentCollection.maxSupply,
        total_minted: currentCollection.totalMinted,
        mint_price_raw: currentCollection.mintPrice,
        mint_price_native: formatCollectionMintPrice(currentCollection.mintPrice, currentCollection.chain),
        royalty_bps: currentCollection.royaltyBps,
        payout_address: currentCollection.payoutAddress,
        authority_address: currentCollection.authorityAddress,
        status: currentCollection.status,
        deployed_at: currentCollection.deployedAt?.toISOString(),
        deploy_tx_hash: currentCollection.deployTxHash,
        agent: {
          id: currentCollection.agent.id,
          name: currentCollection.agent.name,
          description: currentCollection.agent.description,
          avatar_url: currentCollection.agent.avatarUrl,
          eoa: currentCollection.agent.eoa,
          x_handle: currentCollection.agent.xHandle,
          solana_wallet_address: currentCollection.agent.solanaWalletAddress,
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
      is_fully_loaded: state.isFullyLoaded,
      items_available: String(state.itemsAvailable || fallbackMaxSupply),
      items_loaded: String(state.itemsLoaded),
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
