"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Droplets, Loader2, Plus, Waves } from "lucide-react";
import { CpegOrcaSplashPool } from "@/components/cpeg-orca-splash";

/**
 * Trading + liquidity surface for a cPEG collection.
 *
 * The panel is the closest thing we ship to uPEG's "swap on Uniswap and art generates"
 * loop: it queries Jupiter for a live SOL -> cPEG quote and renders one of three states.
 *
 *   1) **Supported + has_route.** A pool already exists somewhere Jupiter aggregates
 *      (Whirlpool, Raydium CPMM, Meteora, etc.). We surface the spot price and a primary
 *      "Trade on Jupiter" CTA that pre-routes SOL <-> mint. This is the canonical buyer
 *      path: no mint required, just swap.
 *   2) **Supported + no route.** Token is on mainnet but no AMM has it yet. We surface a
 *      "Seed a Whirlpool pool on Orca" CTA that deeplinks to Orca's pool creation page
 *      with the mint pre-filled. The launch authority is the natural seeder because
 *      they hold the genesis allocation.
 *   3) **Unsupported (devnet/testnet).** Aggregators do not index devnet, so we soften
 *      the copy and just point to the P2P market.
 *
 * On **mainnet** without a routed pool, collectors can seed an Orca **Splash** pool in-wallet
 * (Whirlpool SDK) or use the deeplink fallback. Jupiter routing and in-app swaps that compose
 * `record_trade_art` are **mainnet-only**.
 */
interface CpegDexPanelProps {
  tokenMint: string;
  cluster: string;
  symbol: string;
  decimals: number | null;
}

interface DexResponse {
  success: boolean;
  supported: boolean;
  cluster: string;
  has_route?: boolean;
  reason?: string;
  probe?: { input_lamports: string; sol_amount: number };
  quote?: {
    out_amount_raw: string;
    out_amount_number: number;
    price_impact_pct: number | null;
    route_steps: number;
    slippage_bps: number;
  };
  links?: {
    jupiter_swap: string;
    birdeye: string;
    dexscreener: string;
  };
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

export function CpegDexPanel({ tokenMint, cluster, symbol, decimals }: CpegDexPanelProps) {
  const [data, setData] = useState<DexResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const isMainnetCluster = cluster === "mainnet-beta" || cluster === "mainnet";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/cpeg/${tokenMint}/dex`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as DexResponse | null;
        if (!cancelled && response.ok && body?.success) {
          setData(body);
        }
      } catch {
        // Network failure leaves the panel in a quiet "fetching" state. Avoid noisy errors
        // because the contract bar above already covers the basic CA experience.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenMint]);

  // Devnet / unsupported clusters: keep the panel calm and direct buyers to the P2P market.
  if (data && !data.supported) {
    return (
      <section className="border border-white/10 bg-white/[0.03] p-5">
        <header className="flex items-center gap-3">
          <Waves className="h-5 w-5 text-[#53c7ff]" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              DEX liquidity / {cluster}
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase">Aggregators do not index this cluster</h2>
          </div>
        </header>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Jupiter, Birdeye, and DEXScreener only cover Solana mainnet. On devnet you can still buy
          a cPEG via the P2P market, where listings are escrowed by the cpeg-market program.
        </p>
      </section>
    );
  }

  const hasRoute = Boolean(data?.has_route);
  const quote = data?.quote;
  const probeSol = data?.probe?.sol_amount ?? 0.1;
  const tokensReceived =
    quote && decimals !== null && decimals !== undefined
      ? quote.out_amount_number / 10 ** decimals
      : null;
  const pricePerToken = tokensReceived && tokensReceived > 0 ? probeSol / tokensReceived : null;

  return (
    <section className="border border-white/10 bg-white/[0.03] p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Waves className="mt-1 h-5 w-5 text-[#53c7ff]" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              DEX liquidity
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase">
              {loading
                ? "Probing aggregators..."
                : hasRoute
                ? `Tradeable on Jupiter`
                : "No DEX pool yet"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              {loading
                ? "Asking Jupiter whether a SOL -> cPEG route exists right now."
                : hasRoute
                ? `A live route was detected. Buyers swap SOL for ${symbol} on any aggregator that pulls Jupiter routes. The transfer hook still moves the matching PEG identity atomically.`
                : "Once anyone seeds a Whirlpool, Raydium, or Meteora pool with this mint, Jupiter will pick it up automatically and the swap CTA below will route through it."}
            </p>
          </div>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-white/35" />
        ) : (
          <span
            className={
              hasRoute
                ? "inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#53c7ff]"
                : "inline-flex items-center gap-2 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55"
            }
          >
            <Droplets className="h-3 w-3" /> {hasRoute ? "Live route" : "Awaiting liquidity"}
          </span>
        )}
      </header>

      {hasRoute && quote ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="border border-white/10 bg-black/25 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              Spot price
            </p>
            <p className="mt-2 text-xl font-black text-[#f7f2df]">
              {pricePerToken ? pricePerToken.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "--"}
              <span className="ml-1 text-xs font-mono uppercase tracking-[0.2em] text-white/45">SOL / cPEG</span>
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              from a {probeSol} SOL probe
            </p>
          </div>
          <div className="border border-white/10 bg-black/25 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              Probe output
            </p>
            <p className="mt-2 text-xl font-black text-[#53c7ff]">
              {tokensReceived !== null
                ? tokensReceived.toLocaleString(undefined, { maximumFractionDigits: 6 })
                : "--"}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              {symbol} for {probeSol} SOL
            </p>
          </div>
          <div className="border border-white/10 bg-black/25 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              Route depth
            </p>
            <p className="mt-2 text-xl font-black text-[#f7f2df]">
              {quote.route_steps || 1} hop{quote.route_steps && quote.route_steps > 1 ? "s" : ""}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              impact {quote.price_impact_pct !== null ? `${(quote.price_impact_pct * 100).toFixed(2)}%` : "--"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {hasRoute ? (
          <a
            href={data?.links?.jupiter_swap || `https://jup.ag/swap/SOL-${tokenMint}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
          >
            Trade on Jupiter <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : (
          <a
            href={`https://www.orca.so/create-pool?baseMint=${tokenMint}&quoteMint=${SOL_MINT}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
          >
            <Plus className="h-3 w-3" /> Seed Whirlpool on Orca <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
        <a
          href={`https://dexscreener.com/solana/${tokenMint}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/72 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
        >
          DEXScreener <ArrowUpRight className="h-3 w-3" />
        </a>
        <a
          href={`https://birdeye.so/token/${tokenMint}?chain=solana`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/72 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
        >
          Birdeye <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      {isMainnetCluster && data?.supported && !hasRoute && !loading ? (
        <div className="mt-5 border border-white/10 bg-black/20 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            In-wallet (mainnet)
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/55">
            Create a concentrated Orca Splash pool from the app so Jupiter can pick up the route
            after indexers refresh. Alternatively use the Orca website link above.
          </p>
          <div className="mt-4">
            <CpegOrcaSplashPool cluster={cluster} tokenMint={tokenMint} />
          </div>
        </div>
      ) : null}

      {!hasRoute && !loading ? (
        <p className="mt-4 max-w-3xl text-xs leading-5 text-white/45">
          The Token-2022 mint with TransferHook is supported by Whirlpool V2. Once a pool is
          live, every Jupiter swap will move both the token unit and its PEG identity atomically
          via the same transfer hook the P2P market uses today.
        </p>
      ) : null}

      {hasRoute ? (
        <div className="mt-5 overflow-hidden border border-white/10 bg-black">
          <iframe
            title="DEXScreener price chart"
            src={`https://dexscreener.com/solana/${tokenMint}?embed=1&theme=dark&trades=0&info=0`}
            className="h-[420px] w-full border-0"
            loading="lazy"
            allow="clipboard-write"
          />
        </div>
      ) : null}
    </section>
  );
}
