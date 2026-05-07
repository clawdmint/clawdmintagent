ALTER TABLE "ClawPegLaunch"
  ADD COLUMN IF NOT EXISTS "identityMode" TEXT NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS "canonicalRoot" TEXT,
  ADD COLUMN IF NOT EXISTS "agentAssetAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "agentIdentityPda" TEXT,
  ADD COLUMN IF NOT EXISTS "agentCollectionAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "agentWalletAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "agentRegistryProgramId" TEXT,
  ADD COLUMN IF NOT EXISTS "identityLink" JSONB;

CREATE INDEX IF NOT EXISTS "ClawPegLaunch_identityMode_idx" ON "ClawPegLaunch"("identityMode");
CREATE INDEX IF NOT EXISTS "ClawPegLaunch_agentAssetAddress_idx" ON "ClawPegLaunch"("agentAssetAddress");
CREATE INDEX IF NOT EXISTS "ClawPegLaunch_agentIdentityPda_idx" ON "ClawPegLaunch"("agentIdentityPda");
