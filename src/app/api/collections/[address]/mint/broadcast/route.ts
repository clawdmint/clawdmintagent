import { Buffer } from "buffer";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSolanaConnection } from "@/lib/solana-collections";
import { METAPLEX_MINT_ENGINE } from "@/lib/metaplex-core-candy-machine";

export const dynamic = "force-dynamic";

const BroadcastMintSchema = z.object({
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

    const connection = getSolanaConnection();
    const txHash = await connection.sendRawTransaction(
      Buffer.from(validation.data.signed_transaction_base64, "base64"),
      {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      }
    );

    return NextResponse.json({
      success: true,
      tx_hash: txHash,
    });
  } catch (error) {
    console.error("Broadcast Solana mint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to broadcast Solana mint transaction",
      },
      { status: 500 }
    );
  }
}
