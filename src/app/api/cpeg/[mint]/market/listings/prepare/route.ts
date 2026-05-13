import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CpegHybridEngineError,
  fetchHybridCoreAssetOwner,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { prisma } from "@/lib/db";
import { buildMarketplaceListingDelegateTransaction } from "@/lib/marketplace-transactions";
import { getCpegListFeeLamports, getCpegProtocolFeeRecipient } from "@/lib/platform-fees";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  seller: z.string().min(32),
  peg_id: z.number().int().min(0),
  price_lamports: z.string().regex(/^\d+$/),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const parsed = PrepareSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const launch = await prisma.clawPegLaunch.findUnique({
      where: { tokenMint: params.mint },
      select: { id: true, tokenMint: true, standardMode: true },
    });
    if (!launch) {
      return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
    }
    if (launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      return NextResponse.json(
        { success: false, error: "Legacy custom cPEG listings are disabled. This market only supports Metaplex Hybrid cPEGs." },
        { status: 410 }
      );
    }

    const input = parsed.data;
    const data = await loadHybridLaunchAndAgent(params.mint);
    if (!data?.launch.hybridCoreCollectionAddress) {
      return NextResponse.json({ success: false, error: "Hybrid cPEG launch is not configured" }, { status: 409 });
    }

    const asset = await prisma.clawPegHybridAsset.findFirst({
      where: {
        launchId: data.launch.id,
        pegId: input.peg_id,
        ownerAddress: input.seller,
        status: { in: [CPEG_HYBRID_ASSET_STATUS_OWNED, "LISTED"] },
      },
    });
    if (!asset) {
      return NextResponse.json({ success: false, error: "This Core cPEG is not owned by the seller wallet" }, { status: 403 });
    }
    if (asset.status !== CPEG_HYBRID_ASSET_STATUS_OWNED) {
      const activeListing = await prisma.clawPegMarketListing.findFirst({
        where: { launchId: data.launch.id, pegId: input.peg_id, status: "ACTIVE" },
        select: { id: true },
      });
      if (activeListing) {
        return NextResponse.json(
          { success: false, error: "This cPEG already has an active listing. Cancel it before re-listing." },
          { status: 409 }
        );
      }
      await prisma.clawPegHybridAsset
        .update({
          where: { assetAddress: asset.assetAddress },
          data: { status: CPEG_HYBRID_ASSET_STATUS_OWNED },
        })
        .catch(() => null);
    }

    const onChainOwner = await fetchHybridCoreAssetOwner(asset.assetAddress);
    if (onChainOwner !== input.seller) {
      await prisma.clawPegHybridAsset
        .update({
          where: { assetAddress: asset.assetAddress },
          data: { ownerAddress: onChainOwner },
        })
        .catch(() => null);
      return NextResponse.json(
        {
          success: false,
          error: "This Core cPEG is no longer owned by the seller wallet. Refresh your profile and market page.",
          details: { on_chain_owner: onChainOwner },
        },
        { status: 409 }
      );
    }

    const priceLamports = BigInt(input.price_lamports);
    if (priceLamports <= BigInt(0)) {
      return NextResponse.json({ success: false, error: "Price must be greater than zero" }, { status: 400 });
    }

    const platformFeeRecipient = getCpegProtocolFeeRecipient();
    const platformFeeLamports = platformFeeRecipient ? getCpegListFeeLamports() : BigInt(0);
    const prepared = await buildMarketplaceListingDelegateTransaction({
      walletAddress: input.seller,
      assetAddress: asset.assetAddress,
      collectionAddress: data.launch.hybridCoreCollectionAddress,
      platformFee:
        platformFeeRecipient && platformFeeLamports > BigInt(0)
          ? { recipient: platformFeeRecipient, lamports: platformFeeLamports }
          : null,
    });

    return NextResponse.json({
      success: true,
      listing: {
        kind: "hybrid_core",
        token_mint: data.launch.tokenMint,
        collection_address: data.launch.hybridCoreCollectionAddress,
        listing_address: asset.assetAddress,
        escrow_owner_peg_address: asset.assetAddress,
        escrow_token_account: asset.assetAddress,
        peg_record_address: asset.assetAddress,
        seller: input.seller,
        peg_id: input.peg_id,
        price_lamports: priceLamports.toString(),
        serialized_transaction_base64: prepared.serializedTransactionBase64,
        delegate_address: prepared.delegateAddress,
        expires_at: prepared.expiresAt.toISOString(),
        platform_fee_lamports: prepared.platformFeeLamports,
        platform_fee_recipient: prepared.platformFeeRecipient,
      },
      instructions: [],
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG listing";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
