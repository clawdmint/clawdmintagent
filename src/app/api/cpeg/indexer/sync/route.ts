import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { getClawPegProgramId, getCpegMarketProgramId } from "@/lib/clawpeg";
import { insertCpegIndexerEvents } from "@/lib/cpeg-indexer-store";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const CPEG_EVENT_NAMES = [
  "PegMinted",
  "PegTransferred",
  "PegBurned",
  "OwnerPegSynced",
  "TradeArtGenerated",
  "TradeArtAlreadyRecorded",
  "CpegMarketListed",
  "CpegMarketSold",
  "CpegMarketCancelled",
  "PegTransferHookExecuted",
  "OwnerPegTransferHookSynced",
] as const;

type ProgramType = "standard" | "market";

function parseCpegEvents(logs: string[] | null | undefined) {
  if (!logs?.length) return [];
  return logs.flatMap((line) =>
    CPEG_EVENT_NAMES.filter((name) => line.includes(name)).map((name) => ({
      name,
      log: line,
    }))
  );
}

function programAddress(program: ProgramType): InstanceType<typeof PublicKey> {
  return program === "market" ? getCpegMarketProgramId() : getClawPegProgramId();
}

async function syncProgram(program: ProgramType, limit: number) {
  const programId = programAddress(program);
  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const signatures = await connection.getSignaturesForAddress(programId, { limit }, "confirmed");
  const txs = await connection.getParsedTransactions(
    signatures.map((item: (typeof signatures)[number]) => item.signature),
    { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
  );

  const rows = txs.flatMap((tx: (typeof txs)[number], index: number) => {
    const parsed = parseCpegEvents(tx?.meta?.logMessages);
    if (!parsed.length) return [];
    const sig = signatures[index];
    return parsed.map((event) => ({
      program,
      programId: programId.toBase58(),
      signature: sig.signature,
      slot: sig.slot,
      blockTime: sig.blockTime || null,
      eventName: event.name,
      logLine: event.log,
      errJson: sig.err ? JSON.stringify(sig.err) : null,
    }));
  });
  const inserted = await insertCpegIndexerEvents(rows);
  return { program, scanned: signatures.length, inserted, events: rows.length };
}

export async function POST(request: NextRequest) {
  const limit = Math.min(Math.max(Number.parseInt(request.nextUrl.searchParams.get("limit") || "40", 10), 1), 100);
  const only = request.nextUrl.searchParams.get("program");
  const programs: ProgramType[] =
    only === "market" ? ["market"] : only === "standard" ? ["standard"] : ["standard", "market"];

  try {
    const results = await Promise.all(programs.map((program) => syncProgram(program, limit)));
    return NextResponse.json({
      success: true,
      standard: "cPEG Standard v0.1",
      synced_at: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Indexer sync failed",
      },
      { status: 500 }
    );
  }
}

