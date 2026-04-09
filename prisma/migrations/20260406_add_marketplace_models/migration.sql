-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mintId" TEXT,
    "assetAddress" TEXT NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "metadataUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mintedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "priceLamports" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "signature" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "listingId" TEXT,
    "buyerAddress" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "priceLamports" TEXT NOT NULL,
    "marketplaceFeeLamports" TEXT,
    "royaltyLamports" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetAddress_key" ON "Asset"("assetAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_collectionId_tokenId_key" ON "Asset"("collectionId", "tokenId");

-- CreateIndex
CREATE INDEX "Asset_collectionId_ownerAddress_idx" ON "Asset"("collectionId", "ownerAddress");

-- CreateIndex
CREATE INDEX "Asset_ownerAddress_idx" ON "Asset"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_nonce_key" ON "Listing"("nonce");

-- CreateIndex
CREATE INDEX "Listing_collectionId_status_createdAt_idx" ON "Listing"("collectionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_assetId_status_idx" ON "Listing"("assetId", "status");

-- CreateIndex
CREATE INDEX "Listing_sellerAddress_status_idx" ON "Listing"("sellerAddress", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_txHash_key" ON "Sale"("txHash");

-- CreateIndex
CREATE INDEX "Sale_collectionId_soldAt_idx" ON "Sale"("collectionId", "soldAt");

-- CreateIndex
CREATE INDEX "Sale_assetId_soldAt_idx" ON "Sale"("assetId", "soldAt");

-- CreateIndex
CREATE INDEX "Sale_buyerAddress_idx" ON "Sale"("buyerAddress");

-- CreateIndex
CREATE INDEX "Sale_sellerAddress_idx" ON "Sale"("sellerAddress");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_mintId_fkey" FOREIGN KEY ("mintId") REFERENCES "Mint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
