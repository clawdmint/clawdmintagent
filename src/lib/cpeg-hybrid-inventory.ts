import "server-only";

import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import {
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
    select: { assetAddress: true, pegId: true, ownerAddress: true, status: true },
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

  const currentPoolAddresses = new Set(candidates.map((snapshot) => snapshot.publicKey));
  const stalePoolRows = existing.filter(
    (row) =>
      row.status === CPEG_HYBRID_ASSET_STATUS_POOL &&
      !currentPoolAddresses.has(row.assetAddress)
  );
  if (stalePoolRows.length > 0) {
    await prisma.clawPegHybridAsset.updateMany({
      where: {
        launchId: input.launchId,
        assetAddress: { in: stalePoolRows.map((row) => row.assetAddress) },
      },
      data: { status: CPEG_HYBRID_ASSET_STATUS_OWNED },
    });
    updated += stalePoolRows.length;
  }

  return { synced, updated, skipped, escrowAddress };
}
