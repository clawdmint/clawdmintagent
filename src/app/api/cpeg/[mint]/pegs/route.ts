import { Connection } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  describeClawPegRecordStatus,
  findPegRecordAddress,
  parseClawPegRecordAccount,
} from "@/lib/clawpeg";
import { getClawPegTraits } from "@/lib/clawpeg-renderer";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    mint: string;
  };
}

function parsePegRecord(data: Buffer) {
  if (data.length < 126 || data[0] !== 1) {
    return null;
  }
  const record = parseClawPegRecordAccount(data);
  return {
    status: record.status,
    statusLabel: describeClawPegRecordStatus(record.status),
    collection: record.collection,
    owner: record.owner,
    pegId: record.pegId,
    seed: record.seed,
    mintedSlot: record.mintedSlot.toString(),
    transferredSlot: record.transferredSlot.toString(),
    burnedSlot: record.burnedSlot.toString(),
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const search = request.nextUrl.searchParams;
  const start = Math.max(0, Number.parseInt(search.get("start") || "1", 10));
  const limit = Math.min(48, Math.max(1, Number.parseInt(search.get("limit") || "24", 10)));
  const ownerFilter = search.get("owner") || "";

  const launch = await prisma.clawPegLaunch
    .findUnique({
      where: { tokenMint: params.mint },
    })
    .catch(() => null);
  if (!launch?.collectionAddress) {
    if (launch?.standardMode !== "metaplex_hybrid") {
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
    }
    const rows = await prisma.clawPegHybridAsset.findMany({
      where: {
        launchId: launch.id,
        ...(ownerFilter ? { ownerAddress: ownerFilter, status: "OWNED" } : {}),
      },
      orderBy: { pegId: "asc" },
      skip: start,
      take: limit,
    });
    return NextResponse.json({
      success: true,
      collection: {
        name: launch.name,
        symbol: launch.symbol,
        token_mint: launch.tokenMint,
        collection_address: launch.hybridCoreCollectionAddress,
        max_pegs: launch.maxPegs,
      },
      page: {
        start,
        limit,
        next_start: start + limit < launch.maxPegs ? start + limit : null,
        previous_start: start > 0 ? Math.max(0, start - limit) : null,
      },
      pegs: rows.map((row) => {
        const traits = getClawPegTraits({
          rendererId: launch.rendererId,
          rendererVersion: launch.rendererVersion,
          collectionSeed: launch.collectionSeed,
          tokenMint: launch.tokenMint,
          pegId: row.pegId,
          params: (launch.rendererParams as Record<string, unknown> | null) || {},
        });
        return {
          id: row.pegId,
          name: `${launch.symbol} cPEG #${row.pegId}`,
          token_mint: launch.tokenMint,
          peg_record: row.assetAddress,
          asset_address: row.assetAddress,
          image: `/api/cpeg/${launch.tokenMint}/pegs/${row.pegId}/svg`,
          minted: true,
          owner: row.ownerAddress,
          status: row.status,
          status_label: row.status,
          on_chain_seed: null,
          minted_slot: null,
          transferred_slot: null,
          burned_slot: null,
          traits,
        };
      }),
    });
  }

  const endExclusive = Math.min(launch.maxPegs, start + limit);
  const ids = Array.from({ length: Math.max(0, endExclusive - start) }, (_, index) => start + index);
  const pegAddresses = ids.map((pegId) => findPegRecordAddress(launch.collectionAddress || "", pegId));
  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const accounts = pegAddresses.length
    ? await connection.getMultipleAccountsInfo(pegAddresses, "confirmed")
    : [];

  return NextResponse.json({
    success: true,
    collection: {
      name: launch.name,
      symbol: launch.symbol,
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      max_pegs: launch.maxPegs,
    },
    page: {
      start,
      limit,
      next_start: endExclusive < launch.maxPegs ? endExclusive : null,
      previous_start: start > 0 ? Math.max(0, start - limit) : null,
    },
    pegs: ids
      .map((pegId, index) => {
        const record = accounts[index]?.data ? parsePegRecord(Buffer.from(accounts[index]?.data || [])) : null;
        const traits = getClawPegTraits({
          rendererId: launch.rendererId,
          rendererVersion: launch.rendererVersion,
          collectionSeed: launch.collectionSeed,
          tokenMint: launch.tokenMint,
          pegId,
          params: (launch.rendererParams as Record<string, unknown> | null) || {},
        });

        return {
          id: pegId,
          name: `${launch.symbol} cPEG #${pegId}`,
          token_mint: launch.tokenMint,
          peg_record: pegAddresses[index]?.toBase58(),
          image: `/api/cpeg/${launch.tokenMint}/pegs/${pegId}/svg`,
        minted: Boolean(record),
        owner: record?.owner || null,
        status: record?.status || null,
        status_label: record?.statusLabel || null,
        on_chain_seed: record?.seed || null,
        minted_slot: record?.mintedSlot || null,
        transferred_slot: record?.transferredSlot || null,
        burned_slot: record?.burnedSlot || null,
        traits,
      };
      })
      .filter((peg) => (ownerFilter ? peg.owner === ownerFilter : true)),
  });
}
