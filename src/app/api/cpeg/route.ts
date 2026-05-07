import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getClawPegToken2022MintAccountSize, quoteClawPegLaunchFee } from "@/lib/clawpeg";
import { getClawPegRpcUrl } from "@/lib/env";

/**
 * Read the on-chain mint authority status for a list of token mints.
 *
 * Token-2022 mint accounts begin with a 4-byte COption discriminator for `mint_authority`.
 * When those four bytes are zero, the mint authority is `None` and the supply is sealed
 * (no further mints possible). We rely on this to surface a sealed/open badge on the
 * cPEG home page without making one RPC round-trip per launch. A single
 * `getMultipleAccountsInfo` covers the whole listing page.
 */
async function fetchSealedMap(mints: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (mints.length === 0) return result;
  try {
    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const pks = mints.map((m) => new PublicKey(m));
    const accounts = await connection.getMultipleAccountsInfo(pks, "confirmed");
    type AccountSlot = (typeof accounts)[number];
    accounts.forEach((account: AccountSlot, index: number) => {
      if (!account || account.data.length < 4) {
        result.set(mints[index], false);
        return;
      }
      const authoritySome =
        account.data[0] !== 0 || account.data[1] !== 0 || account.data[2] !== 0 || account.data[3] !== 0;
      result.set(mints[index], !authoritySome);
    });
  } catch {
    // Best-effort: when RPC fails, assume open. Per-collection page still reads live state.
  }
  return result;
}

export const dynamic = "force-dynamic";

interface LaunchRow {
  id: string;
  name: string;
  symbol: string;
  tokenMint: string;
  collectionAddress: string | null;
  hookValidationAddress: string | null;
  cluster: string;
  rendererId: string | null;
  rendererVersion: string | null;
  maxPegs: number;
  status: string;
  royaltyBps: number;
  marketplaceFeeBps: number;
  identityMode: string;
  canonicalRoot: string | null;
  agentAssetAddress: string | null;
  agentIdentityPda: string | null;
  createdAt: Date;
}

interface MarketAggRow {
  tokenMint: string;
  active: bigint;
  filled: bigint;
  floor: string | null;
  volume: string | null;
}

function lamportsToSol(value: bigint) {
  return Number(value) / 1_000_000_000;
}

function formatSol(value: bigint) {
  return lamportsToSol(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "24", 10), 1), 60);
  const sort = url.searchParams.get("sort") || "recent";

  let launches: LaunchRow[] = [];
  try {
    const orderClause: Prisma.Sql =
      sort === "trending"
        ? Prisma.sql`ORDER BY "createdAt" DESC`
        : Prisma.sql`ORDER BY "createdAt" DESC`;
    launches = await prisma.$queryRaw<LaunchRow[]>`
      SELECT "id", "name", "symbol", "tokenMint", "collectionAddress", "hookValidationAddress",
        "cluster", "rendererId", "rendererVersion", "maxPegs", "status", "royaltyBps",
        "marketplaceFeeBps", "identityMode", "canonicalRoot", "agentAssetAddress",
        "agentIdentityPda", "createdAt"
      FROM "ClawPegLaunch"
      WHERE "status" IN (${"ACTIVE"}, ${"LAUNCHED"})
      ${orderClause}
      LIMIT ${limit}
    `;
  } catch {
    launches = [];
  }

  const tokenMints = launches.map((launch) => launch.tokenMint);
  let aggregates: MarketAggRow[] = [];
  if (tokenMints.length > 0) {
    try {
      aggregates = await prisma.$queryRaw<MarketAggRow[]>`
        SELECT "tokenMint",
          COUNT(*) FILTER (WHERE "status" = ${"ACTIVE"})::bigint AS "active",
          COUNT(*) FILTER (WHERE "status" = ${"FILLED"})::bigint AS "filled",
          MIN(("priceLamports"::numeric)) FILTER (WHERE "status" = ${"ACTIVE"})::text AS "floor",
          COALESCE(SUM(("priceLamports"::numeric)) FILTER (WHERE "status" = ${"FILLED"}), 0)::text AS "volume"
        FROM "ClawPegMarketListing"
        WHERE "tokenMint" IN (${Prisma.join(tokenMints)})
        GROUP BY "tokenMint"
      `;
    } catch {
      aggregates = [];
    }
  }
  const aggMap = new Map(aggregates.map((row) => [row.tokenMint, row]));
  const sealedMap = await fetchSealedMap(tokenMints);

  return NextResponse.json({
    success: true,
    standard: "ClawPEG",
    standard_version: "cPEG Standard v0.1",
    symbol: "cPEG",
    description:
      "Solana Token-2022 PEG launch standard for deterministic IPFS-free collectible identities.",
    invariants: [
      "One whole Token-2022 unit grants capacity for one PEG identity.",
      "PEG identity state lives in PegRecord and OwnerPeg PDAs.",
      "Official cPEG routes emit TradeArtRecord accounts for supported trades.",
      "Renderer output is deterministic from on-chain seeds and versioned renderer rules.",
    ],
    indexer: {
      standard_events: "/api/cpeg/indexer/events?program=standard",
      market_events: "/api/cpeg/indexer/events?program=market",
    },
    token2022: {
      mint_extensions: ["TransferHook", "MetadataPointer", "TokenMetadata"],
      base_transfer_hook_mint_account_size: getClawPegToken2022MintAccountSize(),
      metadata_mint_account_size: "computed per launch from name, symbol, and metadata URI",
    },
    fees: (() => {
      const baseQuote = quoteClawPegLaunchFee({});
      const premiumQuote = quoteClawPegLaunchFee({ premiumIndexing: true });
      const baseLamports = BigInt(baseQuote.launchFeeLamports);
      const premiumDelta = BigInt(premiumQuote.totalLamports) - BigInt(baseQuote.totalLamports);
      const totalWithPremium = BigInt(premiumQuote.totalLamports);
      const fmt = (value: bigint) =>
        (Number(value) / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });
      return {
        ...baseQuote,
        launch: {
          base_lamports: baseLamports.toString(),
          base_sol: fmt(baseLamports),
          premium_lamports: premiumDelta.toString(),
          premium_sol: fmt(premiumDelta),
          total_lamports: totalWithPremium.toString(),
          total_sol: fmt(totalWithPremium),
        },
        marketplace_fee_bps: baseQuote.marketplaceFeeBps,
        default_creator_royalty_bps: baseQuote.defaultCreatorRoyaltyBps,
      };
    })(),
    launches: launches.map((launch) => {
      const agg = aggMap.get(launch.tokenMint);
      const active = Number(agg?.active ?? 0);
      const filled = Number(agg?.filled ?? 0);
      const floor = agg?.floor ?? null;
      const volume = agg?.volume ?? "0";
      return {
        id: launch.id,
        name: launch.name,
        symbol: launch.symbol,
        token_mint: launch.tokenMint,
        collection_address: launch.collectionAddress,
        hook_validation_address: launch.hookValidationAddress,
        cluster: launch.cluster,
        renderer_id: launch.rendererId,
        renderer_version: launch.rendererVersion,
        max_pegs: launch.maxPegs,
        status: launch.status,
        royalty_bps: launch.royaltyBps,
        marketplace_fee_bps: launch.marketplaceFeeBps,
        identity_mode: launch.identityMode,
        canonical_root: launch.canonicalRoot,
        agent_asset_address: launch.agentAssetAddress,
        agent_identity_pda: launch.agentIdentityPda,
        created_at: launch.createdAt.toISOString(),
        market: {
          active_listings: active,
          filled_listings: filled,
          floor_lamports: floor,
          floor_sol: floor !== null ? formatSol(BigInt(floor)) : null,
          volume_lamports: volume,
          volume_sol: formatSol(BigInt(volume || "0")),
        },
        is_sealed: sealedMap.get(launch.tokenMint) ?? false,
        preview_image: `/api/cpeg/${launch.tokenMint}/pegs/1/svg`,
        trade_router: `/api/cpeg/${launch.tokenMint}/trade-router`,
      };
    }),
  });
}
