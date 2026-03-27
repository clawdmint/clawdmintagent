ALTER TABLE "Agent"
ADD COLUMN "metaplexCollectionAddress" TEXT,
ADD COLUMN "metaplexCollectionUri" TEXT,
ADD COLUMN "metaplexAssetAddress" TEXT,
ADD COLUMN "metaplexAssetUri" TEXT,
ADD COLUMN "metaplexRegistrationUri" TEXT,
ADD COLUMN "metaplexIdentityPda" TEXT,
ADD COLUMN "metaplexExecutiveProfilePda" TEXT,
ADD COLUMN "metaplexExecutionDelegatePda" TEXT,
ADD COLUMN "metaplexRegisteredAt" TIMESTAMP(3),
ADD COLUMN "metaplexDelegatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Agent_metaplexAssetAddress_key" ON "Agent"("metaplexAssetAddress");
CREATE INDEX "Agent_metaplexAssetAddress_idx" ON "Agent"("metaplexAssetAddress");
CREATE INDEX "Agent_metaplexIdentityPda_idx" ON "Agent"("metaplexIdentityPda");
