import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import {
  CPEG_MARKET_LISTING_STATUS_ACTIVE,
  findClawPegCollectionAddress,
  findMarketListingAddress,
  parseCpegMarketListingAccount,
  splitClawPegMarketPayment,
} from "@/lib/clawpeg";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

function formatSol(lamports: string | bigint) {
  return (Number(lamports) / 1_000_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

const SORT_OPTIONS: Record<string, Prisma.Sql> = {
  recent: Prisma.sql`ORDER BY "createdAt" DESC`,
  oldest: Prisma.sql`ORDER BY "createdAt" ASC`,
  price_asc: Prisma.sql`ORDER BY ("priceLamports"::numeric) ASC, "pegId" ASC`,
  price_desc: Prisma.sql`ORDER BY ("priceLamports"::numeric) DESC, "pegId" ASC`,
  peg_asc: Prisma.sql`ORDER BY "pegId" ASC`,
  peg_desc: Prisma.sql`ORDER BY "pegId" DESC`,
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") || "price_asc";
  const seller = url.searchParams.get("seller") || "";
  const minPriceParam = url.searchParams.get("min_price") || "";
  const maxPriceParam = url.searchParams.get("max_price") || "";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "96", 10), 1), 240);
  const orderBy = SORT_OPTIONS[sort] || SORT_OPTIONS.price_asc;

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      id: true,
      tokenMint: true,
      name: true,
      symbol: true,
      collectionAddress: true,
      royaltyBps: true,
      marketplaceFeeBps: true,
      creatorAddress: true,
      feeVaultAddress: true,
      maxPegs: true,
      standardMode: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }
  if (!launch.collectionAddress && launch.standardMode !== "metaplex_hybrid") {
    return NextResponse.json({
      success: true,
      collection: {
        name: launch.name,
        symbol: launch.symbol,
        token_mint: launch.tokenMint,
        collection_address: null,
        royalty_bps: launch.royaltyBps,
        marketplace_fee_bps: launch.marketplaceFeeBps,
        creator_address: launch.creatorAddress,
        fee_vault_address: launch.feeVaultAddress,
        max_pegs: launch.maxPegs,
      },
      summary: {
        active_listings: 0,
        filled_listings: 0,
        floor_lamports: null,
        floor_sol: null,
        volume_lamports: "0",
        volume_sol: "0",
      },
      filters: {
        sort,
        seller: seller || null,
        min_price_lamports: minPriceParam || null,
        max_price_lamports: maxPriceParam || null,
        limit,
      },
      listings: [],
      status: "HYBRID_READY",
    });
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"launchId" = ${launch.id}`,
    Prisma.sql`"status" = ${"ACTIVE"}`,
  ];

  if (seller) {
    conditions.push(Prisma.sql`"sellerAddress" = ${seller}`);
  }
  if (minPriceParam && /^\d+$/.test(minPriceParam)) {
    conditions.push(Prisma.sql`("priceLamports"::numeric) >= ${minPriceParam}::numeric`);
  }
  if (maxPriceParam && /^\d+$/.test(maxPriceParam)) {
    conditions.push(Prisma.sql`("priceLamports"::numeric) <= ${maxPriceParam}::numeric`);
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const limitSql = Prisma.sql`LIMIT ${limit}`;

  const rawListings = await prisma.$queryRaw<Array<{
    id: string;
    listingAddress: string;
    escrowTokenAccount: string;
    escrowOwnerPegAddress: string;
    pegRecordAddress: string;
    pegId: number;
    sellerAddress: string;
    priceLamports: string;
    marketplaceFeeBps: number;
    royaltyBps: number;
    listedAt: Date | null;
    createdAt: Date;
  }>>`
    SELECT "id", "listingAddress", "escrowTokenAccount", "escrowOwnerPegAddress",
      "pegRecordAddress", "pegId", "sellerAddress", "priceLamports",
      "marketplaceFeeBps", "royaltyBps", "listedAt", "createdAt"
    FROM "ClawPegMarketListing"
    ${whereSql}
    ${orderBy}
    ${limitSql}
  `;

  // On-chain reconciliation: skim each candidate listing's PDA to filter out rows whose
  // on-chain status drifted from the DB (e.g. stale ACTIVE rows produced by a previously
  // failed list/confirm round trip, or pre-upgrade rows where the PDA is FILLED but the DB
  // never updated). We also auto-heal the DB so the row vanishes from the next request.
  const listings: typeof rawListings = [];
  if (rawListings.length > 0 && launch.collectionAddress) {
    try {
      const collectionAddress = findClawPegCollectionAddress(launch.tokenMint);
      const pdas = rawListings.map((row) =>
        findMarketListingAddress(collectionAddress.toBase58(), row.pegId)
      );
      const connection = new Connection(getClawPegRpcUrl(), { commitment: "confirmed" });
      // Solana RPC limits getMultipleAccountsInfo to 100 accounts per call; we cap at 240 above
      // so split into chunks of 100 to stay within bounds.
      const infos: (Awaited<ReturnType<typeof connection.getAccountInfo>>)[] = [];
      for (let i = 0; i < pdas.length; i += 100) {
        const chunk = pdas.slice(i, i + 100).map((pk) => new PublicKey(pk));
        const got = await connection.getMultipleAccountsInfo(chunk, "confirmed");
        infos.push(...got);
      }
      const driftedPegIds: number[] = [];
      for (let i = 0; i < rawListings.length; i += 1) {
        const row = rawListings[i];
        const info = infos[i];
        if (!info || info.data.length === 0) {
          driftedPegIds.push(row.pegId);
          continue;
        }
        const state = parseCpegMarketListingAccount(Buffer.from(info.data));
        if (!state.isInitialized || state.status !== CPEG_MARKET_LISTING_STATUS_ACTIVE) {
          driftedPegIds.push(row.pegId);
          continue;
        }
        listings.push(row);
      }
      if (driftedPegIds.length > 0) {
        // Best-effort drift heal. We mark the rows FILLED so the marketplace stops showing
        // them; a more precise reconciliation could distinguish FILLED vs CANCELLED, but for
        // hide-purposes either terminal state is sufficient.
        await prisma
          .$executeRaw`
            UPDATE "ClawPegMarketListing"
            SET "status" = 'FILLED', "updatedAt" = NOW(), "soldAt" = COALESCE("soldAt", NOW())
            WHERE "launchId" = ${launch.id}
              AND "status" = 'ACTIVE'
              AND "pegId" IN (${Prisma.join(driftedPegIds)})
          `
          .catch(() => null);
      }
    } catch {
      // If RPC reconciliation fails (network blip, RPC down) we fall back to the raw DB
      // result so the marketplace stays usable. The buy/prepare preflight will still catch
      // any drift at purchase time.
      listings.push(...rawListings);
    }
  }

  // Aggregations for the marketplace header (independent of filters except seller).
  const baseConditions: Prisma.Sql[] = [Prisma.sql`"launchId" = ${launch.id}`];
  if (seller) baseConditions.push(Prisma.sql`"sellerAddress" = ${seller}`);
  const baseWhere = Prisma.sql`WHERE ${Prisma.join(baseConditions, " AND ")}`;

  const [activeAgg, filledAgg] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint; floor: string | null }>>`
      SELECT COUNT(*)::bigint AS "count",
        MIN(("priceLamports"::numeric))::text AS "floor"
      FROM "ClawPegMarketListing"
      ${baseWhere}
        AND "status" = ${"ACTIVE"}
    `,
    prisma.$queryRaw<Array<{ count: bigint; volume: string | null }>>`
      SELECT COUNT(*)::bigint AS "count",
        COALESCE(SUM(("priceLamports"::numeric)), 0)::text AS "volume"
      FROM "ClawPegMarketListing"
      ${baseWhere}
        AND "status" = ${"FILLED"}
    `,
  ]);

  const activeCount = Number(activeAgg[0]?.count ?? 0);
  const filledCount = Number(filledAgg[0]?.count ?? 0);
  const floorLamports = activeAgg[0]?.floor ?? null;
  const volumeLamports = filledAgg[0]?.volume ?? "0";

  return NextResponse.json({
    success: true,
    collection: {
      name: launch.name,
      symbol: launch.symbol,
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      royalty_bps: launch.royaltyBps,
      marketplace_fee_bps: launch.marketplaceFeeBps,
      creator_address: launch.creatorAddress,
      fee_vault_address: launch.feeVaultAddress,
      max_pegs: launch.maxPegs,
    },
    summary: {
      active_listings: activeCount,
      filled_listings: filledCount,
      floor_lamports: floorLamports,
      floor_sol: floorLamports !== null ? formatSol(floorLamports) : null,
      volume_lamports: volumeLamports,
      volume_sol: formatSol(volumeLamports || "0"),
    },
    filters: {
      sort,
      seller: seller || null,
      min_price_lamports: minPriceParam || null,
      max_price_lamports: maxPriceParam || null,
      limit,
    },
    listings: (launch.collectionAddress ? listings : rawListings).map((listing) => {
      const breakdown = splitClawPegMarketPayment(
        BigInt(listing.priceLamports),
        listing.royaltyBps,
        listing.marketplaceFeeBps
      );
      return {
        id: listing.id,
        listing_address: listing.listingAddress,
        escrow_token_account: listing.escrowTokenAccount,
        escrow_owner_peg_address: listing.escrowOwnerPegAddress,
        peg_record_address: listing.pegRecordAddress,
        peg_id: listing.pegId,
        seller: listing.sellerAddress,
        price_lamports: listing.priceLamports,
        price_sol: formatSol(listing.priceLamports),
        marketplace_fee_bps: listing.marketplaceFeeBps,
        royalty_bps: listing.royaltyBps,
        seller_proceeds_lamports: breakdown.sellerProceedsLamports,
        creator_royalty_lamports: breakdown.creatorRoyaltyLamports,
        protocol_fee_lamports: breakdown.protocolFeeLamports,
        seller_proceeds_sol: formatSol(breakdown.sellerProceedsLamports),
        creator_royalty_sol: formatSol(breakdown.creatorRoyaltyLamports),
        protocol_fee_sol: formatSol(breakdown.protocolFeeLamports),
        image: `/api/cpeg/${launch.tokenMint}/pegs/${listing.pegId}/svg`,
        listed_at: listing.listedAt?.toISOString() || listing.createdAt.toISOString(),
      };
    }),
  });
}
