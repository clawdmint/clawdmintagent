import { Connection, PublicKey } from "@solana/web3.js";
import { getClawPegRpcUrl } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { findTradeArtRecordAddress } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    mint: string;
  };
}

function readPubkey(data: Buffer, cursor: number) {
  return new PublicKey(data.subarray(cursor, cursor + 32)).toBase58();
}

function parseTradeArtRecord(data: Buffer) {
  if (data.length < 195 || data[0] !== 1) return null;
  let cursor = 3;
  const collection = readPubkey(data, cursor);
  cursor += 32;
  const trader = readPubkey(data, cursor);
  cursor += 32;
  const inputMint = readPubkey(data, cursor);
  cursor += 32;
  const outputMint = readPubkey(data, cursor);
  cursor += 32;
  const tradeIndex = data.readBigUInt64LE(cursor).toString();
  cursor += 8;
  const amountIn = data.readBigUInt64LE(cursor).toString();
  cursor += 8;
  const amountOut = data.readBigUInt64LE(cursor).toString();
  cursor += 8;
  const slot = data.readBigUInt64LE(cursor).toString();
  cursor += 8;
  const seed = data.subarray(cursor, cursor + 32).toString("hex");
  return { collection, trader, inputMint, outputMint, tradeIndex, amountIn, amountOut, slot, seed };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const search = request.nextUrl.searchParams;
  const limit = Math.min(48, Math.max(1, Number.parseInt(search.get("limit") || "24", 10)));
  const offset = Math.max(0, Number.parseInt(search.get("offset") || "0", 10));

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      id: true,
      tokenMint: true,
      collectionAddress: true,
      cluster: true,
    },
  });
  if (!launch?.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }

  // Trade art is recorded atomically inside cpeg-market::buy() using `peg_id` as the
  // `trade_index`. The DB row for a FILLED listing therefore tells us exactly which
  // trade-art PDAs should exist on-chain. We pull the most recent fills and verify each
  // PDA via a single batched RPC call so the UI only ever shows real, on-chain art;
  // no empty placeholder slots.
  const fills = await prisma.clawPegMarketListing.findMany({
    where: { launchId: launch.id, status: "FILLED" },
    orderBy: [{ soldAt: "desc" }, { updatedAt: "desc" }],
    select: {
      pegId: true,
      sellerAddress: true,
      buyerAddress: true,
      priceLamports: true,
      soldAt: true,
      buyTxHash: true,
    },
    skip: offset,
    take: limit,
  });

  if (fills.length === 0) {
    return NextResponse.json({
      success: true,
      page: { offset, limit, next_offset: null, previous_offset: offset > 0 ? Math.max(0, offset - limit) : null },
      trade_art: [],
    });
  }

  const collectionAddress = launch.collectionAddress;
  const addresses = fills.map((row) => findTradeArtRecordAddress(collectionAddress, BigInt(row.pegId)));
  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const accounts = await connection.getMultipleAccountsInfo(addresses, "confirmed");

  const items = fills
    .map((row, index) => {
      const data = accounts[index]?.data;
      const record = data ? parseTradeArtRecord(Buffer.from(data)) : null;
      if (!record) return null;
      return {
        trade_index: row.pegId.toString(),
        peg_id: row.pegId,
        address: addresses[index].toBase58(),
        recorded: true as const,
        record,
        image: `/api/cpeg/${launch.tokenMint}/trade-art/${row.pegId.toString()}/svg`,
        sale: {
          seller: row.sellerAddress,
          buyer: row.buyerAddress,
          price_lamports: row.priceLamports.toString(),
          sold_at: row.soldAt?.toISOString() || null,
          tx: row.buyTxHash || null,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return NextResponse.json({
    success: true,
    page: {
      offset,
      limit,
      next_offset: fills.length === limit ? offset + limit : null,
      previous_offset: offset > 0 ? Math.max(0, offset - limit) : null,
    },
    trade_art: items,
  });
}
