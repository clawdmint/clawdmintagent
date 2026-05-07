import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function lamportsToSol(value: bigint) {
  return Number(value) / 1_000_000_000;
}

function formatSol(value: bigint) {
  return lamportsToSol(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export async function GET() {
  try {
    const [
      launchRows,
      activeRows,
      filledAggRows,
      sellerCountRows,
      buyerCountRows,
      modeRows,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "ClawPegLaunch"
        WHERE "status" IN (${"ACTIVE"}, ${"LAUNCHED"}, ${"HYBRID_READY"}, ${"HYBRID_CONFIGURED"})
      `,
      prisma.$queryRaw<Array<{ count: bigint; floor: string | null }>>`
        SELECT COUNT(*)::bigint AS "count",
          MIN(("priceLamports"::numeric))::text AS "floor"
        FROM "ClawPegMarketListing"
        WHERE "status" = ${"ACTIVE"}
      `,
      prisma.$queryRaw<Array<{ count: bigint; volume: string | null }>>`
        SELECT COUNT(*)::bigint AS "count",
          COALESCE(SUM(("priceLamports"::numeric)), 0)::text AS "volume"
        FROM "ClawPegMarketListing"
        WHERE "status" = ${"FILLED"}
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "sellerAddress")::bigint AS "count"
        FROM "ClawPegMarketListing"
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "buyerAddress")::bigint AS "count"
        FROM "ClawPegMarketListing"
        WHERE "buyerAddress" IS NOT NULL
      `,
      prisma.$queryRaw<Array<{ identityMode: string; count: bigint }>>`
        SELECT "identityMode", COUNT(*)::bigint AS "count"
        FROM "ClawPegLaunch"
        WHERE "status" IN (${"ACTIVE"}, ${"LAUNCHED"}, ${"HYBRID_READY"}, ${"HYBRID_CONFIGURED"})
        GROUP BY "identityMode"
      `,
    ]);

    const totalLaunches = Number(launchRows[0]?.count ?? 0);
    const activeListings = Number(activeRows[0]?.count ?? 0);
    const filledListings = Number(filledAggRows[0]?.count ?? 0);
    const distinctSellers = Number(sellerCountRows[0]?.count ?? 0);
    const distinctBuyers = Number(buyerCountRows[0]?.count ?? 0);
    const floorLamports = activeRows[0]?.floor ?? null;
    const volumeLamports = filledAggRows[0]?.volume ?? "0";

    return NextResponse.json({
      success: true,
      stats: {
        total_launches: totalLaunches,
        active_listings: activeListings,
        filled_listings: filledListings,
        distinct_sellers: distinctSellers,
        distinct_buyers: distinctBuyers,
        floor_lamports: floorLamports,
        floor_sol: floorLamports !== null ? formatSol(BigInt(floorLamports)) : null,
        volume_lamports: volumeLamports,
        volume_sol: formatSol(BigInt(volumeLamports || "0")),
        identity_modes: Object.fromEntries(
          modeRows.map((row) => [row.identityMode, Number(row.count)])
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: true,
        stats: {
          total_launches: 0,
          active_listings: 0,
          filled_listings: 0,
          distinct_sellers: 0,
          distinct_buyers: 0,
          floor_lamports: null,
          floor_sol: null,
          volume_lamports: "0",
          volume_sol: "0",
          identity_modes: {},
        },
        warning: error instanceof Error ? error.message : "stats unavailable",
      },
      { status: 200 }
    );
  }
}
