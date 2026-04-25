ALTER TABLE "Agent"
ADD COLUMN "synapseSapAgentPda" TEXT,
ADD COLUMN "synapseSapStatsPda" TEXT,
ADD COLUMN "synapseSapTxSignature" TEXT,
ADD COLUMN "synapseSapRegisteredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Agent_synapseSapAgentPda_key" ON "Agent"("synapseSapAgentPda");
CREATE INDEX "Agent_synapseSapAgentPda_idx" ON "Agent"("synapseSapAgentPda");
