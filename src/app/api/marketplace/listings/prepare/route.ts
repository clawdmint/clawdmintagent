import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshAssetOwner, syncMintAssets } from "@/lib/marketplace-assets";
import { buildMarketplaceListingDelegateTransaction } from "@/lib/marketplace-transactions";

export const dynamic = "force-dynamic";

const PrepareListingSchema = z.object({
  asset_address: z.string().min(1),
  wallet_address: z.string().min(1),
  price_native: z.string().min(1),
});

function parseSolToLamports(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(normalized)) {
    throw new Error("Price must be a valid SOL value");
  }

  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}${fraction.padEnd(9, "0")}`.replace(/^0+(?=\d)/, "") || "0";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = PrepareListingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { asset_address: assetAddress, wallet_address: walletAddress, price_native: priceNative } =
      validation.data;
    const priceLamports = parseSolToLamports(priceNative);

    if (BigInt(priceLamports) <= BigInt(0)) {
      return NextResponse.json(
        { success: false, error: "Listing price must be greater than zero" },
        { status: 400 }
      );
    }

    let asset = await prisma.asset.findUnique({
      where: { assetAddress },
      include: {
        collection: {
          select: {
            address: true,
            name: true,
            symbol: true,
          },
        },
      },
    });

    if (!asset) {
      const mint = await prisma.mint.findFirst({
        where: {
          assetAddresses: {
            contains: assetAddress,
          },
        },
        select: { id: true },
      });

      if (mint) {
        await syncMintAssets(mint.id);
        asset = await prisma.asset.findUnique({
          where: { assetAddress },
          include: {
            collection: {
              select: {
                address: true,
                name: true,
                symbol: true,
              },
            },
          },
        });
      }
    }

    if (!asset) {
      return NextResponse.json(
        { success: false, error: "Asset not found in marketplace inventory" },
        { status: 404 }
      );
    }

    const refreshedAsset = await refreshAssetOwner(assetAddress);
    const ownerAddress = refreshedAsset?.ownerAddress || asset.ownerAddress;
    if (ownerAddress !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Only the current owner can list this asset" },
        { status: 403 }
      );
    }

    const prepared = await buildMarketplaceListingDelegateTransaction({
      walletAddress,
      assetAddress,
      collectionAddress: asset.collection.address,
    });

    return NextResponse.json({
      success: true,
      listing: {
        asset_address: asset.assetAddress,
        token_id: asset.tokenId,
        collection_address: asset.collection.address,
        collection_name: asset.collection.name,
        collection_symbol: asset.collection.symbol,
        price_lamports: priceLamports,
        price_native: priceNative,
        wallet_address: walletAddress,
        expires_at: prepared.expiresAt.toISOString(),
        delegate_address: prepared.delegateAddress,
        serialized_transaction_base64: prepared.serializedTransactionBase64,
      },
    });
  } catch (error) {
    console.error("Prepare marketplace listing error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to prepare listing" },
      { status: 500 }
    );
  }
}
