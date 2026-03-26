import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { buildCollectionBagsView } from "@/lib/collection-bags";
import { isBagsIntegrationEnabled } from "@/lib/env";
import { isSolanaAddress } from "@/lib/network-config";
import { getSolanaConnection } from "@/lib/solana-collections";
import {
  fetchMetaplexCandyMachineState,
  MAX_METAPLEX_MINT_QUANTITY,
  METAPLEX_MINT_ENGINE,
  prepareMetaplexMintTransaction,
  MetaplexMintError,
} from "@/lib/metaplex-core-candy-machine";

export const dynamic = "force-dynamic";

const PREPARE_MINT_INTENT_TTL_MS = 15 * 60 * 1000;

const PrepareMintSchema = z.object({
  wallet_address: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_METAPLEX_MINT_QUANTITY).default(1),
});

function parseDecimal(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();
    const validation = PrepareMintSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { wallet_address: walletAddress, quantity } = validation.data;
    if (!isSolanaAddress(walletAddress)) {
      return NextResponse.json(
        { success: false, error: "wallet_address must be a Solana address" },
        { status: 400 }
      );
    }

    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address }, { address: address.toLowerCase() }],
      },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    if (collection.mintEngine !== METAPLEX_MINT_ENGINE || !collection.mintAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "This collection uses the legacy Solana runtime and cannot mint real NFTs.",
        },
        { status: 409 }
      );
    }

    const onchainState = await fetchMetaplexCandyMachineState(collection.mintAddress);
    if (!onchainState.isFullyLoaded) {
      return NextResponse.json(
        {
          success: false,
          error: "Candy Machine config is still loading for this collection. Retry deploy resume before minting.",
          details: {
            items_loaded: onchainState.itemsLoaded,
            items_available: onchainState.itemsAvailable,
          },
        },
        { status: 409 }
      );
    }

    if (onchainState.isSoldOut || quantity > onchainState.remaining) {
      return NextResponse.json(
        { success: false, error: "Requested quantity exceeds remaining supply" },
        { status: 409 }
      );
    }

    const bagsEnabled = isBagsIntegrationEnabled();
    if (!bagsEnabled && collection.bagsMintAccess === "bags_balance") {
      return NextResponse.json(
        { success: false, error: "Bags integration is temporarily disabled for this collection" },
        { status: 409 }
      );
    }

    const bags = buildCollectionBagsView(collection);
    if (bagsEnabled && bags?.mint_access === "bags_balance") {
      if (bags.status !== "LIVE" || !bags.token_address) {
        return NextResponse.json(
          { success: false, error: "Bags token gate is not live for this collection yet" },
          { status: 409 }
        );
      }

      const connection = getSolanaConnection();
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(walletAddress), {
        mint: new PublicKey(bags.token_address),
      });
      const balance = tokenAccounts.value.reduce((total, tokenAccount) => {
        const parsed = tokenAccount.account.data.parsed;
        const amount =
          parsed?.info?.tokenAmount?.uiAmountString ?? parsed?.info?.tokenAmount?.uiAmount ?? "0";
        return total + parseDecimal(String(amount));
      }, 0);
      const required = parseDecimal(bags.min_token_balance || "0");

      if (balance < required) {
        return NextResponse.json(
          {
            success: false,
            error: `Hold at least ${bags.min_token_balance} ${bags.token_symbol || "BAGS"} to mint`,
            balance: balance.toString(),
            required: bags.min_token_balance,
          },
          { status: 403 }
        );
      }
    }

    const prepared = await prepareMetaplexMintTransaction({
      walletAddress,
      collectionAddress: collection.address,
      candyMachineAddress: collection.mintAddress,
      payoutAddress: collection.payoutAddress,
      quantity,
      mintPriceLamports: BigInt(collection.mintPrice),
      bagsMintAccess: (bagsEnabled ? bags?.mint_access : "public") || "public",
      bagsTokenAddress: bagsEnabled ? bags?.token_address : undefined,
      bagsMinTokenBalance: bagsEnabled ? bags?.min_token_balance : undefined,
    });

    const intent = await prisma.mintIntent.create({
      data: {
        collectionId: collection.id,
        walletAddress,
        quantity,
        totalPaid: prepared.totalPaidLamports,
        assetAddresses: JSON.stringify(prepared.assetAddresses),
        expiresAt: new Date(Date.now() + PREPARE_MINT_INTENT_TTL_MS),
      },
    });

    return NextResponse.json({
      success: true,
      mint: {
        intent_id: intent.id,
        collection_address: collection.address,
        mint_address: collection.mintAddress,
        quantity,
        total_paid_lamports: prepared.totalPaidLamports,
        transaction_base64: prepared.serializedTransactionBase64,
        asset_addresses: prepared.assetAddresses,
        confirm_endpoint: `/api/collections/${collection.address}/mint/confirm`,
        expires_at: intent.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof MetaplexMintError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Prepare Solana mint error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to prepare Solana mint transaction" },
      { status: 500 }
    );
  }
}
