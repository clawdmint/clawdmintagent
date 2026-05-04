CREATE TABLE "ClawPegMarketListing" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "listingAddress" TEXT NOT NULL,
    "escrowOwnerPegAddress" TEXT NOT NULL,
    "escrowTokenAccount" TEXT NOT NULL,
    "pegRecordAddress" TEXT NOT NULL,
    "pegId" INTEGER NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "priceLamports" TEXT NOT NULL,
    "marketplaceFeeBps" INTEGER NOT NULL DEFAULT 0,
    "royaltyBps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "listTxHash" TEXT,
    "buyTxHash" TEXT,
    "cancelTxHash" TEXT,
    "buyerAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ClawPegMarketListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClawPegMarketListing_listingAddress_key" ON "ClawPegMarketListing"("listingAddress");
CREATE UNIQUE INDEX "ClawPegMarketListing_listTxHash_key" ON "ClawPegMarketListing"("listTxHash");
CREATE UNIQUE INDEX "ClawPegMarketListing_buyTxHash_key" ON "ClawPegMarketListing"("buyTxHash");
CREATE UNIQUE INDEX "ClawPegMarketListing_cancelTxHash_key" ON "ClawPegMarketListing"("cancelTxHash");
CREATE UNIQUE INDEX "ClawPegMarketListing_tokenMint_pegId_key" ON "ClawPegMarketListing"("tokenMint", "pegId");
CREATE INDEX "ClawPegMarketListing_launchId_status_createdAt_idx" ON "ClawPegMarketListing"("launchId", "status", "createdAt");
CREATE INDEX "ClawPegMarketListing_sellerAddress_status_idx" ON "ClawPegMarketListing"("sellerAddress", "status");
CREATE INDEX "ClawPegMarketListing_buyerAddress_idx" ON "ClawPegMarketListing"("buyerAddress");

ALTER TABLE "ClawPegMarketListing" ADD CONSTRAINT "ClawPegMarketListing_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "ClawPegLaunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
