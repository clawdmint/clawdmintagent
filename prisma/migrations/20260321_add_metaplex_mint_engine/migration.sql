ALTER TABLE "Collection"
ADD COLUMN "mintEngine" TEXT NOT NULL DEFAULT 'legacy_solana_program',
ADD COLUMN "mintAddress" TEXT;

ALTER TABLE "Mint"
ADD COLUMN "assetAddresses" TEXT;

CREATE TABLE "MintIntent" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "totalPaid" TEXT NOT NULL,
  "assetAddresses" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "txHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MintIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Collection_mintEngine_idx" ON "Collection"("mintEngine");
CREATE INDEX "Collection_mintAddress_idx" ON "Collection"("mintAddress");
CREATE INDEX "MintIntent_collectionId_idx" ON "MintIntent"("collectionId");
CREATE INDEX "MintIntent_walletAddress_idx" ON "MintIntent"("walletAddress");
CREATE INDEX "MintIntent_expiresAt_idx" ON "MintIntent"("expiresAt");
CREATE INDEX "MintIntent_txHash_idx" ON "MintIntent"("txHash");

ALTER TABLE "MintIntent"
ADD CONSTRAINT "MintIntent_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "Collection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
