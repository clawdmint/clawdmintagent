ALTER TABLE "Agent"
ADD COLUMN "solanaWalletAddress" TEXT,
ADD COLUMN "solanaWalletEncryptedKey" TEXT,
ADD COLUMN "solanaWalletExportedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Agent_solanaWalletAddress_key" ON "Agent"("solanaWalletAddress");
