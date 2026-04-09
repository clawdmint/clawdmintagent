import { prisma } from "../src/lib/db";
import { repairCollectionAssets } from "../src/lib/marketplace-assets";

async function main() {
  const collectionAddress = process.argv[2];

  if (!collectionAddress) {
    throw new Error("Usage: npx ts-node scripts/repair-marketplace-assets.ts <collection-address>");
  }

  const collection = await prisma.collection.findFirst({
    where: {
      OR: [{ address: collectionAddress }, { address: collectionAddress.toLowerCase() }],
    },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });

  if (!collection) {
    throw new Error(`Collection not found: ${collectionAddress}`);
  }

  const assetCount = await repairCollectionAssets(collection.id);
  const ownerCount = await prisma.asset.count({
    where: {
      collectionId: collection.id,
      ownerAddress: {
        not: "",
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        collection: {
          name: collection.name,
          address: collection.address,
        },
        asset_count: assetCount,
        non_empty_owner_rows: ownerCount,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
