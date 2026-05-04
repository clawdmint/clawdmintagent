import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { address: string };
}

function lamportsToSol(value: string) {
  return (Number(value) / 1_000_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function cpegCollectionPublicUrl(mint: string) {
  const base = (process.env.NEXT_PUBLIC_CPEG_APP_URL || "").trim().replace(/\/$/, "");
  return base && (base.startsWith("http://") || base.startsWith("https://")) ? `${base}/${mint}` : `/cpeg/${mint}`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const address = params.address;
  if (!address || address.length < 32) {
    return NextResponse.json({ success: false, error: "Invalid address" }, { status: 400 });
  }

  const [listed, sold, bought, launches] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      tokenMint: string;
      pegId: number;
      priceLamports: string;
      status: string;
      listedAt: Date | null;
      symbol: string;
      name: string;
    }>>`
      SELECT l."id", l."tokenMint", l."pegId", l."priceLamports", l."status", l."listedAt",
        ll."symbol", ll."name"
      FROM "ClawPegMarketListing" l
      JOIN "ClawPegLaunch" ll ON ll."id" = l."launchId"
      WHERE l."sellerAddress" = ${address} AND l."status" = ${"ACTIVE"}
      ORDER BY l."listedAt" DESC NULLS LAST
      LIMIT 24
    `,
    prisma.$queryRaw<Array<{
      id: string;
      tokenMint: string;
      pegId: number;
      priceLamports: string;
      soldAt: Date | null;
      symbol: string;
      name: string;
    }>>`
      SELECT l."id", l."tokenMint", l."pegId", l."priceLamports", l."soldAt",
        ll."symbol", ll."name"
      FROM "ClawPegMarketListing" l
      JOIN "ClawPegLaunch" ll ON ll."id" = l."launchId"
      WHERE l."sellerAddress" = ${address} AND l."status" = ${"FILLED"}
      ORDER BY l."soldAt" DESC NULLS LAST
      LIMIT 24
    `,
    prisma.$queryRaw<Array<{
      id: string;
      tokenMint: string;
      pegId: number;
      priceLamports: string;
      soldAt: Date | null;
      symbol: string;
      name: string;
    }>>`
      SELECT l."id", l."tokenMint", l."pegId", l."priceLamports", l."soldAt",
        ll."symbol", ll."name"
      FROM "ClawPegMarketListing" l
      JOIN "ClawPegLaunch" ll ON ll."id" = l."launchId"
      WHERE l."buyerAddress" = ${address} AND l."status" = ${"FILLED"}
      ORDER BY l."soldAt" DESC NULLS LAST
      LIMIT 24
    `,
    prisma.clawPegLaunch.findMany({
      where: { creatorAddress: address },
      select: {
        id: true,
        tokenMint: true,
        name: true,
        symbol: true,
        status: true,
        maxPegs: true,
        cluster: true,
        launchedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const decorate = (
    rows: Array<{
      id: string;
      tokenMint: string;
      pegId: number;
      priceLamports: string;
      symbol: string;
      name: string;
    }>
  ) =>
    rows.map((row) => ({
      id: row.id,
      token_mint: row.tokenMint,
      peg_id: row.pegId,
      price_lamports: row.priceLamports,
      price_sol: lamportsToSol(row.priceLamports),
      symbol: row.symbol,
      name: row.name,
      image: `/api/cpeg/${row.tokenMint}/pegs/${row.pegId}/svg`,
      collection_url: cpegCollectionPublicUrl(row.tokenMint),
    }));

  return NextResponse.json({
    success: true,
    address,
    listed: decorate(listed),
    sold: decorate(sold),
    bought: decorate(bought),
    launches: launches.map((launch) => ({
      id: launch.id,
      token_mint: launch.tokenMint,
      name: launch.name,
      symbol: launch.symbol,
      status: launch.status,
      max_pegs: launch.maxPegs,
      cluster: launch.cluster,
      launched_at: launch.launchedAt?.toISOString() || null,
    })),
  });
}
