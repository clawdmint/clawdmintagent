import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildClawPegRecordTradeArtManifest, findClawPegCollectionAddress } from "@/lib/clawpeg";
import { allocateDexAggregatorTradeIndex } from "@/lib/cpeg-dex-trade-index";
import { transactionInstructionFromManifest } from "@/lib/cpeg-manifest";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP = "https://lite-api.jup.ag/swap/v1/swap";
const REQUEST_MS = 12000;

const PrepareSchema = z.object({
  buyer: z.string().min(32),
  sol_amount: z.number().positive().max(2500),
  slippage_bps: z.number().int().min(10).max(2000).optional().default(100),
});

interface RouteContext {
  params: { mint: string };
}

/**
 * Compose a Jupiter aggregator swap with a trailing `clawpeg::record_trade_art` instruction.
 *
 * cPEG attaches art emission to routed swaps by keeping the Jupiter route
 * intact (including dynamic compute budgets + ALTs) and appending `record_trade_art` as the last
 * instruction inside the versioned bundle. Buyers still rent the TradeArtRecord PDA.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const parsed = PrepareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      tokenMint: true,
      collectionAddress: true,
      cluster: true,
      status: true,
    },
  });
  if (!launch?.collectionAddress) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const isMainnet = launch.cluster === "mainnet-beta" || launch.cluster === "mainnet";
  if (!isMainnet) {
    return NextResponse.json(
      {
        success: false,
        error: "Jupiter routes are unavailable on devnet clusters. Use floor sweep or devnet escrow market.",
      },
      { status: 400 }
    );
  }

  let buyerPk: InstanceType<typeof PublicKey>;
  try {
    buyerPk = new PublicKey(parsed.data.buyer);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid buyer pubkey" }, { status: 400 });
  }

  const lamports = BigInt(Math.floor(parsed.data.sol_amount * 1_000_000_000));
  if (lamports <= BigInt(0)) {
    return NextResponse.json({ success: false, error: "Amount too small" }, { status: 400 });
  }

  let quotePayload: Record<string, unknown>;
  try {
    const quoteUrl = new URL(JUPITER_QUOTE);
    quoteUrl.searchParams.set("inputMint", WRAPPED_SOL);
    quoteUrl.searchParams.set("outputMint", params.mint);
    quoteUrl.searchParams.set("amount", lamports.toString());
    quoteUrl.searchParams.set("swapMode", "ExactIn");
    quoteUrl.searchParams.set("onlyDirectRoutes", "false");
    quoteUrl.searchParams.set("restrictIntermediateTokens", "true");
    quoteUrl.searchParams.set("maxAccounts", "64");
    quoteUrl.searchParams.set("slippageBps", String(parsed.data.slippage_bps));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_MS);
    const quoteRes = await fetch(quoteUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!quoteRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Jupiter quote failed (liquidity/route missing). Seed a Splash pool.",
          detail: quoteRes.status,
        },
        { status: 422 }
      );
    }
    quotePayload = (await quoteRes.json()) as Record<string, unknown>;
    if (typeof quotePayload["error"] === "string") {
      return NextResponse.json({ success: false, error: quotePayload["error"] as string }, { status: 422 });
    }
    if (
      quotePayload["inAmount"] === undefined ||
      quotePayload["outAmount"] === undefined ||
      quotePayload["routePlan"] === undefined
    ) {
      return NextResponse.json({ success: false, error: "Malformed Jupiter quote" }, { status: 422 });
    }
  } catch (cause) {
    return NextResponse.json(
      {
        success: false,
        error: cause instanceof Error ? cause.message : "Jupiter quote request failed",
      },
      { status: 504 }
    );
  }

  let swapPayload: Record<string, unknown>;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_MS);
    const swapRes = await fetch(JUPITER_SWAP, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quotePayload,
        userPublicKey: buyerPk.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!swapRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to assemble Jupiter swap transaction",
          detail: swapRes.status,
        },
        { status: 422 }
      );
    }
    swapPayload = (await swapRes.json()) as Record<string, unknown>;
    if (typeof swapPayload["simulationError"] === "object" && swapPayload["simulationError"] !== null) {
      return NextResponse.json(
        { success: false, error: "Jupiter simulated the swap unsuccessfully.", detail: swapPayload["simulationError"] },
        { status: 422 }
      );
    }
  } catch (cause) {
    return NextResponse.json(
      {
        success: false,
        error: cause instanceof Error ? cause.message : "Jupiter swap request failed",
      },
      { status: 504 }
    );
  }

  const swapTxB64 = swapPayload["swapTransaction"];
  if (typeof swapTxB64 !== "string" || !swapTxB64.length) {
    return NextResponse.json({ success: false, error: "Missing swapTransaction" }, { status: 422 });
  }

  let vtx: InstanceType<typeof VersionedTransaction>;
  try {
    vtx = VersionedTransaction.deserialize(Buffer.from(swapTxB64, "base64"));
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Unsupported Jupiter transaction format (expected a versioned transaction).",
      },
      { status: 422 }
    );
  }

  const connection = new Connection(getClawPegRpcUrl(), { commitment: "confirmed" });
  const lookupTables = await Promise.all(
    vtx.message.addressTableLookups.map((lut: { accountKey: InstanceType<typeof PublicKey> }) =>
      connection.getAddressLookupTable(lut.accountKey)
    )
  );
  const addressLookupAccounts = lookupTables.flatMap((res) => (res.value ? [res.value] : []));
  if (addressLookupAccounts.length !== vtx.message.addressTableLookups.length) {
    return NextResponse.json({ success: false, error: "Could not hydrate Jupiter ALTs via RPC." }, { status: 502 });
  }

  const tradeIndex = allocateDexAggregatorTradeIndex();
  const amountInBig = BigInt(String(quotePayload["inAmount"]));
  const amountOutBig = BigInt(String(quotePayload["outAmount"]));
  if (amountOutBig <= BigInt(0) || amountInBig <= BigInt(0)) {
    return NextResponse.json({ success: false, error: "Invalid quote amounts." }, { status: 422 });
  }

  const collectionDerived = findClawPegCollectionAddress(launch.tokenMint);
  if (collectionDerived.toBase58() !== launch.collectionAddress) {
    return NextResponse.json({ success: false, error: "Collection PDA drift" }, { status: 409 });
  }

  const recordIx = transactionInstructionFromManifest(
    buildClawPegRecordTradeArtManifest({
      payer: buyerPk.toBase58(),
      trader: buyerPk.toBase58(),
      tokenMint: launch.tokenMint,
      inputMint: WRAPPED_SOL,
      outputMint: params.mint,
      tradeIndex,
      amountIn: amountInBig,
      amountOut: amountOutBig,
    })
  );

  try {
    const decompiled = TransactionMessage.decompile(vtx.message, {
      addressLookupTableAccounts: addressLookupAccounts,
      payerKey: vtx.message.staticAccountKeys[0],
    });
    const merged = [...decompiled.instructions, recordIx];
    const messageV0 = new TransactionMessage({
      payerKey: decompiled.payerKey,
      instructions: merged,
      recentBlockhash: decompiled.recentBlockhash,
    }).compileToV0Message(addressLookupAccounts);
    const composed = new VersionedTransaction(messageV0);
    const tradeIndexStr = tradeIndex.toString();

    return NextResponse.json({
      success: true,
      cluster: launch.cluster,
      mint: launch.tokenMint,
      trade_art: {
        trade_index: tradeIndexStr,
        preview_svg_url: `/api/cpeg/${launch.tokenMint}/trade-art/${tradeIndexStr}/svg`,
      },
      jupiter_quote: quotePayload,
      swap_transaction_base64: Buffer.from(composed.serialize()).toString("base64"),
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Could not append record_trade_art to the Jupiter bundle (likely transaction size/account limits). Try a smaller SOL size or narrower route.",
      },
      { status: 422 }
    );
  }
}
