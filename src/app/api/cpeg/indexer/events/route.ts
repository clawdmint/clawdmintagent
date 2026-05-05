import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { getClawPegProgramId, getCpegMarketProgramId } from "@/lib/clawpeg";
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

function parseCpegEvents(logs: string[] | null | undefined) {
  if (!logs?.length) return [];
  return logs
    .flatMap((line) =>
      CPEG_EVENT_NAMES.filter((name) => line.includes(name)).map((name) => ({
        name,
        log: line,
      }))
    );
}

function readProgramAddress(name: string): InstanceType<typeof PublicKey> {
  return name === "market" ? getCpegMarketProgramId() : getClawPegProgramId();
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const program = search.get("program") === "market" ? "market" : "standard";
  const limit = Math.min(Math.max(Number.parseInt(search.get("limit") || "20", 10), 1), 50);

  try {
    const programId = readProgramAddress(program);
    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const signatures = await connection.getSignaturesForAddress(programId, { limit }, "confirmed");
    const txs = await connection.getParsedTransactions(
      signatures.map((item: (typeof signatures)[number]) => item.signature),
      { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
    );

    const events = txs
      .map((tx: (typeof txs)[number], index: number) => {
        const parsed = parseCpegEvents(tx?.meta?.logMessages);
        if (parsed.length === 0) return null;
        const sig = signatures[index];
        return {
          signature: sig.signature,
          slot: sig.slot,
          block_time: sig.blockTime,
          program,
          err: sig.err,
          events: parsed,
        };
      })
      .filter((item: (typeof txs)[number] | null | unknown): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({
      success: true,
      standard: "cPEG Standard v0.1",
      program,
      program_id: programId.toBase58(),
      events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: true,
        standard: "cPEG Standard v0.1",
        program,
        events: [],
        warning: error instanceof Error ? error.message : "Failed to scan cPEG events",
      },
      { status: 200 }
    );
  }
}
