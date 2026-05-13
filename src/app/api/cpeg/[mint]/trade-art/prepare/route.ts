import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import {
  buildClawPegRecordTradeArtManifest,
  findClawPegCollectionAddress,
  findTradeArtRecordAddress,
} from "@/lib/clawpeg";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

const PrepareTradeArtSchema = z.object({
  payer: z.string().min(32),
  trader: z.string().min(32),
  trade_index: z.union([z.string(), z.number()]),
  amount_in: z.union([z.string(), z.number()]),
  amount_out: z.union([z.string(), z.number()]),
  input_mint: z.string().min(32).optional(),
  output_mint: z.string().min(32).optional(),
});

interface RouteContext {
  params: {
    mint: string;
  };
}

function parseU64(value: string | number, label: string) {
  const normalized = typeof value === "number" ? String(Math.trunc(value)) : value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be an unsigned integer`);
  }
  const parsed = BigInt(normalized);
  if (parsed < BigInt(0) || parsed > BigInt("18446744073709551615")) {
    throw new Error(`${label} must fit into u64`);
  }
  return parsed;
}

function assertPublicKey(value: string, label: string) {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address`);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const launch = await prisma.clawPegLaunch.findUnique({
      where: { tokenMint: params.mint },
      select: {
        tokenMint: true,
        collectionAddress: true,
        standardMode: true,
      },
    });
    if (!launch?.collectionAddress) {
      return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
    }
    if (launch.standardMode === "metaplex_hybrid") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Custom trade-art PDA preparation is disabled for Metaplex Hybrid cPEG. Hybrid art state comes from MPL-Hybrid/Core ownership.",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = PrepareTradeArtSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const payer = assertPublicKey(input.payer, "payer");
    const trader = assertPublicKey(input.trader, "trader");
    const inputMint = assertPublicKey(input.input_mint || WRAPPED_SOL_MINT, "input_mint");
    const outputMint = assertPublicKey(input.output_mint || launch.tokenMint, "output_mint");
    const tradeIndex = parseU64(input.trade_index, "trade_index");
    const amountIn = parseU64(input.amount_in, "amount_in");
    const amountOut = parseU64(input.amount_out, "amount_out");
    if (amountIn === BigInt(0) || amountOut === BigInt(0)) {
      throw new Error("amount_in and amount_out must be greater than zero");
    }

    const collectionAddress = findClawPegCollectionAddress(launch.tokenMint);
    if (collectionAddress.toBase58() !== launch.collectionAddress) {
      return NextResponse.json({ success: false, error: "collection PDA mismatch" }, { status: 409 });
    }

    const tradeArtAddress = findTradeArtRecordAddress(launch.collectionAddress, tradeIndex);
    const instruction = buildClawPegRecordTradeArtManifest({
      payer,
      trader,
      tokenMint: launch.tokenMint,
      inputMint,
      outputMint,
      tradeIndex,
      amountIn,
      amountOut,
    });

    return NextResponse.json({
      success: true,
      trade_art: {
        address: tradeArtAddress.toBase58(),
        trade_index: tradeIndex.toString(),
        image: `/api/cpeg/${launch.tokenMint}/trade-art/${tradeIndex.toString()}/svg`,
      },
      instructions: [instruction],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG trade art";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
