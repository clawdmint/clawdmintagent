import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { getClawPegProgramId } from "@/lib/clawpeg";
import { ensureCpegIndexerEventTable, insertCpegIndexerEvents } from "@/lib/cpeg-indexer-store";
import { prisma } from "@/lib/db";
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
  if (name === "market") {
    throw new Error("Legacy custom cPEG market program indexing is disabled on the Metaplex Hybrid path.");
  }
  return getClawPegProgramId();
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const program = search.get("program") === "market" ? "market" : "standard";
  const limit = Math.min(Math.max(Number.parseInt(search.get("limit") || "20", 10), 1), 50);
  const persist = search.get("persist") !== "0";
  const source = search.get("source") === "db" ? "db" : "rpc";
  const sinceSlot = Number.parseInt(search.get("since_slot") || "0", 10);

  try {
    const programId = readProgramAddress(program);
    await ensureCpegIndexerEventTable();

    if (source === "db") {
      const rows = await prisma.$queryRaw<
        Array<{
          signature: string;
          slot: bigint;
          blockTime: Date | null;
          eventName: string;
          logLine: string;
          errJson: string | null;
        }>
      >`
        SELECT "signature", "slot", "blockTime", "eventName", "logLine", "errJson"
        FROM "ClawPegIndexerEvent"
        WHERE "program" = ${program}
          AND "slot" >= ${BigInt(Number.isFinite(sinceSlot) ? Math.max(0, sinceSlot) : 0)}
        ORDER BY "slot" DESC, "createdAt" DESC
        LIMIT ${limit * 4}
      `;

      const grouped = new Map<string, { signature: string; slot: number; block_time: string | null; err: string | null; events: Array<{ name: string; log: string }> }>();
      for (const row of rows) {
        const key = row.signature;
        if (!grouped.has(key)) {
          grouped.set(key, {
            signature: row.signature,
            slot: Number(row.slot),
            block_time: row.blockTime ? row.blockTime.toISOString() : null,
            err: row.errJson,
            events: [],
          });
        }
        grouped.get(key)?.events.push({ name: row.eventName, log: row.logLine });
      }
      return NextResponse.json({
        success: true,
        standard: "cPEG Standard v0.1",
        program,
        program_id: programId.toBase58(),
        source: "db",
        events: Array.from(grouped.values()).slice(0, limit),
      });
    }

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

    if (persist && events.length > 0) {
      const flattened = events.flatMap((event: (typeof events)[number]) =>
        event.events.map((item: { name: string; log: string }) => ({
          program,
          programId: programId.toBase58(),
          signature: event.signature,
          slot: event.slot,
          blockTime: event.block_time || null,
          eventName: item.name,
          logLine: item.log,
          errJson: event.err ? JSON.stringify(event.err) : null,
        }))
      );
      await insertCpegIndexerEvents(flattened);
    }

    return NextResponse.json({
      success: true,
      standard: "cPEG Standard v0.1",
      program,
      program_id: programId.toBase58(),
      source: "rpc",
      events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: true,
        standard: "cPEG Standard v0.1",
        program,
        events: [],
        source,
        warning: error instanceof Error ? error.message : "Failed to scan cPEG events",
      },
      { status: 200 }
    );
  }
}
