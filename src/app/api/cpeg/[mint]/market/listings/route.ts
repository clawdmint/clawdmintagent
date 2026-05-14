import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { splitClawPegMarketPayment } from "@/lib/clawpeg";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { syncMetaplexHybridPoolAssets } from "@/lib/cpeg-hybrid-inventory";

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
      cluster: true,
      hybridCoreCollectionAddress: true,
      hybridEscrowAddress: true,
      hybridProgramId: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }
  if (launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
    return NextResponse.json(
      { success: false, error: "Legacy custom cPEG market listings are disabled. This market only supports Metaplex Hybrid cPEGs." },
      { status: 410 }
    );
  }

  // Reconcile on-chain ownership with the local marketplace state so the
  // listings the user sees are accurate. This catches buys whose
  // /market/buy/confirm call did not land (RPC lag, network blip, tab
  // close) and flips the affected listings from ACTIVE -> FILLED in the
  // database before we render them as still purchasable.
  if (
    launch.cluster === "mainnet-beta" &&
    launch.hybridCoreCollectionAddress &&
    launch.hybridEscrowAddress
  ) {
    await syncMetaplexHybridPoolAssets({
      launchId: launch.id,
      tokenMint: launch.tokenMint,
      collectionAddress: launch.hybridCoreCollectionAddress,
      configuredEscrowAddress: launch.hybridEscrowAddress,
      hybridProgramId: launch.hybridProgramId,
      maxPegs: launch.maxPegs,
      requireNftData: false,
    }).catch(() => null);
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

  // A previous reconciliation path treated hybrid Core listings like legacy
  // PDA listings and marked them FILLED when there was no legacy market PDA.
  // Hybrid sales always have a buyer/buyTxHash; if both are absent and the
  // Core asset is still LISTED in local state, this is an active delegated listing.
  await prisma.$executeRaw`
    UPDATE "ClawPegMarketListing" AS l
    SET "status" = 'ACTIVE',
      "soldAt" = NULL,
      "buyerAddress" = NULL,
      "buyTxHash" = NULL,
      "updatedAt" = NOW()
    FROM "ClawPegHybridAsset" AS a
    WHERE l."launchId" = ${launch.id}
      AND l."status" = 'FILLED'
      AND l."buyerAddress" IS NULL
      AND l."buyTxHash" IS NULL
      AND a."launchId" = l."launchId"
      AND a."assetAddress" = l."listingAddress"
      AND a."status" = 'LISTED'
  `.catch(() => 0);

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
      collection_address: launch.hybridCoreCollectionAddress || launch.collectionAddress,
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
    listings: rawListings.map((listing) => {
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
