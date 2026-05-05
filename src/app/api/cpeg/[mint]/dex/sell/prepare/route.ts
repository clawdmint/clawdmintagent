import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseClawPegRecordAccount, findPegRecordAddress } from "@/lib/clawpeg";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";
import { POST as prepareMarketListing } from "../../../market/listings/prepare/route";

export const dynamic = "force-dynamic";

const JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";

const PrepareSchema = z.object({
  seller: z.string().min(32),
  peg_id: z.number().int().min(0),
  slippage_bps: z.number().int().min(10).max(3000).optional().default(150),
  token_units: z.number().int().min(1).max(1).optional().default(1),
});

interface RouteContext {
  params: { mint: string };
}

function jsonRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function fallbackListingLamports(pegUnitRaw: string) {
  const floor = BigInt(100_000_000); // 0.1 SOL base fallback
  if (BigInt(pegUnitRaw) >= BigInt(1_000_000_000)) return floor;
  return BigInt(25_000_000); // 0.025 SOL for tiny peg units
}

async function fetchMainnetSellQuoteLamports(inputMint: string, inputAmountRaw: bigint, slippageBps: number) {
  const quoteUrl = new URL(JUPITER_QUOTE);
  quoteUrl.searchParams.set("inputMint", inputMint);
  quoteUrl.searchParams.set("outputMint", WRAPPED_SOL);
  quoteUrl.searchParams.set("amount", inputAmountRaw.toString());
  quoteUrl.searchParams.set("swapMode", "ExactIn");
  quoteUrl.searchParams.set("onlyDirectRoutes", "false");
  quoteUrl.searchParams.set("restrictIntermediateTokens", "true");
  quoteUrl.searchParams.set("maxAccounts", "64");
  quoteUrl.searchParams.set("slippageBps", String(slippageBps));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(quoteUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { outAmount?: string };
    if (!payload.outAmount || !/^\d+$/.test(payload.outAmount)) return null;
    return BigInt(payload.outAmount);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = PrepareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: context.params.mint },
    select: {
      tokenMint: true,
      cluster: true,
      collectionAddress: true,
      pegUnitRaw: true,
      maxPegs: true,
    },
  });
  if (!launch?.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }
  if (parsed.data.peg_id >= launch.maxPegs) {
    return NextResponse.json({ success: false, error: "Invalid PEG id" }, { status: 400 });
  }

  let sellerPk: InstanceType<typeof PublicKey>;
  try {
    sellerPk = new PublicKey(parsed.data.seller);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid seller address" }, { status: 400 });
  }

  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const pegRecordAddress = findPegRecordAddress(launch.collectionAddress, parsed.data.peg_id);
  const pegRecordInfo = await connection.getAccountInfo(pegRecordAddress, "confirmed");
  if (!pegRecordInfo || pegRecordInfo.data.length < 126) {
    return NextResponse.json(
      { success: false, error: `PEG #${parsed.data.peg_id} is not minted yet, so it cannot be sold.` },
      { status: 409 }
    );
  }
  const pegRecord = parseClawPegRecordAccount(Buffer.from(pegRecordInfo.data));
  if (pegRecord.owner !== sellerPk.toBase58()) {
    return NextResponse.json(
      { success: false, error: `PEG #${parsed.data.peg_id} belongs to another wallet.` },
      { status: 403 }
    );
  }

  const quoteInputRaw = BigInt(launch.pegUnitRaw) * BigInt(parsed.data.token_units);
  const quoteOutLamports =
    launch.cluster === "mainnet-beta" || launch.cluster === "mainnet"
      ? await fetchMainnetSellQuoteLamports(launch.tokenMint, quoteInputRaw, parsed.data.slippage_bps)
      : null;
  const protectedLamports =
    quoteOutLamports && quoteOutLamports > BigInt(0)
      ? (quoteOutLamports * BigInt(10_000 - parsed.data.slippage_bps)) / BigInt(10_000)
      : fallbackListingLamports(launch.pegUnitRaw);
  const listingLamports = protectedLamports > BigInt(0) ? protectedLamports : fallbackListingLamports(launch.pegUnitRaw);

  const listingResponse = await prepareMarketListing(
    jsonRequest({
      seller: sellerPk.toBase58(),
      peg_id: parsed.data.peg_id,
      price_lamports: listingLamports.toString(),
    }),
    context
  );
  const listingPayload = await listingResponse.json();
  if (!listingResponse.ok || !listingPayload?.success) {
    return NextResponse.json(
      {
        success: false,
        error: listingPayload?.error || "Failed to prepare identity-backed sell listing.",
      },
      { status: listingResponse.status || 500 }
    );
  }

  return NextResponse.json({
    success: true,
    mode: "identity_backed_sell",
    route: {
      type: "market_escrow",
      note: "Selected identity is moved into escrow first. Fill happens through the cPEG market path.",
    },
    quote: {
      token_units: parsed.data.token_units,
      token_amount_raw: quoteInputRaw.toString(),
      estimated_sol_lamports: quoteOutLamports?.toString() || null,
      listing_price_lamports: listingLamports.toString(),
      listing_price_sol: (Number(listingLamports) / 1_000_000_000).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      }),
    },
    listing: listingPayload.listing,
    instructions: listingPayload.instructions,
    confirm_endpoint: `/api/cpeg/${launch.tokenMint}/market/listings/confirm`,
  });
}

