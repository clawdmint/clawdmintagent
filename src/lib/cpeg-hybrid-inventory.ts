import "server-only";

import { PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore, safeFetchAssetV1 } from "@metaplex-foundation/mpl-core";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_LISTED,
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CpegHybridEngineError,
} from "@/lib/cpeg-hybrid-engine";
import { deriveMplHybridEscrowAddress } from "@/lib/cpeg-metaplex-hybrid";
import { deriveMplHybridNftDataPda } from "@/lib/mpl-hybrid-native";
import {
  fetchCollectionAssetSnapshotsViaGpaV2,
  type GpaV2AssetSnapshot,
} from "@/lib/marketplace-assets-gpa-v2";
import { getMetaplexCoreConnection } from "@/lib/synapse-sap";

const STALE_REVERT_GRACE_MS = 10 * 60 * 1000;

export interface SyncMetaplexHybridPoolInput {
  launchId: string;
  tokenMint: string;
  collectionAddress: string | null;
  configuredEscrowAddress: string | null;
  hybridProgramId?: string | null;
  maxPegs: number;
  requireNftData?: boolean;
}

export interface SyncMetaplexHybridPoolResult {
  synced: number;
  updated: number;
  skipped: number;
  escrowAddress: string | null;
}

function parseSnapshotPegId(snapshot: Pick<GpaV2AssetSnapshot, "name" | "uri">) {
  const nameMatch = /#(\d+)\b/.exec(snapshot.name || "");
  if (nameMatch) return Number.parseInt(nameMatch[1], 10);
  const uriMatch = /\/pegs\/(\d+)(?:\.json)?(?:$|[/?#])/i.exec(snapshot.uri || "");
  if (uriMatch) return Number.parseInt(uriMatch[1], 10);
  return null;
}

function findNextAvailablePegId(taken: Set<number>, maxPegs: number) {
  const cap = Math.max(1, Math.min(10_000, maxPegs || 1));
  for (let id = 1; id <= cap; id += 1) {
    if (!taken.has(id)) return id;
  }
  return null;
}

function sortPoolCandidates(a: GpaV2AssetSnapshot, b: GpaV2AssetSnapshot) {
  const aId = parseSnapshotPegId(a) ?? Number.MAX_SAFE_INTEGER;
  const bId = parseSnapshotPegId(b) ?? Number.MAX_SAFE_INTEGER;
  if (aId !== bId) return aId - bId;
  return a.publicKey.localeCompare(b.publicKey);
}

async function fetchInitializedNftDataSet(
  assets: GpaV2AssetSnapshot[],
  hybridProgramId?: string | null
) {
  const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
  const nftDataAddresses = assets.map((asset) =>
    deriveMplHybridNftDataPda(new PublicKey(asset.publicKey), hybridProgramId || undefined)
  );
  const initialized = new Set<string>();

  for (let offset = 0; offset < nftDataAddresses.length; offset += 100) {
    const chunk = nftDataAddresses.slice(offset, offset + 100);
    const infos = await connection.getMultipleAccountsInfo(chunk, "confirmed");
    infos.forEach((info: unknown, index: number) => {
      if (info) initialized.add(assets[offset + index].publicKey);
    });
  }

  return initialized;
}

export async function syncMetaplexHybridPoolAssets(
  input: SyncMetaplexHybridPoolInput
): Promise<SyncMetaplexHybridPoolResult> {
  if (!input.collectionAddress) {
    return { synced: 0, updated: 0, skipped: 0, escrowAddress: null };
  }

  const escrowAddress = deriveMplHybridEscrowAddress(input.collectionAddress);
  if (!escrowAddress || !input.configuredEscrowAddress || escrowAddress !== input.configuredEscrowAddress) {
    throw new CpegHybridEngineError(
      409,
      "Metaplex Hybrid escrow is not the canonical escrow PDA for this Core collection.",
      {
        expected_mpl_hybrid_escrow: escrowAddress,
        configured_mpl_hybrid_escrow: input.configuredEscrowAddress,
      }
    );
  }

  const snapshots = await fetchCollectionAssetSnapshotsViaGpaV2(input.collectionAddress, {
    pageLimit: 1000,
    maxPages: 16,
  });
  const candidates = snapshots
    .filter((snapshot) => snapshot.ownerAddress === escrowAddress)
    .sort(sortPoolCandidates);

  const initializedNftData = input.requireNftData === false
    ? null
    : await fetchInitializedNftDataSet(candidates, input.hybridProgramId);
  const existing = await prisma.clawPegHybridAsset.findMany({
    where: { launchId: input.launchId },
    select: {
      assetAddress: true,
      pegId: true,
      ownerAddress: true,
      status: true,
      releasedAt: true,
    },
  });
  const existingByAddress = new Map(existing.map((row) => [row.assetAddress, row]));
  const taken = new Set(existing.map((row) => row.pegId));

  let synced = 0;
  let updated = 0;
  let skipped = 0;

  for (const snapshot of candidates) {
    if (initializedNftData && !initializedNftData.has(snapshot.publicKey)) {
      skipped += 1;
      continue;
    }

    const existingRow = existingByAddress.get(snapshot.publicKey);
    if (existingRow) {
      if (
        existingRow.ownerAddress !== escrowAddress ||
        existingRow.status !== CPEG_HYBRID_ASSET_STATUS_POOL
      ) {
        await prisma.clawPegHybridAsset.update({
          where: { assetAddress: snapshot.publicKey },
          data: {
            ownerAddress: escrowAddress,
            status: CPEG_HYBRID_ASSET_STATUS_POOL,
          },
        });
        updated += 1;
      }
      continue;
    }

    const parsedPegId = parseSnapshotPegId(snapshot);
    const pegId =
      parsedPegId &&
      parsedPegId >= 1 &&
      parsedPegId <= Math.max(1, Math.min(10_000, input.maxPegs || 1)) &&
      !taken.has(parsedPegId)
        ? parsedPegId
        : findNextAvailablePegId(taken, input.maxPegs);

    if (!pegId) {
      skipped += 1;
      continue;
    }

    taken.add(pegId);
    await prisma.clawPegHybridAsset
      .create({
        data: {
          launchId: input.launchId,
          tokenMint: input.tokenMint,
          collectionAddress: input.collectionAddress,
          assetAddress: snapshot.publicKey,
          pegId,
          ownerAddress: escrowAddress,
          status: CPEG_HYBRID_ASSET_STATUS_POOL,
        },
      })
      .then(() => {
        synced += 1;
      })
      .catch(async () => {
        const ownerChanged = await prisma.clawPegHybridAsset.updateMany({
          where: {
            launchId: input.launchId,
            assetAddress: snapshot.publicKey,
          },
          data: {
            ownerAddress: escrowAddress,
            status: CPEG_HYBRID_ASSET_STATUS_POOL,
          },
        });
        if (ownerChanged.count > 0) updated += ownerChanged.count;
        else skipped += 1;
      });
  }

  // Reconcile non-escrow on-chain owners with the database. This is the
  // "rescue" path: if a capture transaction succeeded on-chain but the
  // /capture/confirm DB write was missed (network blip, page refresh between
  // sign and confirm, aggressive PENDING TTL purge, etc.), the user still
  // owns the Metaplex Core asset. Without this loop the site would never
  // surface that NFT to its real owner, so we walk every collection snapshot
  // owned by a non-escrow wallet and either heal the existing row or insert
  // a fresh OWNED row.
  const userCandidates = snapshots.filter((snapshot) => snapshot.ownerAddress !== escrowAddress);
  const launchCap = Math.max(1, Math.min(10_000, input.maxPegs || 1));
  for (const snapshot of userCandidates) {
    const ownerAddress = snapshot.ownerAddress;
    if (!ownerAddress) continue;
    const existingRow = existingByAddress.get(snapshot.publicKey);
    if (existingRow) {
      if (existingRow.status === CPEG_HYBRID_ASSET_STATUS_LISTED) {
        // Listed assets only move on-chain when the marketplace delegate
        // executes a fill or a cancel. If the on-chain owner is still the
        // seller, leave the LISTED row alone so the marketplace lifecycle
        // remains authoritative. If the on-chain owner is a different
        // wallet, the marketplace fill actually succeeded but our
        // /market/buy/confirm call did not land (RPC lag, network blip,
        // tab close). Self-heal: mark the matching ACTIVE listing FILLED
        // and flip the hybrid row to OWNED with the new on-chain owner so
        // the buyer's profile and the marketplace surface real state.
        if (existingRow.ownerAddress === ownerAddress) {
          continue;
        }
        await prisma.clawPegMarketListing
          .updateMany({
            where: {
              launchId: input.launchId,
              listingAddress: snapshot.publicKey,
              status: "ACTIVE",
            },
            data: {
              status: "FILLED",
              buyerAddress: ownerAddress,
              soldAt: new Date(),
            },
          })
          .catch(() => null);
        await prisma.clawPegHybridAsset
          .update({
            where: { assetAddress: snapshot.publicKey },
            data: {
              ownerAddress,
              status: CPEG_HYBRID_ASSET_STATUS_OWNED,
              capturedAt: new Date(),
            },
          })
          .catch(() => null);
        updated += 1;
        continue;
      }
      const needsUpdate =
        existingRow.ownerAddress !== ownerAddress ||
        existingRow.status !== CPEG_HYBRID_ASSET_STATUS_OWNED;
      if (needsUpdate) {
        await prisma.clawPegHybridAsset
          .update({
            where: { assetAddress: snapshot.publicKey },
            data: {
              ownerAddress,
              status: CPEG_HYBRID_ASSET_STATUS_OWNED,
              capturedAt: existingRow.releasedAt ? existingRow.releasedAt : new Date(),
            },
          })
          .catch(() => null);
        updated += 1;
      }
      continue;
    }

    // No DB row yet. Try to recover the peg id from the asset metadata so
    // the rescued row keeps the same identity that mpl-hybrid minted on
    // chain. Fall back to the next free id when the on-chain name is
    // unparseable, so the asset still surfaces to its owner.
    const parsedPegId = parseSnapshotPegId(snapshot);
    const pegId =
      parsedPegId && parsedPegId >= 1 && parsedPegId <= launchCap && !taken.has(parsedPegId)
        ? parsedPegId
        : findNextAvailablePegId(taken, input.maxPegs);
    if (!pegId) {
      skipped += 1;
      continue;
    }
    taken.add(pegId);
    await prisma.clawPegHybridAsset
      .create({
        data: {
          launchId: input.launchId,
          tokenMint: input.tokenMint,
          collectionAddress: input.collectionAddress,
          assetAddress: snapshot.publicKey,
          pegId,
          ownerAddress,
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
          capturedAt: new Date(),
        },
      })
      .then(() => {
        synced += 1;
      })
      .catch(async () => {
        // Race-loser: another sync just wrote this row. Make sure ownership
        // / status reflect on-chain truth and move on.
        const flipped = await prisma.clawPegHybridAsset
          .updateMany({
            where: { launchId: input.launchId, assetAddress: snapshot.publicKey },
            data: {
              ownerAddress,
              status: CPEG_HYBRID_ASSET_STATUS_OWNED,
            },
          })
          .catch(() => null);
        if (flipped && flipped.count > 0) updated += flipped.count;
        else skipped += 1;
      });
  }

  // Sync direction: pool rows that no longer appear in the on-chain candidates
  // listing _might_ have been transferred out, but GPA snapshots commonly lag
  // several seconds behind a fresh release transaction. To avoid flipping a
  // freshly-released asset back to OWNED while the indexer catches up, we:
  //   1) Skip rows whose releasedAt is within the recent grace window.
  //   2) For every remaining suspicious row, hit the Core asset directly via
  //      Umi and only flip to OWNED when the on-chain owner is no longer the
  //      hybrid escrow.
  const currentPoolAddresses = new Set(candidates.map((snapshot) => snapshot.publicKey));
  const graceCutoff = Date.now() - STALE_REVERT_GRACE_MS;
  const suspectStalePoolRows = existing.filter((row) => {
    if (row.status !== CPEG_HYBRID_ASSET_STATUS_POOL) return false;
    if (currentPoolAddresses.has(row.assetAddress)) return false;
    if (row.releasedAt && row.releasedAt.getTime() >= graceCutoff) return false;
    return true;
  });

  if (suspectStalePoolRows.length > 0) {
    const umi = createUmi(getMetaplexCoreConnection().rpcEndpoint);
    umi.use(mplCore());
    const confirmedStaleRows: { assetAddress: string; newOwner: string }[] = [];
    for (const row of suspectStalePoolRows) {
      try {
        const asset = await safeFetchAssetV1(umi, umiPublicKey(row.assetAddress));
        if (!asset) continue;
        const ownerOnChain = toWeb3JsPublicKey(asset.owner).toBase58();
        if (ownerOnChain === escrowAddress) continue;
        confirmedStaleRows.push({ assetAddress: row.assetAddress, newOwner: ownerOnChain });
      } catch {
        // ignore – conservative default keeps the row as POOL until next sync.
      }
    }
    for (const stale of confirmedStaleRows) {
      await prisma.clawPegHybridAsset.update({
        where: { assetAddress: stale.assetAddress },
        data: {
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
          ownerAddress: stale.newOwner,
        },
      });
      updated += 1;
    }
  }

  return { synced, updated, skipped, escrowAddress };
}
