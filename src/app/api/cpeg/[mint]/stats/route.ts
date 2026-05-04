import { Connection } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { findClawPegCollectionAddress } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

interface CollectionStateView {
  totalPegs: number;
  burnedPegs: number;
  maxPegs: number;
}

const COLLECTION_OFFSET_PEG_UNIT = 131;
const COLLECTION_OFFSET_MAX_PEGS = COLLECTION_OFFSET_PEG_UNIT + 8; // 139
const COLLECTION_OFFSET_TOTAL_PEGS = COLLECTION_OFFSET_MAX_PEGS + 4; // 143
const COLLECTION_OFFSET_BURNED_PEGS = COLLECTION_OFFSET_TOTAL_PEGS + 4; // 147

function parseCollectionStats(data: Buffer | null): CollectionStateView | null {
  if (!data || data.length < 228 || data[0] !== 1) return null;
  const maxPegs = data.readUInt32LE(COLLECTION_OFFSET_MAX_PEGS);
  const totalPegs = data.readUInt32LE(COLLECTION_OFFSET_TOTAL_PEGS);
  const burnedPegs = data.readUInt32LE(COLLECTION_OFFSET_BURNED_PEGS);
  return { totalPegs, burnedPegs, maxPegs };
}

function lamportsToSol(value: bigint) {
  return Number(value) / 1_000_000_000;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const launch = await prisma.clawPegLaunch
    .findUnique({
      where: { tokenMint: params.mint },
      select: {
        id: true,
        tokenMint: true,
        name: true,
        symbol: true,
        cluster: true,
        maxPegs: true,
        collectionAddress: true,
        royaltyBps: true,
        marketplaceFeeBps: true,
      },
    })
    .catch(() => null);
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }

  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const collectionPda = findClawPegCollectionAddress(launch.tokenMint);
  const collectionAccount = await connection.getAccountInfo(collectionPda, "confirmed").catch(() => null);
  const onChain = parseCollectionStats(collectionAccount ? Buffer.from(collectionAccount.data) : null);

  const [activeAggregate, soldAggregate, holdersAggregate] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint; floor: string | null }>>`
      SELECT COUNT(*)::bigint AS "count",
        MIN(("priceLamports"::numeric))::text AS "floor"
      FROM "ClawPegMarketListing"
      WHERE "tokenMint" = ${launch.tokenMint} AND "status" = ${"ACTIVE"}
    `,
    prisma.$queryRaw<Array<{ count: bigint; volume: string | null }>>`
      SELECT COUNT(*)::bigint AS "count",
        COALESCE(SUM(("priceLamports"::numeric)), 0)::text AS "volume"
      FROM "ClawPegMarketListing"
      WHERE "tokenMint" = ${launch.tokenMint} AND "status" = ${"FILLED"}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "sellerAddress")::bigint AS "count"
      FROM "ClawPegMarketListing"
      WHERE "tokenMint" = ${launch.tokenMint}
    `,
  ]);

  const activeCount = Number(activeAggregate[0]?.count ?? 0);
  const soldCount = Number(soldAggregate[0]?.count ?? 0);
  const distinctSellers = Number(holdersAggregate[0]?.count ?? 0);
  const floorLamports = activeAggregate[0]?.floor ?? null;
  const volumeLamports = soldAggregate[0]?.volume ?? "0";

  return NextResponse.json({
    success: true,
    collection: {
      token_mint: launch.tokenMint,
      name: launch.name,
      symbol: launch.symbol,
      collection_address: launch.collectionAddress,
      max_pegs: onChain?.maxPegs ?? launch.maxPegs,
      total_minted: onChain?.totalPegs ?? null,
      burned_pegs: onChain?.burnedPegs ?? null,
      royalty_bps: launch.royaltyBps,
      marketplace_fee_bps: launch.marketplaceFeeBps,
    },
    market: {
      active_listings: activeCount,
      filled_listings: soldCount,
      distinct_sellers: distinctSellers,
      floor_lamports: floorLamports,
      floor_sol:
        floorLamports !== null
          ? lamportsToSol(BigInt(floorLamports)).toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })
          : null,
      volume_lamports: volumeLamports,
      volume_sol: lamportsToSol(BigInt(volumeLamports || "0")).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      }),
    },
  });
}
