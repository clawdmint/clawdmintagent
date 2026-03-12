ALTER TABLE "Collection"
ADD COLUMN "authorityAddress" TEXT,
ADD COLUMN "bagsStatus" TEXT NOT NULL DEFAULT 'DISABLED',
ADD COLUMN "bagsTokenAddress" TEXT,
ADD COLUMN "bagsTokenName" TEXT,
ADD COLUMN "bagsTokenSymbol" TEXT,
ADD COLUMN "bagsTokenMetadata" TEXT,
ADD COLUMN "bagsLaunchTxHash" TEXT,
ADD COLUMN "bagsConfigKey" TEXT,
ADD COLUMN "bagsMintAccess" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN "bagsMinTokenBalance" TEXT,
ADD COLUMN "bagsFeeConfig" TEXT,
ADD COLUMN "bagsCreatorWallet" TEXT,
ADD COLUMN "bagsInitialBuyLamports" TEXT,
ADD COLUMN "bagsScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "bagsLifetimeFees" TEXT,
ADD COLUMN "bagsClaimedFees" TEXT,
ADD COLUMN "bagsAnalyticsUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Collection_bagsStatus_idx" ON "Collection"("bagsStatus");
CREATE INDEX "Collection_bagsTokenAddress_idx" ON "Collection"("bagsTokenAddress");
