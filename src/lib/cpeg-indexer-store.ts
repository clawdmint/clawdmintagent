import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

export interface CpegIndexerEventInput {
  program: "standard" | "market";
  programId: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  eventName: string;
  logLine: string;
  errJson?: string | null;
}

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "ClawPegIndexerEvent" (
  "id" TEXT PRIMARY KEY,
  "program" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "slot" BIGINT NOT NULL,
  "blockTime" TIMESTAMP NULL,
  "eventName" TEXT NOT NULL,
  "logLine" TEXT NOT NULL,
  "errJson" TEXT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("program", "signature", "eventName", "logLine")
);
CREATE INDEX IF NOT EXISTS "ClawPegIndexerEvent_slot_idx" ON "ClawPegIndexerEvent" ("slot" DESC);
CREATE INDEX IF NOT EXISTS "ClawPegIndexerEvent_event_idx" ON "ClawPegIndexerEvent" ("eventName", "slot" DESC);
`;

let ensured = false;

export async function ensureCpegIndexerEventTable() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(TABLE_SQL);
  ensured = true;
}

export async function insertCpegIndexerEvents(rows: CpegIndexerEventInput[]) {
  if (!rows.length) return 0;
  await ensureCpegIndexerEventTable();

  let inserted = 0;
  for (const row of rows) {
    const blockTimeIso = row.blockTime ? new Date(row.blockTime * 1000).toISOString() : null;
    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "ClawPegIndexerEvent" (
        "id", "program", "programId", "signature", "slot",
        "blockTime", "eventName", "logLine", "errJson", "createdAt"
      )
      VALUES (
        ${randomUUID()}, ${row.program}, ${row.programId}, ${row.signature}, ${BigInt(row.slot)},
        ${blockTimeIso}, ${row.eventName}, ${row.logLine}, ${row.errJson || null}, NOW()
      )
      ON CONFLICT ("program", "signature", "eventName", "logLine") DO NOTHING
      RETURNING "id"
    `;
    if (result.length) inserted += 1;
  }
  return inserted;
}

