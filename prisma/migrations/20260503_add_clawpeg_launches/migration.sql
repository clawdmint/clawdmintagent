-- CreateTable
CREATE TABLE "ClawPegLaunch" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "tokenLaunchId" TEXT,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "collectionAddress" TEXT,
    "hookValidationAddress" TEXT,
    "hookProgramId" TEXT,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "cluster" TEXT NOT NULL DEFAULT 'mainnet-beta',
    "rendererId" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "rendererHash" TEXT NOT NULL,
    "collectionSeed" TEXT NOT NULL,
    "rendererParams" JSONB,
    "pegUnitRaw" TEXT NOT NULL,
    "maxPegs" INTEGER NOT NULL,
    "royaltyBps" INTEGER NOT NULL DEFAULT 0,
    "marketplaceFeeBps" INTEGER NOT NULL DEFAULT 0,
    "launchFeeLamports" TEXT NOT NULL DEFAULT '0',
    "premiumIndexing" BOOLEAN NOT NULL DEFAULT false,
    "partnerApiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whiteLabelDomain" TEXT,
    "authorityAddress" TEXT NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "feeVaultAddress" TEXT NOT NULL,
    "deployTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "launchedAt" TIMESTAMP(3),

    CONSTRAINT "ClawPegLaunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClawPegLaunch_tokenMint_key" ON "ClawPegLaunch"("tokenMint");

-- CreateIndex
CREATE UNIQUE INDEX "ClawPegLaunch_collectionAddress_key" ON "ClawPegLaunch"("collectionAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ClawPegLaunch_hookValidationAddress_key" ON "ClawPegLaunch"("hookValidationAddress");

-- CreateIndex
CREATE INDEX "ClawPegLaunch_agentId_idx" ON "ClawPegLaunch"("agentId");

-- CreateIndex
CREATE INDEX "ClawPegLaunch_tokenMint_idx" ON "ClawPegLaunch"("tokenMint");

-- CreateIndex
CREATE INDEX "ClawPegLaunch_collectionAddress_idx" ON "ClawPegLaunch"("collectionAddress");

-- CreateIndex
CREATE INDEX "ClawPegLaunch_hookValidationAddress_idx" ON "ClawPegLaunch"("hookValidationAddress");

-- CreateIndex
CREATE INDEX "ClawPegLaunch_status_idx" ON "ClawPegLaunch"("status");

-- CreateIndex
CREATE INDEX "ClawPegLaunch_createdAt_idx" ON "ClawPegLaunch"("createdAt");

-- AddForeignKey
ALTER TABLE "ClawPegLaunch" ADD CONSTRAINT "ClawPegLaunch_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
