import { Buffer } from "buffer";
import { NextRequest, NextResponse } from "next/server";
import { Keypair, Transaction } from "@solana/web3.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseMintIntentAssetPayload } from "@/lib/metaplex-mint-intent";
import { getLaunchSolanaConnection } from "@/lib/synapse-sap";
import { METAPLEX_MINT_ENGINE } from "@/lib/metaplex-core-candy-machine";

export const dynamic = "force-dynamic";

const BroadcastMintSchema = z.object({
  intent_id: z.string().min(1),
  signed_transaction_base64: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();
    const validation = BroadcastMintSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address }, { address: address.toLowerCase() }],
      },
      select: {
        id: true,
        address: true,
        mintAddress: true,
        mintEngine: true,
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

    const mintIntent = await prisma.mintIntent.findFirst({
      where: {
        id: validation.data.intent_id,
        collectionId: collection.id,
      },
      select: {
        id: true,
        expiresAt: true,
        consumedAt: true,
        assetAddresses: true,
      },
    });

    if (!mintIntent) {
      return NextResponse.json(
        { success: false, error: "Mint intent not found" },
        { status: 404 }
      );
    }

    if (mintIntent.consumedAt) {
      return NextResponse.json(
        { success: false, error: "Mint intent was already consumed" },
        { status: 409 }
      );
    }

    if (mintIntent.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: "Mint intent expired. Prepare a fresh transaction and try again." },
        { status: 410 }
      );
    }

    const { assetSignerSecretKeysBase64 } = parseMintIntentAssetPayload(mintIntent.assetAddresses);
    const transaction = Transaction.from(
      Buffer.from(validation.data.signed_transaction_base64, "base64")
    );

    if (assetSignerSecretKeysBase64.length > 0) {
      const assetKeypairs = assetSignerSecretKeysBase64.map((value) =>
        Keypair.fromSecretKey(Buffer.from(value, "base64"))
      );
      transaction.partialSign(...assetKeypairs);
    }

    const connection = getLaunchSolanaConnection();
    const txHash = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });

    return NextResponse.json({
      success: true,
      tx_hash: txHash,
    });
  } catch (error) {
    console.error("Broadcast Solana mint error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to broadcast Solana mint transaction",
      },
      { status: 500 }
    );
  }
}
