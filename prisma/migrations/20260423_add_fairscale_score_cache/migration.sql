CREATE TABLE "FairscaleScoreCache" (
    "walletAddress" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "availability" TEXT NOT NULL DEFAULT 'available',
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FairscaleScoreCache_pkey" PRIMARY KEY ("walletAddress")
);

CREATE INDEX "FairscaleScoreCache_expiresAt_idx" ON "FairscaleScoreCache"("expiresAt");
CREATE INDEX "FairscaleScoreCache_availability_updatedAt_idx" ON "FairscaleScoreCache"("availability", "updatedAt");
