import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

/**
 * Live DEX liquidity probe for a cPEG token.
 *
 * cPEG product framing relies on the token being tradeable on a real AMM
 * so a buyer can "swap, no mint required". On Solana the equivalent surface is Jupiter,
 * which aggregates every meaningful AMM (Orca Whirlpool, Raydium CPMM, Meteora, etc.)
 * and exposes a free quote API. We hit that API with a tiny 0.1 SOL probe and translate
 * the response into a normalized status payload that the collection page can render.
 *
 * The endpoint intentionally treats Jupiter as the source of truth for "is there a pool
 * yet?". Whether the pool lives on Whirlpool, Raydium, or somewhere else is irrelevant
 * to the buyer experience: if Jupiter can route SOL -> mint, the buyer can swap from
 * the contract bar's Jupiter button.
 *
 * Devnet returns `{ has_route: false, supported: false }` because aggregators do not
 * index devnet. The collection page uses that to show a softer copy ("not indexed on
 * devnet") instead of "no liquidity".
 */
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_API = "https://lite-api.jup.ag/swap/v1/quote";
const REQUEST_TIMEOUT_MS = 5000;

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string;
  routePlan?: Array<unknown>;
  contextSlot?: number;
  error?: string;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const previewSolRaw = request.nextUrl.searchParams.get("preview_sol");
  let probeSolAmount = 0.1;
  if (previewSolRaw !== null) {
    const parsed = Number.parseFloat(previewSolRaw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 2000) {
      probeSolAmount = parsed;
    }
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: { cluster: true, tokenMint: true, name: true, symbol: true },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const isMainnet = launch.cluster === "mainnet-beta" || launch.cluster === "mainnet";
  if (!isMainnet) {
    return NextResponse.json({
      success: true,
      supported: false,
      cluster: launch.cluster,
      reason: "Aggregators do not index devnet/testnet pools.",
      probe: { input_lamports: String(Math.floor(probeSolAmount * 1_000_000_000)), sol_amount: probeSolAmount },
    });
  }

  const probeLamports = Math.floor(probeSolAmount * 1_000_000_000);
  const url = new URL(JUPITER_API);
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", params.mint);
  url.searchParams.set("amount", String(probeLamports));
  url.searchParams.set("slippageBps", "300");
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("onlyDirectRoutes", "false");

  let quote: JupiterQuoteResponse | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (response.ok) {
      quote = (await response.json()) as JupiterQuoteResponse;
      if (quote.error) {
        error = quote.error;
        quote = null;
      }
    } else if (response.status === 404 || response.status === 400) {
      // 404 = no route, 400 = "could not find any route" depending on Jupiter version.
      // Treat both as "no liquidity yet" rather than a hard server failure.
      error = "no_route";
    } else {
      error = `Jupiter API responded with ${response.status}`;
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Jupiter API unreachable";
  }

  if (!quote || !quote.outAmount) {
    return NextResponse.json({
      success: true,
      supported: true,
      cluster: launch.cluster,
      has_route: false,
      reason: error || "No Jupiter route detected for SOL -> cPEG.",
      probe: { input_lamports: String(probeLamports), sol_amount: probeSolAmount },
    });
  }

  const outAmount = BigInt(quote.outAmount);
  const outNumber = Number(outAmount);
  // 0.1 SOL bought N raw token units. Display price = SOL per whole unit. We do not have
  // the mint decimals here, so the page UI converts using its own copy of the token state.
  // For the panel we just expose the raw figures; the client divides by 10**decimals.
  const priceImpact = quote.priceImpactPct ? Number(quote.priceImpactPct) : null;

  return NextResponse.json({
    success: true,
    supported: true,
    cluster: launch.cluster,
    has_route: true,
    probe: {
      input_lamports: String(probeLamports),
      sol_amount: probeSolAmount,
    },
    quote: {
      out_amount_raw: quote.outAmount,
      out_amount_number: outNumber,
      price_impact_pct: priceImpact,
      route_steps: Array.isArray(quote.routePlan) ? quote.routePlan.length : 0,
      slippage_bps: 300,
    },
    links: {
      jupiter_swap: `https://jup.ag/swap/SOL-${params.mint}`,
      birdeye: `https://birdeye.so/token/${params.mint}?chain=solana`,
      dexscreener: `https://dexscreener.com/solana/${params.mint}`,
    },
  });
}
