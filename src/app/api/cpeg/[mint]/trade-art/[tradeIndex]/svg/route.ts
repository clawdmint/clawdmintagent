import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { findTradeArtRecordAddress } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { renderClawPegTradeArtSvg } from "@/lib/clawpeg-renderer";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    mint: string;
    tradeIndex: string;
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

function parseTradeIndex(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  if (parsed < BigInt(0) || parsed > BigInt("18446744073709551615")) return null;
  return parsed;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const tradeIndex = parseTradeIndex(params.tradeIndex);
  if (tradeIndex === null) {
    return NextResponse.json({ success: false, error: "Invalid trade index" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      tokenMint: true,
      collectionAddress: true,
      collectionSeed: true,
      rendererId: true,
      rendererVersion: true,
      rendererParams: true,
      cluster: true,
    },
  });
  if (!launch?.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }

  const address = findTradeArtRecordAddress(launch.collectionAddress, tradeIndex);
  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const account = await connection.getAccountInfo(address, "confirmed");
  const record = account?.data ? parseTradeArtRecord(Buffer.from(account.data)) : null;
  if (!record || record.collection !== launch.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG trade art not found" }, { status: 404 });
  }

  const svg = renderClawPegTradeArtSvg({
    rendererId: launch.rendererId,
    rendererVersion: launch.rendererVersion,
    collectionSeed: launch.collectionSeed,
    tokenMint: launch.tokenMint,
    tradeIndex,
    trader: record.trader,
    inputMint: record.inputMint,
    outputMint: record.outputMint,
    amountIn: record.amountIn,
    amountOut: record.amountOut,
    slot: record.slot,
    seed: record.seed,
    params: (launch.rendererParams as Record<string, unknown> | null) || {},
  });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
