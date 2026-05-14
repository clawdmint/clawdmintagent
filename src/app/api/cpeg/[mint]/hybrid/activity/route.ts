import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_LISTED,
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
  CPEG_HYBRID_ASSET_STATUS_POOL,
} from "@/lib/cpeg-hybrid-engine";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

interface HourBucket {
  hour_ts: string;
  mints: number;
  burns: number;
  net: number;
}

interface DayBucket {
  day_ts: string;
  mints: number;
  burns: number;
  net: number;
  cumulative: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOURLY_WINDOW_HOURS = 24;
const DAILY_WINDOW_DAYS = 30;

function alignHour(ts: number) {
  return ts - (ts % HOUR_MS);
}

function alignDay(ts: number) {
  const date = new Date(ts);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: { id: true, maxPegs: true, pegUnitRaw: true, createdAt: true },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const now = Date.now();
  const hourlyCutoff = new Date(now - HOURLY_WINDOW_HOURS * HOUR_MS);
  const dailyCutoff = new Date(now - DAILY_WINDOW_DAYS * DAY_MS);

  // We pull capture/release events as two separate streams (one row per event).
  // Pending reservations and pool seed rows are not user-facing flow events.
  const captureRows = await prisma.clawPegHybridAsset.findMany({
    where: {
      launchId: launch.id,
      capturedAt: { not: null, gte: dailyCutoff },
      status: { in: [CPEG_HYBRID_ASSET_STATUS_OWNED, CPEG_HYBRID_ASSET_STATUS_LISTED, CPEG_HYBRID_ASSET_STATUS_POOL] },
    },
    select: { capturedAt: true },
  });

  const releaseRows = await prisma.clawPegHybridAsset.findMany({
    where: {
      launchId: launch.id,
      releasedAt: { not: null, gte: dailyCutoff },
    },
    select: { releasedAt: true },
  });

  // Lifetime counters. Pending reservations do not count - they only hold a
  // peg id slot until the user signs or the TTL purges them.
  const grouped = await prisma.clawPegHybridAsset.groupBy({
    by: ["status"],
    where: { launchId: launch.id },
    _count: { _all: true },
  });
  let totalRows = 0;
  let ownedRows = 0;
  let poolRows = 0;
  let listedRows = 0;
  for (const row of grouped) {
    if (row.status === CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE) continue;
    totalRows += row._count._all;
    if (row.status === CPEG_HYBRID_ASSET_STATUS_OWNED) ownedRows += row._count._all;
    else if (row.status === CPEG_HYBRID_ASSET_STATUS_POOL) poolRows += row._count._all;
    else if (row.status === CPEG_HYBRID_ASSET_STATUS_LISTED) listedRows += row._count._all;
  }

  const lifetimeReleases = await prisma.clawPegHybridAsset.count({
    where: { launchId: launch.id, releaseTxHash: { not: null } },
  });
  // Lifetime mints = current captures (owned + listed + pool) + lifetime releases,
  // because a released asset was previously captured. We exclude pending.
  const lifetimeMints = totalRows + lifetimeReleases;

  // Bucket hourly window
  const hourlyBuckets = new Map<number, HourBucket>();
  for (let i = HOURLY_WINDOW_HOURS - 1; i >= 0; i -= 1) {
    const ts = alignHour(now - i * HOUR_MS);
    hourlyBuckets.set(ts, {
      hour_ts: new Date(ts).toISOString(),
      mints: 0,
      burns: 0,
      net: 0,
    });
  }
  for (const row of captureRows) {
    if (!row.capturedAt) continue;
    if (row.capturedAt.getTime() < hourlyCutoff.getTime()) continue;
    const bucketTs = alignHour(row.capturedAt.getTime());
    const bucket = hourlyBuckets.get(bucketTs);
    if (bucket) {
      bucket.mints += 1;
      bucket.net += 1;
    }
  }
  for (const row of releaseRows) {
    if (!row.releasedAt) continue;
    if (row.releasedAt.getTime() < hourlyCutoff.getTime()) continue;
    const bucketTs = alignHour(row.releasedAt.getTime());
    const bucket = hourlyBuckets.get(bucketTs);
    if (bucket) {
      bucket.burns += 1;
      bucket.net -= 1;
    }
  }

  // Bucket daily window for the cumulative sparkline. Cumulative is computed
  // by replaying mints/burns forward from the rows that landed inside the
  // 30-day window, plus the pre-window baseline so the sparkline anchors
  // correctly at the start of the chart.
  const dailyBuckets = new Map<number, DayBucket>();
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const ts = alignDay(now - i * DAY_MS);
    dailyBuckets.set(ts, {
      day_ts: new Date(ts).toISOString(),
      mints: 0,
      burns: 0,
      net: 0,
      cumulative: 0,
    });
  }
  for (const row of captureRows) {
    if (!row.capturedAt) continue;
    const bucketTs = alignDay(row.capturedAt.getTime());
    const bucket = dailyBuckets.get(bucketTs);
    if (bucket) {
      bucket.mints += 1;
      bucket.net += 1;
    }
  }
  for (const row of releaseRows) {
    if (!row.releasedAt) continue;
    const bucketTs = alignDay(row.releasedAt.getTime());
    const bucket = dailyBuckets.get(bucketTs);
    if (bucket) {
      bucket.burns += 1;
      bucket.net -= 1;
    }
  }

  // Compute the baseline (cumulative captured _before_ the daily window) so
  // the sparkline does not start at zero when the chart window opens after
  // the launch already accumulated history.
  const dailyCutoffTs = dailyCutoff.getTime();
  const captureRowsAll = await prisma.clawPegHybridAsset.findMany({
    where: { launchId: launch.id, capturedAt: { not: null, lt: dailyCutoff } },
    select: { capturedAt: true },
  });
  const releaseRowsAll = await prisma.clawPegHybridAsset.findMany({
    where: { launchId: launch.id, releasedAt: { not: null, lt: dailyCutoff } },
    select: { releasedAt: true },
  });
  let baseline = 0;
  for (const row of captureRowsAll) {
    if (row.capturedAt && row.capturedAt.getTime() < dailyCutoffTs) baseline += 1;
  }
  for (const row of releaseRowsAll) {
    if (row.releasedAt && row.releasedAt.getTime() < dailyCutoffTs) baseline -= 1;
  }

  const dailyArray = Array.from(dailyBuckets.values()).sort((a, b) =>
    a.day_ts.localeCompare(b.day_ts)
  );
  let runningTotal = Math.max(0, baseline);
  for (const bucket of dailyArray) {
    runningTotal = Math.max(0, runningTotal + bucket.net);
    bucket.cumulative = runningTotal;
  }

  const hourlyArray = Array.from(hourlyBuckets.values()).sort((a, b) =>
    a.hour_ts.localeCompare(b.hour_ts)
  );
  const mints24h = hourlyArray.reduce((acc, bucket) => acc + bucket.mints, 0);
  const burns24h = hourlyArray.reduce((acc, bucket) => acc + bucket.burns, 0);

  return NextResponse.json({
    success: true,
    cluster: undefined,
    window: {
      hourly_hours: HOURLY_WINDOW_HOURS,
      daily_days: DAILY_WINDOW_DAYS,
      generated_at: new Date(now).toISOString(),
    },
    totals: {
      mints_24h: mints24h,
      burns_24h: burns24h,
      net_24h: mints24h - burns24h,
      lifetime_mints: lifetimeMints,
      lifetime_burns: lifetimeReleases,
      current_minted: ownedRows + listedRows,
      current_in_pool: poolRows,
      total_assets: totalRows,
      max_pegs: launch.maxPegs,
    },
    hourly: hourlyArray,
    daily: dailyArray,
  });
}
