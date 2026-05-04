import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
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
    pegId: string;
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const pegId = Number(params.pegId);
  if (!Number.isInteger(pegId) || pegId < 1) {
    return NextResponse.json({ success: false, error: "Invalid peg id" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch
    .findUnique({
      where: { tokenMint: params.mint },
    })
    .catch(() => null);
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }

  const traits = getClawPegTraits({
    rendererId: launch.rendererId,
    rendererVersion: launch.rendererVersion,
    collectionSeed: launch.collectionSeed,
    tokenMint: launch.tokenMint,
    pegId,
    params: (launch.rendererParams as Record<string, unknown> | null) || {},
  });
  const pegRecordAddress = launch.collectionAddress
    ? findPegRecordAddress(launch.collectionAddress, pegId)
    : null;
  const account = pegRecordAddress
    ? await new Connection(getClawPegRpcUrl(), "confirmed").getAccountInfo(pegRecordAddress, "confirmed").catch(() => null)
    : null;
  const record = account?.data ? parseClawPegRecordAccount(Buffer.from(account.data)) : null;

  return NextResponse.json({
    success: true,
    peg: {
      id: pegId,
      name: `${launch.symbol} cPEG #${pegId}`,
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      peg_record: pegRecordAddress?.toBase58() || null,
      minted: Boolean(record?.isInitialized),
      owner: record?.owner || null,
      status: record ? describeClawPegRecordStatus(record.status) : null,
      on_chain_seed: record?.seed || null,
      minted_slot: record?.mintedSlot.toString() || null,
      transferred_slot: record?.transferredSlot.toString() || null,
      burned_slot: record?.burnedSlot.toString() || null,
      image: `/api/cpeg/${launch.tokenMint}/pegs/${pegId}/svg`,
      traits,
    },
  });
}
