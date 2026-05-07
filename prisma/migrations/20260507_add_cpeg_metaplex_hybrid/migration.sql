ALTER TABLE "ClawPegLaunch"
  ADD COLUMN IF NOT EXISTS "standardMode" TEXT NOT NULL DEFAULT 'custom_registry',
  ADD COLUMN IF NOT EXISTS "agentTokenMint" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridProgramId" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridEscrowAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridCoreCollectionAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridAssetCollectionAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridSwapAmountRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridCaptureFeeLamports" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridReroll" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "hybridStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS "hybridPlan" JSONB;

CREATE INDEX IF NOT EXISTS "ClawPegLaunch_standardMode_idx" ON "ClawPegLaunch"("standardMode");
CREATE INDEX IF NOT EXISTS "ClawPegLaunch_agentTokenMint_idx" ON "ClawPegLaunch"("agentTokenMint");
CREATE INDEX IF NOT EXISTS "ClawPegLaunch_hybridStatus_idx" ON "ClawPegLaunch"("hybridStatus");
