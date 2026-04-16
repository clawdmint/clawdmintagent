-- Extend token launches for Solana / Metaplex Genesis agent token support
ALTER TABLE "TokenLaunch"
ADD COLUMN "agentId" TEXT,
ADD COLUMN "launchType" TEXT,
ADD COLUMN "network" TEXT,
ADD COLUMN "genesisAccount" TEXT,
ADD COLUMN "launchId" TEXT,
ADD COLUMN "launchUrl" TEXT,
ADD COLUMN "setOnAgent" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TokenLaunch_agentId_idx" ON "TokenLaunch"("agentId");

ALTER TABLE "TokenLaunch"
ADD CONSTRAINT "TokenLaunch_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
