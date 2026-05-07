ALTER TABLE "ClawPegLaunch"
  ADD COLUMN IF NOT EXISTS "hybridSetupTxHash" TEXT,
  ADD COLUMN IF NOT EXISTS "hybridConfiguredAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ClawPegHybridAsset" (
  "id" TEXT NOT NULL,
  "launchId" TEXT NOT NULL,
  "tokenMint" TEXT NOT NULL,
  "collectionAddress" TEXT NOT NULL,
  "assetAddress" TEXT NOT NULL,
  "pegId" INTEGER NOT NULL,
  "ownerAddress" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OWNED',
  "captureTxHash" TEXT,
  "releaseTxHash" TEXT,
  "capturedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClawPegHybridAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClawPegHybridAsset_assetAddress_key"
  ON "ClawPegHybridAsset"("assetAddress");

CREATE UNIQUE INDEX IF NOT EXISTS "ClawPegHybridAsset_launchId_pegId_key"
  ON "ClawPegHybridAsset"("launchId", "pegId");

CREATE INDEX IF NOT EXISTS "ClawPegHybridAsset_launchId_status_idx"
  ON "ClawPegHybridAsset"("launchId", "status");

CREATE INDEX IF NOT EXISTS "ClawPegHybridAsset_ownerAddress_idx"
  ON "ClawPegHybridAsset"("ownerAddress");

CREATE INDEX IF NOT EXISTS "ClawPegHybridAsset_tokenMint_idx"
  ON "ClawPegHybridAsset"("tokenMint");

DO $$ BEGIN
  ALTER TABLE "ClawPegHybridAsset"
    ADD CONSTRAINT "ClawPegHybridAsset_launchId_fkey"
    FOREIGN KEY ("launchId") REFERENCES "ClawPegLaunch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  -- already exists, ignore
  NULL;
END $$;
