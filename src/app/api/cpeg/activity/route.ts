import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ActivityRow {
  id: string;
  status: string;
  pegId: number;
  priceLamports: string;
  sellerAddress: string;
  buyerAddress: string | null;
  tokenMint: string;
  listTxHash: string | null;
  buyTxHash: string | null;
  cancelTxHash: string | null;
  listedAt: Date | null;
  soldAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
  collectionName: string | null;
  collectionSymbol: string | null;
}

function lamportsToSol(value: bigint) {
  return Number(value) / 1_000_000_000;
}

function eventTimestamp(row: ActivityRow): { kind: "FILLED" | "CANCELLED" | "ACTIVE"; at: Date; tx: string | null } {
  if (row.status === "FILLED") {
    return { kind: "FILLED", at: row.soldAt || row.updatedAt, tx: row.buyTxHash };
  }
  if (row.status === "CANCELLED") {
    return { kind: "CANCELLED", at: row.cancelledAt || row.updatedAt, tx: row.cancelTxHash };
  }
  return { kind: "ACTIVE", at: row.listedAt || row.updatedAt, tx: row.listTxHash };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "30", 10), 1), 100);
  const mintFilter = url.searchParams.get("mint");

  try {
    const rows = mintFilter
      ? await prisma.$queryRaw<ActivityRow[]>`
          SELECT m."id", m."status", m."pegId", m."priceLamports", m."sellerAddress", m."buyerAddress",
            m."tokenMint", m."listTxHash", m."buyTxHash", m."cancelTxHash",
            m."listedAt", m."soldAt", m."cancelledAt", m."updatedAt",
            l."name" AS "collectionName", l."symbol" AS "collectionSymbol"
          FROM "ClawPegMarketListing" m
          LEFT JOIN "ClawPegLaunch" l ON l."tokenMint" = m."tokenMint"
          WHERE m."tokenMint" = ${mintFilter}
          ORDER BY m."updatedAt" DESC
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<ActivityRow[]>`
          SELECT m."id", m."status", m."pegId", m."priceLamports", m."sellerAddress", m."buyerAddress",
            m."tokenMint", m."listTxHash", m."buyTxHash", m."cancelTxHash",
            m."listedAt", m."soldAt", m."cancelledAt", m."updatedAt",
            l."name" AS "collectionName", l."symbol" AS "collectionSymbol"
          FROM "ClawPegMarketListing" m
          LEFT JOIN "ClawPegLaunch" l ON l."tokenMint" = m."tokenMint"
          ORDER BY m."updatedAt" DESC
          LIMIT ${limit}
        `;

    const events = rows.map((row) => {
      const event = eventTimestamp(row);
      return {
        id: row.id,
        kind: event.kind,
        peg_id: row.pegId,
        token_mint: row.tokenMint,
        collection_name: row.collectionName,
        collection_symbol: row.collectionSymbol,
        price_lamports: row.priceLamports,
        price_sol: lamportsToSol(BigInt(row.priceLamports || "0")).toLocaleString(undefined, {
          maximumFractionDigits: 4,
        }),
        seller: row.sellerAddress,
        buyer: row.buyerAddress,
        tx: event.tx,
        at: event.at?.toISOString() || row.updatedAt.toISOString(),
        image: `/api/cpeg/${row.tokenMint}/pegs/${row.pegId}/svg`,
      };
    });

    return NextResponse.json({ success: true, events });
  } catch (error) {
    return NextResponse.json(
      { success: true, events: [], warning: error instanceof Error ? error.message : "activity unavailable" },
      { status: 200 }
    );
  }
}
