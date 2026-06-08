import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ipfsToHttp } from "@/lib/ipfs";
import { ensureAssetIndexedFromChain, refreshAssetOwner, syncMintAssets } from "@/lib/marketplace-assets";
import { serializeMarketplaceListing } from "@/lib/marketplace-data";
import { formatLamportsToSol } from "@/lib/platform-fees";

export const dynamic = "force-dynamic";

interface AssetMetadataTrait {
  trait_type: string;
  value: string | number;
  display_type?: string;
  max_value?: number;
}

interface AssetMetadataRarity {
  rank?: number | null;
  score?: number | null;
  tier?: string | null;
}

interface AssetMetadataDetails {
  description: string | null;
  traits: AssetMetadataTrait[];
  rarity: AssetMetadataRarity | null;
  animation_url: string | null;
  properties: Record<string, unknown> | null;
}

function normalizeMetadataUrl(uri: string): string {
  return uri.startsWith("ipfs://") ? ipfsToHttp(uri) : uri;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/^#/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readRarity(metadata: Record<string, unknown>, traits: AssetMetadataTrait[]): AssetMetadataRarity | null {
  const rarityObject = metadata.rarity && typeof metadata.rarity === "object" && !Array.isArray(metadata.rarity)
    ? metadata.rarity as Record<string, unknown>
    : null;

  const rankTrait = traits.find((trait) => ["rank", "rarity rank"].includes(trait.trait_type.trim().toLowerCase()));
  const scoreTrait = traits.find((trait) => ["score", "rarity score"].includes(trait.trait_type.trim().toLowerCase()));
  const tierTrait = traits.find((trait) => ["rarity", "rarity tier", "tier"].includes(trait.trait_type.trim().toLowerCase()));

  const rank = readNumber(rarityObject?.rank ?? metadata.rarity_rank ?? rankTrait?.value);
  const score = readNumber(rarityObject?.score ?? metadata.rarity_score ?? scoreTrait?.value);
  const tierCandidate = rarityObject?.tier ?? metadata.rarity_tier ?? tierTrait?.value;
  const tier = typeof tierCandidate === "string" && tierCandidate.trim() ? tierCandidate.trim() : null;

  if (rank === null && score === null && !tier) {
    return null;
  }

  return { rank, score, tier };
}

async function fetchAssetMetadataDetails(metadataUri: string | null): Promise<AssetMetadataDetails> {
  const emptyDetails: AssetMetadataDetails = {
    description: null,
    traits: [],
    rarity: null,
    animation_url: null,
    properties: null,
  };

  if (!metadataUri) {
    return emptyDetails;
  }

  try {
    const response = await fetch(normalizeMetadataUrl(metadataUri), {
      cache: "no-store",
      redirect: "follow",
      headers: {
        Accept: "application/json",
        "User-Agent": "Clawdmint/1.0 NFT metadata reader",
      },
    });

    if (!response.ok) {
      return emptyDetails;
    }

    const metadata = await response.json() as Record<string, unknown>;
    const traits = Array.isArray(metadata.attributes)
      ? metadata.attributes
          .filter((attribute): attribute is Record<string, unknown> => (
            Boolean(attribute) &&
            typeof attribute === "object" &&
            !Array.isArray(attribute) &&
            typeof attribute.trait_type === "string" &&
            (typeof attribute.value === "string" || typeof attribute.value === "number")
          ))
          .slice(0, 80)
          .map((attribute) => ({
            trait_type: attribute.trait_type as string,
            value: attribute.value as string | number,
            display_type: typeof attribute.display_type === "string" ? attribute.display_type : undefined,
            max_value: typeof attribute.max_value === "number" ? attribute.max_value : undefined,
          }))
      : [];

    const properties =
      metadata.properties && typeof metadata.properties === "object" && !Array.isArray(metadata.properties)
        ? metadata.properties as Record<string, unknown>
        : null;

    return {
      description: typeof metadata.description === "string" ? metadata.description : null,
      traits,
      rarity: readRarity(metadata, traits),
      animation_url: typeof metadata.animation_url === "string" ? metadata.animation_url : null,
      properties,
    };
  } catch (error) {
    console.warn("[Marketplace] Failed to read asset metadata:", error);
    return emptyDetails;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetAddress: string }> }
) {
  try {
    const { assetAddress } = await params;

    let asset = await prisma.asset.findUnique({
      where: { assetAddress },
      include: {
        collection: {
          select: {
            id: true,
            address: true,
            name: true,
            symbol: true,
            imageUrl: true,
            description: true,
            totalMinted: true,
            maxSupply: true,
            mintPrice: true,
            chain: true,
            agent: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        listings: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            asset: {
              include: {
                collection: {
                  select: {
                    id: true,
                    address: true,
                    name: true,
                    symbol: true,
                    imageUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!asset) {
      const mint = await prisma.mint.findFirst({
        where: {
          assetAddresses: {
            contains: assetAddress,
          },
        },
        select: { id: true },
      });

      if (mint) {
        await syncMintAssets(mint.id);
        asset = await prisma.asset.findUnique({
          where: { assetAddress },
          include: {
            collection: {
              select: {
                id: true,
                address: true,
                name: true,
                symbol: true,
                imageUrl: true,
                description: true,
                totalMinted: true,
                maxSupply: true,
                mintPrice: true,
                chain: true,
                agent: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            listings: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                asset: {
                  include: {
                    collection: {
                      select: {
                        id: true,
                        address: true,
                        name: true,
                        symbol: true,
                        imageUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
      }

      if (!asset) {
        await ensureAssetIndexedFromChain(assetAddress);
        asset = await prisma.asset.findUnique({
          where: { assetAddress },
          include: {
            collection: {
              select: {
                id: true,
                address: true,
                name: true,
                symbol: true,
                imageUrl: true,
                description: true,
                totalMinted: true,
                maxSupply: true,
                mintPrice: true,
                chain: true,
                agent: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            listings: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                asset: {
                  include: {
                    collection: {
                      select: {
                        id: true,
                        address: true,
                        name: true,
                        symbol: true,
                        imageUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
      }
    }

    if (!asset) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }

    const refreshed = await refreshAssetOwner(asset.assetAddress).catch(() => null);
    const ownerAddress = refreshed?.ownerAddress || asset.ownerAddress;
    const metadataDetails = await fetchAssetMetadataDetails(refreshed?.metadataUri || asset.metadataUri);

    const [relatedAssets, activeListings, recentCollectionSales] = await Promise.all([
      prisma.asset.findMany({
        where: { collectionId: asset.collectionId },
        orderBy: { tokenId: "asc" },
        take: 18,
        select: {
          id: true,
          assetAddress: true,
          tokenId: true,
          name: true,
          imageUrl: true,
          ownerAddress: true,
        },
      }),
      prisma.listing.findMany({
        where: {
          collectionId: asset.collectionId,
          status: "ACTIVE",
        },
        orderBy: [{ priceLamports: "asc" }, { createdAt: "desc" }],
        take: 12,
        include: {
          asset: {
            include: {
              collection: {
                select: {
                  id: true,
                  address: true,
                  name: true,
                  symbol: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      }),
      prisma.sale.findMany({
        where: { collectionId: asset.collectionId },
        orderBy: { soldAt: "desc" },
        take: 8,
        include: {
          asset: {
            select: {
              assetAddress: true,
              tokenId: true,
              name: true,
              imageUrl: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        asset_address: asset.assetAddress,
        token_id: asset.tokenId,
        owner_address: ownerAddress,
        name: asset.name,
        image_url: asset.imageUrl,
        metadata_uri: asset.metadataUri,
        description: metadataDetails.description,
        traits: metadataDetails.traits,
        rarity: metadataDetails.rarity,
        animation_url: metadataDetails.animation_url,
        properties: metadataDetails.properties,
        minted_at: asset.mintedAt.toISOString(),
        active_listing: asset.listings[0] ? serializeMarketplaceListing(asset.listings[0]) : null,
        collection: {
          id: asset.collection.id,
          address: asset.collection.address,
          name: asset.collection.name,
          symbol: asset.collection.symbol,
          image_url: asset.collection.imageUrl,
          description: asset.collection.description,
          total_minted: asset.collection.totalMinted,
          max_supply: asset.collection.maxSupply,
          mint_price_native: formatLamportsToSol(BigInt(asset.collection.mintPrice)),
          chain: asset.collection.chain,
          agent: {
            id: asset.collection.agent.id,
            name: asset.collection.agent.name,
            avatar_url: asset.collection.agent.avatarUrl,
          },
        },
      },
      related_assets: relatedAssets.map((related) => ({
        id: related.id,
        asset_address: related.assetAddress,
        token_id: related.tokenId,
        name: related.name,
        image_url: related.imageUrl,
        owner_address: related.ownerAddress,
      })),
      best_listings: activeListings.map((listing) => serializeMarketplaceListing(listing)),
      recent_sales: recentCollectionSales.map((sale) => ({
        id: sale.id,
        price_lamports: sale.priceLamports,
        price_native: formatLamportsToSol(BigInt(sale.priceLamports)),
        buyer_address: sale.buyerAddress,
        seller_address: sale.sellerAddress,
        tx_hash: sale.txHash,
        sold_at: sale.soldAt.toISOString(),
        asset: {
          address: sale.asset.assetAddress,
          token_id: sale.asset.tokenId,
          name: sale.asset.name,
          image_url: sale.asset.imageUrl,
        },
      })),
    });
  } catch (error) {
    console.error("Marketplace asset detail error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load asset detail" },
      { status: 500 }
    );
  }
}

