import "server-only";

import { fetchAsset, mplCore } from "@metaplex-foundation/mpl-core";
import { getAssetV1GpaBuilder } from "@metaplex-foundation/mpl-core/dist/src/generated/accounts/assetV1";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import { getGpaCapableSolanaRpcUrl } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getSolanaRpcUrl } from "@/lib/solana-collections";
import { ipfsToHttp } from "@/lib/ipfs";

type CollectionRecord = {
  id: string;
  address: string;
  name: string;
  imageUrl: string | null;
  baseUri: string;
  createdAt: Date;
  deployedAt: Date | null;
  totalMinted: number;
};

type MintRecord = {
  id: string;
  collectionId: string;
  minterAddress: string;
  startTokenId: number;
  endTokenId: number;
  assetAddresses: string | null;
  mintedAt: Date;
};

type AssetMetadata = {
  ownerAddress: string;
  name: string;
  metadataUri: string | null;
  imageUrl: string | null;
};

type ChainAssetSnapshot = {
  assetAddress: string;
  ownerAddress: string;
  name: string;
  metadataUri: string | null;
  imageUrl: string | null;
};

type MintAssetLookupRecord = {
  mintId: string;
  mintedAt: Date;
  minterAddress: string;
  preferredTokenId: number;
};

type AssetSyncOptions = {
  forceChainSync?: boolean;
  awaitChainSync?: boolean;
};

type AssetSyncState = {
  lastCompletedAt: number;
  inFlight: Promise<string[]> | null;
};

const CHAIN_SYNC_TTL_MS = 60_000;
const assetSyncState = new Map<string, AssetSyncState>();

function createMarketplaceUmi() {
  const umi = createUmi(getSolanaRpcUrl());
  umi.use(mplCore());
  return umi;
}

/** Uses a GPA-capable endpoint; some gateway RPCs omit `getProgramAccounts`. */
function createMarketplaceGpaUmi() {
  const umi = createUmi(getGpaCapableSolanaRpcUrl());
  umi.use(mplCore());
  return umi;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseAssetAddresses(raw: string | null) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string");
    }
  } catch {
    return [];
  }

  return [];
}

function resolveMetadataAssetUrl(candidate: string) {
  if (candidate.startsWith("ipfs://")) {
    return ipfsToHttp(candidate);
  }

  return candidate;
}

async function fetchMetadataImage(metadataUri: string | null): Promise<string | null> {
  if (!metadataUri) {
    return null;
  }

  const resolvedUri = metadataUri.startsWith("ipfs://") ? ipfsToHttp(metadataUri) : metadataUri;

  try {
    const response = await fetch(resolvedUri, {
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      return null;
    }

    const metadata = (await response.json()) as { image?: string; image_url?: string };
    const candidate = metadata.image || metadata.image_url;
    return candidate ? resolveMetadataAssetUrl(candidate) : null;
  } catch {
    return null;
  }
}

async function fetchAssetMetadata(assetAddress: string): Promise<AssetMetadata | null> {
  try {
    const asset = await fetchAsset(createMarketplaceUmi(), publicKey(assetAddress));
    const ownerAddress = asset.owner.toString();
    const metadataUri = asset.uri || null;
    const name = asset.name || assetAddress;
    const imageUrl = await fetchMetadataImage(metadataUri);

    return {
      ownerAddress,
      name,
      metadataUri,
      imageUrl,
    };
  } catch (error) {
    console.warn("[Marketplace] Failed to fetch asset metadata:", assetAddress, error);
    return null;
  }
}

function parseTokenIdCandidate(name: string | null | undefined, metadataUri: string | null | undefined) {
  if (name) {
    const match = name.match(/#(\d+)$/);
    if (match) {
      return Number(match[1]);
    }
  }

  if (metadataUri) {
    const match = metadataUri.match(/\/(\d+)\.json(?:\?|#|$)/i);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function buildMintAssetLookup(mints: MintRecord[]) {
  const lookup = new Map<string, MintAssetLookupRecord>();

  for (const mint of mints) {
    const assetAddresses = parseAssetAddresses(mint.assetAddresses);
    for (let index = 0; index < assetAddresses.length; index += 1) {
      const assetAddress = assetAddresses[index];
      if (!assetAddress) {
        continue;
      }

      lookup.set(assetAddress, {
        mintId: mint.id,
        mintedAt: mint.mintedAt,
        minterAddress: mint.minterAddress,
        preferredTokenId: mint.startTokenId + index,
      });
    }
  }

  return lookup;
}

async function fetchCollectionAssetSnapshots(collectionAddress: string): Promise<ChainAssetSnapshot[]> {
  // GPA against the mpl-core program can fail (e.g. RPCs that reject unbounded
  // getProgramAccounts queries with millions of pubkeys, or transient timeouts).
  // We fail-soft so a broken chain snapshot does not crash the dev server with
  // an unhandled rejection or surface as a 500 to the marketplace UI.
  let assets;
  try {
    const umi = createMarketplaceGpaUmi();
    assets = await getAssetV1GpaBuilder(umi)
      .whereField("updateAuthority", {
        __kind: "Collection",
        fields: [publicKey(collectionAddress)],
      })
      .getDeserialized();
  } catch (error) {
    console.warn(
      "[Marketplace] GPA snapshot unavailable for collection",
      collectionAddress,
      error instanceof Error ? error.message : error
    );
    return [];
  }

  return Promise.all(
    assets.map(async (asset) => {
      const metadataUri = asset.uri || null;
      return {
        assetAddress: asset.publicKey.toString(),
        ownerAddress: asset.owner.toString(),
        name: asset.name || asset.publicKey.toString(),
        metadataUri,
        imageUrl: await fetchMetadataImage(metadataUri),
      } satisfies ChainAssetSnapshot;
    })
  );
}

async function resolveUniqueTokenId(
  collectionId: string,
  preferredTokenId: number,
  currentAssetAddress?: string
) {
  const existingAtPreferred = await prisma.asset.findFirst({
    where: {
      collectionId,
      tokenId: preferredTokenId,
    },
    select: {
      id: true,
      assetAddress: true,
    },
  });

  if (!existingAtPreferred || existingAtPreferred.assetAddress === currentAssetAddress) {
    return preferredTokenId;
  }

  const aggregate = await prisma.asset.aggregate({
    where: { collectionId },
    _max: { tokenId: true },
  });

  return (aggregate._max.tokenId ?? preferredTokenId) + 1;
}

async function upsertMintAssets(input: {
  collection: CollectionRecord;
  mint: MintRecord;
}) {
  const assetAddresses = parseAssetAddresses(input.mint.assetAddresses);
  const tokenCount = Math.max(0, input.mint.endTokenId - input.mint.startTokenId + 1);

  if (assetAddresses.length === 0 || tokenCount === 0) {
    return [];
  }

  const results: string[] = [];

  for (let index = 0; index < tokenCount; index += 1) {
    const assetAddress = assetAddresses[index];
    if (!assetAddress) {
      continue;
    }

    const preferredTokenId = input.mint.startTokenId + index;
    const existingByAddress = await prisma.asset.findUnique({
      where: { assetAddress },
      select: {
        id: true,
        tokenId: true,
        ownerAddress: true,
        name: true,
        metadataUri: true,
        imageUrl: true,
      },
    });
    const tokenId = await resolveUniqueTokenId(
      input.collection.id,
      existingByAddress?.tokenId ?? preferredTokenId,
      assetAddress
    );
    const fallbackMetadataUri = `${ensureTrailingSlash(input.collection.baseUri)}${tokenId}.json`;

    if (existingByAddress) {
      await prisma.asset.update({
        where: { assetAddress },
        data: {
          collectionId: input.collection.id,
          mintId: input.mint.id,
          tokenId,
          ownerAddress: existingByAddress.ownerAddress || input.mint.minterAddress || "",
          name: existingByAddress.name || `${input.collection.name} #${tokenId}`,
          metadataUri: existingByAddress.metadataUri || fallbackMetadataUri,
          imageUrl: existingByAddress.imageUrl || input.collection.imageUrl,
          mintedAt: input.mint.mintedAt,
        },
      });
      results.push(assetAddress);
      continue;
    }

    const existingByToken = await prisma.asset.findFirst({
      where: {
        collectionId: input.collection.id,
        tokenId,
      },
      select: {
        id: true,
        assetAddress: true,
      },
    });

    if (existingByToken) {
      const nextTokenId = await resolveUniqueTokenId(input.collection.id, tokenId, assetAddress);
      await prisma.asset.create({
        data: {
          collectionId: input.collection.id,
          mintId: input.mint.id,
          assetAddress,
          tokenId: nextTokenId,
          ownerAddress: input.mint.minterAddress || "",
          name: `${input.collection.name} #${nextTokenId}`,
          metadataUri: `${ensureTrailingSlash(input.collection.baseUri)}${nextTokenId}.json`,
          imageUrl: input.collection.imageUrl,
          mintedAt: input.mint.mintedAt,
        },
      });
      results.push(assetAddress);
      continue;
    }

    await prisma.asset.create({
      data: {
        collectionId: input.collection.id,
        mintId: input.mint.id,
        assetAddress,
        tokenId,
        ownerAddress: input.mint.minterAddress || "",
        name: `${input.collection.name} #${tokenId}`,
        metadataUri: fallbackMetadataUri,
        imageUrl: input.collection.imageUrl,
        mintedAt: input.mint.mintedAt,
      },
    });

    results.push(assetAddress);
  }

  return results;
}

async function syncCollectionAssetsFromChain(input: {
  collection: CollectionRecord;
  mints: MintRecord[];
}) {
  const snapshots = await fetchCollectionAssetSnapshots(input.collection.address);
  const mintLookup = buildMintAssetLookup(input.mints);
  const syncedAssetAddresses: string[] = [];

  for (const snapshot of snapshots) {
    const existingByAddress = await prisma.asset.findUnique({
      where: { assetAddress: snapshot.assetAddress },
      select: {
        id: true,
        tokenId: true,
        imageUrl: true,
        metadataUri: true,
        mintedAt: true,
        mintId: true,
      },
    });

    const mintSource = mintLookup.get(snapshot.assetAddress);
    const preferredTokenId =
      existingByAddress?.tokenId ??
      mintSource?.preferredTokenId ??
      parseTokenIdCandidate(snapshot.name, snapshot.metadataUri) ??
      1;
    const tokenId = await resolveUniqueTokenId(
      input.collection.id,
      preferredTokenId,
      snapshot.assetAddress
    );

    const imageUrl = snapshot.imageUrl ?? existingByAddress?.imageUrl ?? input.collection.imageUrl;
    const mintedAt =
      mintSource?.mintedAt ??
      existingByAddress?.mintedAt ??
      input.collection.deployedAt ??
      input.collection.createdAt;

    if (existingByAddress) {
      await prisma.asset.update({
        where: { assetAddress: snapshot.assetAddress },
        data: {
          collectionId: input.collection.id,
          mintId: mintSource?.mintId ?? existingByAddress.mintId,
          tokenId,
          ownerAddress: snapshot.ownerAddress,
          name: snapshot.name || `${input.collection.name} #${tokenId}`,
          metadataUri: snapshot.metadataUri ?? existingByAddress.metadataUri,
          imageUrl,
          mintedAt,
        },
      });
      syncedAssetAddresses.push(snapshot.assetAddress);
      continue;
    }

    await prisma.asset.create({
      data: {
        collectionId: input.collection.id,
        mintId: mintSource?.mintId ?? null,
        assetAddress: snapshot.assetAddress,
        tokenId,
        ownerAddress: snapshot.ownerAddress,
        name: snapshot.name || `${input.collection.name} #${tokenId}`,
        metadataUri: snapshot.metadataUri,
        imageUrl,
        mintedAt,
      },
    });

    syncedAssetAddresses.push(snapshot.assetAddress);
  }

  return syncedAssetAddresses;
}

async function getCollectionWithMints(collectionId: string) {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: {
      id: true,
      address: true,
      name: true,
      imageUrl: true,
      baseUri: true,
      createdAt: true,
      deployedAt: true,
      totalMinted: true,
    },
  });

  if (!collection) {
    return null;
  }

  const mints = await prisma.mint.findMany({
    where: { collectionId },
    select: {
      id: true,
      collectionId: true,
      minterAddress: true,
      startTokenId: true,
      endTokenId: true,
      assetAddresses: true,
      mintedAt: true,
    },
    orderBy: { mintedAt: "asc" },
  });

  return { collection, mints };
}

export async function syncMintAssets(mintId: string) {
  const mint = await prisma.mint.findUnique({
    where: { id: mintId },
    select: {
      id: true,
      collectionId: true,
      minterAddress: true,
      startTokenId: true,
      endTokenId: true,
      assetAddresses: true,
      mintedAt: true,
      collection: {
        select: {
          id: true,
          address: true,
          name: true,
          imageUrl: true,
          baseUri: true,
          createdAt: true,
          deployedAt: true,
          totalMinted: true,
        },
      },
    },
  });

  if (!mint) {
    return [];
  }

  return upsertMintAssets({
    collection: mint.collection,
    mint,
  });
}

export async function ensureCollectionAssetsIndexed(collectionId: string, options?: AssetSyncOptions) {
  const bundle = await getCollectionWithMints(collectionId);
  if (!bundle) {
    return [];
  }

  const synced: string[] = [];
  for (const mint of bundle.mints) {
    const addresses = await upsertMintAssets({
      collection: bundle.collection,
      mint,
    });
    synced.push(...addresses);
  }

  const [assetCount, blankOwnerCount] = await Promise.all([
    prisma.asset.count({ where: { collectionId } }),
    prisma.asset.count({ where: { collectionId, ownerAddress: "" } }),
  ]);

  if (options?.forceChainSync || assetCount < bundle.collection.totalMinted || blankOwnerCount > 0) {
    const state = assetSyncState.get(collectionId) ?? {
      lastCompletedAt: 0,
      inFlight: null,
    };
    const now = Date.now();
    const shouldSkipFreshSync =
      !options?.forceChainSync &&
      blankOwnerCount === 0 &&
      assetCount >= bundle.collection.totalMinted &&
      now - state.lastCompletedAt < CHAIN_SYNC_TTL_MS;

    if (!shouldSkipFreshSync) {
      const runSync = async () => {
        const chainAddresses = await syncCollectionAssetsFromChain(bundle);
        const current = assetSyncState.get(collectionId) ?? {
          lastCompletedAt: 0,
          inFlight: null,
        };
        assetSyncState.set(collectionId, {
          ...current,
          lastCompletedAt: Date.now(),
          inFlight: null,
        });
        return chainAddresses;
      };

      if (!state.inFlight) {
        const inFlight = runSync().catch((error) => {
          // Background sync runs without an awaiter when awaitChainSync is false.
          // Rethrowing here would surface as an unhandledRejection and crash the
          // Next.js dev server, so we log and reset state instead.
          console.warn(
            `[Marketplace] Background chain sync failed for collection ${collectionId}:`,
            error instanceof Error ? error.message : error
          );
          const current = assetSyncState.get(collectionId) ?? {
            lastCompletedAt: 0,
            inFlight: null,
          };
          assetSyncState.set(collectionId, {
            ...current,
            inFlight: null,
          });
          return [] as string[];
        });
        assetSyncState.set(collectionId, {
          ...state,
          inFlight,
        });
      }

      const activeSync = assetSyncState.get(collectionId)?.inFlight ?? null;
      if (activeSync && options?.awaitChainSync !== false) {
        const chainAddresses = await activeSync;
        synced.push(...chainAddresses);
      }
    }
  }

  return Array.from(new Set(synced));
}

export async function refreshAssetOwner(assetAddress: string) {
  const existing = await prisma.asset.findUnique({
    where: { assetAddress },
    select: { ownerAddress: true, name: true, metadataUri: true, imageUrl: true },
  });

  if (!existing) {
    return null;
  }

  const snapshot = await fetchAssetMetadata(assetAddress);
  if (!snapshot) {
    return prisma.asset.findUnique({ where: { assetAddress } });
  }

  return prisma.asset.update({
    where: { assetAddress },
    data: {
      ownerAddress: snapshot.ownerAddress || existing.ownerAddress,
      name: snapshot.name || existing.name,
      metadataUri: snapshot.metadataUri || existing.metadataUri,
      imageUrl: snapshot.imageUrl || existing.imageUrl,
    },
  });
}

export async function repairCollectionAssets(collectionId: string) {
  await ensureCollectionAssetsIndexed(collectionId);

  const unresolvedAssets = await prisma.asset.findMany({
    where: {
      collectionId,
      ownerAddress: "",
    },
    select: {
      assetAddress: true,
      mint: {
        select: {
          minterAddress: true,
        },
      },
    },
  });

  for (const asset of unresolvedAssets) {
    if (asset.mint?.minterAddress) {
      await prisma.asset.update({
        where: { assetAddress: asset.assetAddress },
        data: {
          ownerAddress: asset.mint.minterAddress,
        },
      });
    }
  }

  const stillBlankOwnerAssets = await prisma.asset.findMany({
    where: {
      collectionId,
      ownerAddress: "",
    },
    select: {
      assetAddress: true,
    },
  });

  for (const asset of stillBlankOwnerAssets) {
    await refreshAssetOwner(asset.assetAddress).catch((error) => {
      console.warn("[Marketplace] Failed to refresh blank owner:", asset.assetAddress, error);
    });
  }

  return prisma.asset.count({
    where: { collectionId },
  });
}

