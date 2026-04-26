import "server-only";

import {
  deserializeAssetV1,
  getAssetV1GpaBuilder,
} from "@metaplex-foundation/mpl-core/dist/src/generated/accounts/assetV1";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey, type RpcAccount, type RpcDataFilter } from "@metaplex-foundation/umi";
import { base58, base64 } from "@metaplex-foundation/umi/serializers";
import { getGpaCapableSolanaRpcUrlsByPriority, type GpaRpcCandidate } from "@/lib/env";

const MAX_PAGES = 64;
const DEFAULT_PAGE_LIMIT = 1000;

type RpcAccountResponse = {
  pubkey: string;
  account: {
    lamports: number;
    owner: string;
    executable: boolean;
    rentEpoch: number;
    space?: number;
    data: [string, string]; // [base64, "base64"]
  };
};

/**
 * Different providers return slightly different shapes for `getProgramAccountsV2`:
 *   - Helius / public mainnet: `result.accounts`
 *   - Synapse OOBE mainnet:    `result.items`
 * We accept both and normalize at read time.
 */
type GpaV2PageResponse =
  | {
      jsonrpc: "2.0";
      id: number | string;
      result: {
        accounts?: RpcAccountResponse[];
        items?: RpcAccountResponse[];
        paginationKey?: string | null;
        count?: number;
      };
    }
  | {
      jsonrpc: "2.0";
      id: number | string;
      error: { code: number; message: string };
    };

export type GpaV2AssetSnapshot = {
  publicKey: string;
  ownerAddress: string;
  name: string | null;
  uri: string | null;
};

function buildAssetV1FilterForCollection(collectionAddress: string): RpcDataFilter[] {
  // We reuse the SDK GpaBuilder to compute the exact memcmp filter for
  // updateAuthority = Collection { fields: [pubkey] }, so any future change in
  // the AssetV1 layout stays consistent with the deserializer.
  const umi = createUmi("https://api.mainnet-beta.solana.com");
  umi.use(mplCore());
  const builder = getAssetV1GpaBuilder(umi).whereField("updateAuthority", {
    __kind: "Collection",
    fields: [publicKey(collectionAddress)],
  });
  // `options` is a public readonly property on GpaBuilder; we only read it.
  const filters = (builder as unknown as { options: { filters?: RpcDataFilter[] } })
    .options.filters;
  return filters ?? [];
}

function rpcFilterToWire(filter: RpcDataFilter) {
  if ("dataSize" in filter) {
    return { dataSize: filter.dataSize };
  }
  if ("memcmp" in filter) {
    const [bytes] = base58.deserialize(filter.memcmp.bytes);
    return { memcmp: { offset: filter.memcmp.offset, bytes } };
  }
  return filter;
}

async function callJsonRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

const MPL_CORE_PROGRAM_ID = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

function decodeRpcAccount(item: RpcAccountResponse): RpcAccount {
  const [, encoding] = item.account.data;
  if (encoding !== "base64") {
    throw new Error(`Unexpected account data encoding: ${encoding}`);
  }
  const data = base64.serialize(item.account.data[0]);

  return {
    publicKey: publicKey(item.pubkey),
    owner: publicKey(item.account.owner),
    lamports: { basisPoints: BigInt(item.account.lamports), identifier: "SOL", decimals: 9 },
    executable: item.account.executable,
    rentEpoch: BigInt(item.account.rentEpoch ?? 0),
    data,
    exists: true,
  } as unknown as RpcAccount;
}

async function fetchSnapshotsFromEndpoint(
  candidate: GpaRpcCandidate,
  collectionAddress: string,
  filters: ReturnType<typeof rpcFilterToWire>[],
  limit: number,
  maxPages: number
): Promise<GpaV2AssetSnapshot[]> {
  const collected: GpaV2AssetSnapshot[] = [];
  let paginationKey: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const params: [string, Record<string, unknown>] = [
      MPL_CORE_PROGRAM_ID,
      {
        limit,
        encoding: "base64",
        commitment: "confirmed",
        filters,
        ...(paginationKey ? { paginationKey } : {}),
      },
    ];

    const json = await callJsonRpc<GpaV2PageResponse>(
      candidate.url,
      "getProgramAccountsV2",
      params
    );
    if ("error" in json) {
      throw new Error(
        `getProgramAccountsV2 error via ${candidate.label} (code ${json.error.code}): ${json.error.message}`
      );
    }

    const accounts = json.result.accounts ?? json.result.items ?? [];
    for (const item of accounts) {
      const rpcAccount = decodeRpcAccount(item);
      const asset = deserializeAssetV1(rpcAccount);
      collected.push({
        publicKey: asset.publicKey.toString(),
        ownerAddress: asset.owner.toString(),
        name: asset.name || null,
        uri: asset.uri || null,
      });
    }

    const nextKey = json.result.paginationKey;
    if (!nextKey) {
      break;
    }
    paginationKey = nextKey;
  }

  return collected;
}

/**
 * Fetches AssetV1 accounts for a given collection using `getProgramAccountsV2`
 * with pagination. Iterates the priority-ordered RPC endpoints from
 * {@link getGpaCapableSolanaRpcUrlsByPriority} (Synapse first, Helius / explicit
 * GPA endpoint as fallback, public cluster as last resort).
 *
 * Fallback rules — for each endpoint in order:
 *   - On RPC/network error: log a warning and try the next endpoint.
 *   - On empty result (`0` snapshots): try the next endpoint as well, since
 *     several Synapse gateway tiers return empty pages for unindexed Metaplex
 *     Core assets even though the data exists on-chain. If every endpoint
 *     returns empty, the empty list is propagated.
 *   - On non-empty result: return immediately.
 *
 * If every endpoint errors, the most recent error is rethrown so callers can
 * fall through to the v1 fail-soft path.
 */
export async function fetchCollectionAssetSnapshotsViaGpaV2(
  collectionAddress: string,
  options: { pageLimit?: number; maxPages?: number } = {}
): Promise<GpaV2AssetSnapshot[]> {
  const candidates = getGpaCapableSolanaRpcUrlsByPriority();
  if (candidates.length === 0) {
    throw new Error("No GPA-capable RPC endpoints configured");
  }

  const filters = buildAssetV1FilterForCollection(collectionAddress).map(rpcFilterToWire);
  const limit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const maxPages = options.maxPages ?? MAX_PAGES;

  let lastError: Error | null = null;
  let lastEmpty: GpaV2AssetSnapshot[] | null = null;

  for (const candidate of candidates) {
    try {
      const snapshots = await fetchSnapshotsFromEndpoint(
        candidate,
        collectionAddress,
        filters,
        limit,
        maxPages
      );
      if (snapshots.length > 0) {
        console.info(
          `[Marketplace] GPA v2 hit via ${candidate.label}: ${snapshots.length} assets for ${collectionAddress}`
        );
        return snapshots;
      }

      console.info(
        `[Marketplace] GPA v2 via ${candidate.label} returned 0 entries for ${collectionAddress}, trying next provider`
      );
      lastEmpty = snapshots;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[Marketplace] GPA v2 via ${candidate.label} failed for ${collectionAddress}: ${lastError.message}`
      );
    }
  }

  if (lastEmpty) {
    return lastEmpty;
  }
  throw lastError ?? new Error("getProgramAccountsV2: all endpoints failed");
}
