import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: { mint: string };
}

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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "40", 10), 1), 100);

  try {
    const rows = await prisma.$queryRaw<ActivityRow[]>`
      SELECT "id", "status", "pegId", "priceLamports", "sellerAddress", "buyerAddress",
        "tokenMint", "listTxHash", "buyTxHash", "cancelTxHash",
        "listedAt", "soldAt", "cancelledAt", "updatedAt"
      FROM "ClawPegMarketListing"
      WHERE "tokenMint" = ${params.mint}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;

    const events = rows.map((row) => {
      const event = eventTimestamp(row);
      const pegPreview = `/api/cpeg/${row.tokenMint}/pegs/${row.pegId}/svg`;
      const tradeArtPreview =
        event.kind === "FILLED"
          ? `/api/cpeg/${row.tokenMint}/trade-art/${row.pegId}/svg`
          : pegPreview;
      return {
        id: row.id,
        kind: event.kind,
        peg_id: row.pegId,
        token_mint: row.tokenMint,
        price_lamports: row.priceLamports,
        price_sol: lamportsToSol(BigInt(row.priceLamports || "0")).toLocaleString(undefined, {
          maximumFractionDigits: 4,
        }),
        seller: row.sellerAddress,
        buyer: row.buyerAddress,
        tx: event.tx,
        at: event.at?.toISOString() || row.updatedAt.toISOString(),
        image: pegPreview,
        trade_art_image: tradeArtPreview,
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
