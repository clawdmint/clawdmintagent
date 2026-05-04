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
      select: { tokenMint: true, collectionAddress: true, maxPegs: true },
    });
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
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG listing";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
