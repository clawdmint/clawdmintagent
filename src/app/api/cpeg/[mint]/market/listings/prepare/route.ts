import { NextRequest, NextResponse } from "next/server";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import {
  buildClawPegListPegEscrowManifest,
  describeCpegMarketListingStatus,
  findClawPegCollectionAddress,
  findMarketListingAddress,
  findOwnerPegAddress,
  findPegRecordAddress,
  parseCpegMarketListingAccount,
} from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CpegHybridEngineError,
  fetchHybridCoreAssetOwner,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
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
    const launch = await prisma.clawPegLaunch.findUnique({
      where: { tokenMint: params.mint },
      select: { id: true, tokenMint: true, collectionAddress: true, maxPegs: true, standardMode: true },
    });
    if (launch?.standardMode === CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      const parsed = PrepareSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
      }
      const input = parsed.data;
      const data = await loadHybridLaunchAndAgent(params.mint);
      if (!data?.launch.hybridCoreCollectionAddress) {
        return NextResponse.json({ success: false, error: "Hybrid cPEG vault is not configured" }, { status: 409 });
      }
      const asset = await prisma.clawPegHybridAsset.findFirst({
        where: {
          launchId: data.launch.id,
          pegId: input.peg_id,
          ownerAddress: input.seller,
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
        },
      });
      if (!asset) {
        return NextResponse.json({ success: false, error: "This Core cPEG is not owned by the seller wallet" }, { status: 403 });
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
    }
    if (!launch?.collectionAddress) {
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
    }

    const parsed = PrepareSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const input = parsed.data;
    if (input.peg_id >= launch.maxPegs) {
      return NextResponse.json({ success: false, error: "Invalid PEG id" }, { status: 400 });
    }
    const priceLamports = BigInt(input.price_lamports);
    if (priceLamports <= BigInt(0)) {
      return NextResponse.json({ success: false, error: "Price must be greater than zero" }, { status: 400 });
    }

    const seller = new PublicKey(input.seller);
    const mint = new PublicKey(launch.tokenMint);
    const collectionAddress = findClawPegCollectionAddress(launch.tokenMint);
    const listingAddress = findMarketListingAddress(collectionAddress.toBase58(), input.peg_id);
    const escrowOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), listingAddress.toBase58());
    const pegRecord = findPegRecordAddress(collectionAddress.toBase58(), input.peg_id);
    const sellerTokenAccount = getAssociatedTokenAddressSync(mint, seller, false, TOKEN_2022_PROGRAM_ID);
    const escrowTokenAccount = getAssociatedTokenAddressSync(mint, listingAddress, true, TOKEN_2022_PROGRAM_ID);

    // On-chain preflight: a stale listing PDA at the same seeds blocks `list()` because
    // create_pda_account fails when the account already has data. This used to silently
    // produce DB rows in ACTIVE state with on-chain in FILLED state, leading to buys that
    // failed during simulation. We now read the PDA up-front and reject with a precise
    // message so the seller knows whether the peg is already listed, was previously sold,
    // or is in some other state.
    const connection = new Connection(getClawPegRpcUrl(), { commitment: "confirmed" });
    const listingInfo = await connection.getAccountInfo(listingAddress, "confirmed");
    if (listingInfo && listingInfo.data.length > 0) {
      const existing = parseCpegMarketListingAccount(Buffer.from(listingInfo.data));
      // After the cpeg-market upgrade, fill/cancel close the PDA so this branch only
      // hits genuinely active or pre-upgrade-stuck listings. We surface a 409 either way.
      if (existing.isInitialized) {
        return NextResponse.json(
          {
            success: false,
            error: `cPEG #${input.peg_id} already has an on-chain listing (${describeCpegMarketListingStatus(
              existing.status
            )}). Cancel or wait for it to clear before re-listing.`,
            existing: {
              seller: existing.seller,
              status: describeCpegMarketListingStatus(existing.status),
              price_lamports: existing.priceLamports.toString(),
            },
          },
          { status: 409 }
        );
      }
    }

    const manifest = buildClawPegListPegEscrowManifest({
      seller: seller.toBase58(),
      tokenMint: launch.tokenMint,
      sellerTokenAccount: sellerTokenAccount.toBase58(),
      escrowTokenAccount: escrowTokenAccount.toBase58(),
      pegId: input.peg_id,
      priceLamports,
    });

    return NextResponse.json({
      success: true,
      listing: {
        token_mint: launch.tokenMint,
        collection_address: collectionAddress.toBase58(),
        listing_address: listingAddress.toBase58(),
        escrow_owner_peg_address: escrowOwnerPeg.toBase58(),
        escrow_token_account: escrowTokenAccount.toBase58(),
        seller_token_account: sellerTokenAccount.toBase58(),
        peg_record_address: pegRecord.toBase58(),
        seller: seller.toBase58(),
        peg_id: input.peg_id,
        price_lamports: priceLamports.toString(),
      },
      instructions: [manifest],
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG listing";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
