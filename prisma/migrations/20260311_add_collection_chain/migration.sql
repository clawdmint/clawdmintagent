ALTER TABLE "Collection"
ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'base';

CREATE INDEX "Collection_chain_idx" ON "Collection"("chain");
