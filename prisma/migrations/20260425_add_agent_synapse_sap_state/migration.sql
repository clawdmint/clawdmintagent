ALTER TABLE "Agent"
ADD COLUMN IF NOT EXISTS "synapseSapAgentPda" TEXT,
ADD COLUMN IF NOT EXISTS "synapseSapStatsPda" TEXT,
ADD COLUMN IF NOT EXISTS "synapseSapTxSignature" TEXT,
ADD COLUMN IF NOT EXISTS "synapseSapRegisteredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Agent_synapseSapAgentPda_key" ON "Agent"("synapseSapAgentPda");
CREATE INDEX IF NOT EXISTS "Agent_synapseSapAgentPda_idx" ON "Agent"("synapseSapAgentPda");
