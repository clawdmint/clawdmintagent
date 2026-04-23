import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseMintIntentAssetPayload } from "@/lib/metaplex-mint-intent";
import { getLaunchSolanaConnection } from "@/lib/synapse-sap";
import { syncMintAssets } from "@/lib/marketplace-assets";
import {
  fetchMetaplexCandyMachineState,
  METAPLEX_MINT_ENGINE,
} from "@/lib/metaplex-core-candy-machine";

export const dynamic = "force-dynamic";

const ConfirmMintSchema = z.object({
  intent_id: z.string().min(1),
  wallet_address: z.string().min(1),
  tx_hash: z.string().min(1),
});

function getParsedTransactionSignerKeys(
  transaction: Awaited<ReturnType<ReturnType<typeof getLaunchSolanaConnection>["getParsedTransaction"]>>
): string[] {
  if (!transaction) {
    return [];
  }

  return transaction.transaction.message.accountKeys
    .filter((account) => account.signer)
    .map((account) => account.pubkey.toBase58());
}

function getParsedTransactionAccountKeys(
  transaction: Awaited<ReturnType<ReturnType<typeof getLaunchSolanaConnection>["getParsedTransaction"]>>
): string[] {
  if (!transaction) {
    return [];
  }

  return transaction.transaction.message.accountKeys.map((account) => account.pubkey.toBase58());
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();
    const validation = ConfirmMintSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { intent_id: intentId, wallet_address: walletAddress, tx_hash: txHash } = validation.data;
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
        { success: false, error: "This collection is not using the Metaplex mint flow" },
        { status: 409 }
      );
    }

    const existingMint = await prisma.mint.findUnique({
      where: { txHash },
    });
    if (existingMint) {
      return NextResponse.json({
        success: true,
        message: "Mint already recorded",
        mint: {
          id: existingMint.id,
          quantity: existingMint.quantity,
          tx_hash: existingMint.txHash,
        },
      });
    }

    const intent = await prisma.mintIntent.findFirst({
      where: {
        id: intentId,
        collectionId: collection.id,
        walletAddress,
      },
    });

    if (!intent) {
      return NextResponse.json(
        { success: false, error: "Mint intent not found" },
        { status: 404 }
      );
    }

    if (intent.consumedAt) {
      return NextResponse.json(
        { success: false, error: "Mint intent was already consumed" },
        { status: 409 }
      );
    }

    if (intent.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: "Mint intent expired. Prepare a fresh transaction and try again." },
        { status: 410 }
      );
    }

    const { assetAddresses: expectedAssetAddresses } = parseMintIntentAssetPayload(
      intent.assetAddresses
    );
    const connection = getLaunchSolanaConnection();
    const signatureStatus = await connection.getSignatureStatus(txHash, {
      searchTransactionHistory: true,
    });

    if (!signatureStatus.value || signatureStatus.value.err || !signatureStatus.value.confirmationStatus) {
      return NextResponse.json(
        { success: false, error: "Mint transaction is not confirmed yet" },
        { status: 409 }
      );
    }

    const parsedTransaction = await connection.getParsedTransaction(txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!parsedTransaction || parsedTransaction.meta?.err) {
      return NextResponse.json(
        { success: false, error: "Mint transaction could not be parsed" },
        { status: 400 }
      );
    }

    const signerKeys = getParsedTransactionSignerKeys(parsedTransaction);
    if (!signerKeys.includes(walletAddress)) {
      return NextResponse.json(
        { success: false, error: "Mint transaction was not signed by the connected wallet" },
        { status: 400 }
      );
    }

    const accountKeys = new Set(getParsedTransactionAccountKeys(parsedTransaction));
    if (!accountKeys.has(collection.mintAddress) || !accountKeys.has(collection.address)) {
      return NextResponse.json(
        { success: false, error: "Mint transaction does not target the expected Candy Machine" },
        { status: 400 }
      );
    }

    const missingAssets = expectedAssetAddresses.filter((assetAddress) => !accountKeys.has(assetAddress));
    if (missingAssets.length > 0) {
      return NextResponse.json(
        { success: false, error: "Mint transaction is missing expected asset accounts", details: missingAssets },
        { status: 400 }
      );
    }

    const onchainState = await fetchMetaplexCandyMachineState(collection.mintAddress);
    const endTokenId = onchainState.itemsRedeemed;
    const startTokenId = Math.max(1, endTokenId - intent.quantity + 1);

    const mint = await prisma.mint.create({
      data: {
        collectionId: collection.id,
        minterAddress: walletAddress,
        quantity: intent.quantity,
        totalPaid: intent.totalPaid,
        txHash,
        startTokenId,
        endTokenId,
        assetAddresses: JSON.stringify(expectedAssetAddresses),
        mintedAt: new Date(),
      },
    });

    await syncMintAssets(mint.id);

    await prisma.mintIntent.update({
      where: { id: intent.id },
      data: {
        consumedAt: new Date(),
        txHash,
      },
    });

    await prisma.collection.update({
      where: { id: collection.id },
      data: {
        totalMinted: onchainState.itemsRedeemed,
        status: onchainState.isSoldOut ? "SOLD_OUT" : "ACTIVE",
      },
    });

    return NextResponse.json({
      success: true,
      mint: {
        id: mint.id,
        quantity: mint.quantity,
        tx_hash: mint.txHash,
        asset_addresses: expectedAssetAddresses,
      },
      collection: {
        total_minted: onchainState.itemsRedeemed,
        remaining: onchainState.remaining,
        is_sold_out: onchainState.isSoldOut,
      },
    });
  } catch (error) {
    console.error("Confirm Solana mint error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to confirm Solana mint" },
      { status: 500 }
    );
  }
}
