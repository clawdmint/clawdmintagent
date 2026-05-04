"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUpRight, Loader2, Zap } from "lucide-react";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { describeError, explorerTxUrl } from "@/lib/cpeg-ui";
import { transactionInstructionFromManifest, type ManifestInstruction } from "@/lib/cpeg-manifest";

function getClientRpcUrl(cluster: string) {
  const configured =
    process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] ||
    process.env["NEXT_PUBLIC_SOLANA_BROWSER_RPC_URL"];
  if (configured) return configured;
  return clusterApiUrl(cluster === "devnet" ? "devnet" : "mainnet-beta");
}

interface QuoteState {
  peg_ids: number[];
  peg_count: number;
  total_sol: number;
  average_price_sol: number;
  budget_remaining_sol: number;
  floor_sol: number | null;
  listings_in_book: number;
}

interface DexPreviewQuote {
  out_amount_raw: string;
  out_amount_number: number;
  probe_sol: number;
}

interface CpegSwapCardProps {
  tokenMint: string;
  cluster: string;
  symbol: string;
  /** Whole-token divisor for Jupiter previews (fallback 9). */
  decimals: number | null;
  onComplete?: () => void;
}

const PRESET_AMOUNTS = ["0.1", "0.5", "1", "5"];

export function CpegSwapCard({ tokenMint, cluster, symbol, decimals, onComplete }: CpegSwapCardProps) {
  const { isConnected, solanaAddress, login } = useWallet();
  const [mode, setMode] = useState<"amm" | "floor">("floor");
  const [solInput, setSolInput] = useState("0.5");
  const [maxPegs, setMaxPegs] = useState(6);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [dexPreview, setDexPreview] = useState<DexPreviewQuote | null>(null);
  const [dexRoutePossible, setDexRoutePossible] = useState(false);
  const [quoteReason, setQuoteReason] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [swapError, setSwapError] = useState("");
  const [lastTx, setLastTx] = useState("");
  const [dexArtUrl, setDexArtUrl] = useState<string | null>(null);
  const [routeProbeLoading, setRouteProbeLoading] = useState(false);

  const isMainnet = cluster === "mainnet-beta" || cluster === "mainnet";
  const decimalsSafe = decimals !== null && decimals !== undefined ? decimals : 9;

  const solValue = useMemo(() => {
    const parsed = Number.parseFloat(solInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [solInput]);

  useEffect(() => {
    if (!isMainnet || !solValue || mode !== "amm") {
      setDexPreview(null);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const handle = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(String(solValue));
        const res = await fetch(`/api/cpeg/${tokenMint}/dex?preview_sol=${encoded}`, {
          cache: "no-store",
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.success && body.has_route) {
          setDexRoutePossible(true);
          setDexPreview({
            out_amount_raw: body.quote.out_amount_raw,
            out_amount_number: body.quote.out_amount_number as number,
            probe_sol: body.probe.sol_amount as number,
          });
          setQuoteReason("");
        } else if (body?.reason) {
          setDexPreview(null);
          setDexRoutePossible(false);
          setQuoteReason(body.reason);
        }
      } catch {
        if (!cancelled) {
          setDexPreview(null);
          setDexRoutePossible(false);
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [isMainnet, mode, solValue, tokenMint]);

  useEffect(() => {
    if (!isMainnet) {
      setDexRoutePossible(false);
      return;
    }
    let cancelled = false;
    setRouteProbeLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/cpeg/${tokenMint}/dex`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!cancelled) {
          setDexRoutePossible(Boolean(body?.supported && body?.has_route));
        }
      } catch {
        if (!cancelled) setDexRoutePossible(false);
      } finally {
        if (!cancelled) setRouteProbeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMainnet, tokenMint]);

  useEffect(() => {
    if (mode === "amm" && (!isMainnet || !dexRoutePossible)) {
      setMode("floor");
    }
  }, [dexRoutePossible, isMainnet, mode]);

  useEffect(() => {
    if (mode !== "floor") {
      return;
    }
    if (solValue <= 0) {
      setQuote(null);
      setQuoteReason("");
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteReason("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/cpeg/${tokenMint}/sweep/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sol_amount: solValue, max_pegs: maxPegs }),
        });
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.ok && body?.success) {
          setQuote(body.quote);
          if (body.reason) setQuoteReason(body.reason);
        } else {
          setQuote(null);
          setQuoteReason(body?.error || "Sweep quote failed.");
        }
      } catch (cause) {
        if (!cancelled) {
          setQuote(null);
          setQuoteReason(cause instanceof Error ? cause.message : "Sweep quote failed.");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [maxPegs, mode, solValue, tokenMint]);

  const handleDexSwap = useCallback(async () => {
    setSwapError("");
    setDexArtUrl(null);
    setLastTx("");
    setStatus("");
    if (!solanaAddress) {
      login();
      return;
    }
    if (!isMainnet) {
      setSwapError("Jupiter swaps are mainnet-only. Switch cluster or floor sweep listings instead.");
      return;
    }

    setBusy(true);
    try {
      const prep = await fetch(`/api/cpeg/${tokenMint}/trade-router/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "amm_jupiter", buyer: solanaAddress, sol_amount: solValue, slippage_bps: 150 }),
      });
      const body = await prep.json().catch(() => null);
      if (!prep.ok || !body?.success || !body.swap_transaction_base64) {
        throw new Error(body?.error || "Aggregator swap prepare failed.");
      }

      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const phantom = getPhantomProvider();
      if (!phantom?.signTransaction) {
        throw new Error("Phantom signer unavailable.");
      }

      let vtx = VersionedTransaction.deserialize(
        Uint8Array.from(atob(body.swap_transaction_base64), (ch) => ch.charCodeAt(0))
      );
      setStatus("Open Phantom and approve the aggregator swap + trade art.");
      vtx = (await phantom.signTransaction(vtx)) as InstanceType<typeof VersionedTransaction>;

      const signature = await connection.sendRawTransaction(vtx.serialize(), {
        maxRetries: 5,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      });
      await connection.confirmTransaction(signature, "confirmed");

      setLastTx(signature);
      const preview = typeof body?.trade_art?.preview_svg_url === "string" ? body.trade_art.preview_svg_url : null;
      setDexArtUrl(preview);
      setStatus(`Swap confirmed. Permanent trade art ${preview ? `recorded (${body.trade_art.trade_index})` : "indexed on-chain momentarily"}.`);
      onComplete?.();
    } catch (cause) {
      setSwapError(describeError(cause, "DEX swap failed."));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [cluster, isMainnet, login, onComplete, solValue, solanaAddress, tokenMint]);

  const handleFloorSwap = useCallback(async () => {
    setSwapError("");
    setStatus("");
    setLastTx("");
    if (!solanaAddress) {
      login();
      return;
    }
    if (!quote || quote.peg_count === 0) {
      setSwapError("No escrow listings satisfy this budget.");
      return;
    }

    setBusy(true);
    try {
      setStatus(`Preparing floor sweep (${quote.peg_count} identities)...`);
      const prepRes = await fetch(`/api/cpeg/${tokenMint}/trade-router/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "market_floor_sweep", buyer: solanaAddress, peg_ids: quote.peg_ids }),
      });
      const prepBody = await prepRes.json().catch(() => null);
      if (!prepRes.ok || !prepBody?.success) {
        throw new Error(prepBody?.error || "Batch prepare failed.");
      }

      const provider = getPhantomProvider();
      if (!provider?.signTransaction) throw new Error("Phantom transaction signing unavailable.");

      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const owner = new PublicKey(solanaAddress);
      const buyerAta = new PublicKey(prepBody.buyer_token_account);
      const ataInfo = await connection.getAccountInfo(buyerAta, "confirmed");

      const tx = new Transaction();
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            owner,
            buyerAta,
            owner,
            new PublicKey(tokenMint),
            TOKEN_2022_PROGRAM_ID
          )
        );
      }
      for (const ix of prepBody.instructions as ManifestInstruction[]) {
        tx.add(transactionInstructionFromManifest(ix));
      }

      const blockhash = await connection.getLatestBlockhash("confirmed");
      tx.feePayer = owner;
      tx.recentBlockhash = blockhash.blockhash;

      setStatus("Opening Phantom...");
      type SolTx = InstanceType<typeof Transaction>;
      const signed = (await provider.signTransaction(tx as SolTx)) as SolTx;
      const signature = await connection.sendRawTransaction(
        signed.serialize({ requireAllSignatures: true, verifySignatures: false }),
        { skipPreflight: false, maxRetries: 5, preflightCommitment: "confirmed" }
      );

      await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");
      await fetch(`/api/cpeg/${tokenMint}/market/buy/batch/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, buyer: solanaAddress, peg_ids: quote.peg_ids }),
      }).catch(() => null);

      setLastTx(signature);
      setStatus(`Escrow fills confirmed for ${quote.peg_count} cPEGs + trade-art PDAs emitted.`);
      onComplete?.();
    } catch (cause) {
      setSwapError(describeError(cause, "Floor sweep failed."));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [cluster, login, onComplete, quote, solanaAddress, tokenMint]);

  const estimatedDexWhole =
    dexPreview && dexPreview.out_amount_number !== undefined && dexPreview.out_amount_number !== null
      ? dexPreview.out_amount_number / 10 ** decimalsSafe
      : 0;

  const hasFloorFill = quote && quote.peg_count > 0;
  const dexActionReady = dexRoutePossible && solValue > 0 && isMainnet;

  return (
    <section className="border border-neutral-200 bg-gradient-to-br from-[#53c7ff]/[0.05] via-white/90 to-[#f7f2df]/35 p-5 dark:border-white/10 dark:from-[#53c7ff]/[0.06] dark:via-white/[0.02] dark:to-[#f7f2df]/[0.04]">
      <header className="flex items-center gap-3">
        <Zap className="h-5 w-5 text-[#53c7ff]" />
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">Quick swap desk</p>
          <h2 className="mt-1 text-2xl font-black uppercase text-neutral-950 dark:text-[#f7f2df]">Pay SOL · receive {symbol}</h2>
        </div>
      </header>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("amm")}
          disabled={!isMainnet || !dexRoutePossible}
          className={`flex-1 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
            mode === "amm"
              ? "border-[#53c7ff] bg-[#53c7ff]/10 text-[#53c7ff]"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-white/15 dark:text-white/60 dark:hover:border-white/35"
          } disabled:opacity-35`}
        >
          Jupiter swap + art
        </button>
        <button
          type="button"
          onClick={() => setMode("floor")}
          className={`flex-1 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
            mode === "floor"
              ? "border-[#53c7ff] bg-[#53c7ff]/10 text-[#53c7ff]"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-white/15 dark:text-white/60 dark:hover:border-white/35"
          }`}
        >
          P2P floor sweep
        </button>
      </div>
      {!isMainnet ? (
        <p className="mt-3 text-xs text-neutral-600 dark:text-white/52">AMM tab disabled on devnet. Floor sweep stays available via escrow listings.</p>
      ) : !dexRoutePossible ? (
        <p className="mt-3 text-xs text-neutral-600 dark:text-white/52">AMM tab unlocks automatically once Jupiter can route SOL into this mint (seed Splash pool).</p>
      ) : (
        <p className="mt-3 text-xs text-neutral-700 dark:text-white/55">
          AMM swaps append `record_trade_art` on-chain so every routed trade can emit deterministic art.
        </p>
      )}

      <div className="mt-5 grid gap-3">
        <div className="border border-neutral-300 bg-neutral-100/90 p-4 dark:border-white/12 dark:bg-black/30">
          <div className="flex justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">You pay</p>
            <div className="flex gap-1">
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setSolInput(amount)}
                  className={
                    solInput === amount
                      ? "border border-[#53c7ff]/60 bg-[#53c7ff]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#53c7ff]"
                      : "border border-neutral-200 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/10 dark:text-white/55"
                  }
                >
                  {amount}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={solInput}
              onChange={(event) => setSolInput(event.target.value)}
              className="w-full bg-transparent text-3xl font-black text-neutral-950 outline-none transition dark:text-[#f7f2df]"
              placeholder="0.0"
            />
            <span className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-neutral-700 dark:text-white/55">SOL</span>
          </div>

          {mode === "floor" ? (
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
              <span>per-transaction peg cap</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMaxPegs(Math.max(1, maxPegs - 1))}
                  className="border border-neutral-200 px-2 py-1 text-neutral-700 transition hover:border-[#53c7ff] dark:border-white/10 dark:text-white/55"
                >
                  -
                </button>
                <span className="text-neutral-800 dark:text-white/72">{maxPegs} cPEG</span>
                <button
                  type="button"
                  onClick={() => setMaxPegs(Math.min(6, maxPegs + 1))}
                  className="border border-neutral-200 px-2 py-1 text-neutral-700 transition hover:border-[#53c7ff] dark:border-white/10 dark:text-white/55"
                >
                  +
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-center">
          <ArrowDown className="h-4 w-4 text-neutral-500 dark:text-white/35" />
        </div>

        <div className="border border-neutral-300 bg-neutral-100/90 p-4 dark:border-white/12 dark:bg-black/30">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">
            You receive (~{decimalsSafe === 0 ? "whole" : decimalsSafe}-decimal units)
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-3xl font-black text-[#53c7ff]">
              {mode === "amm"
                ? dexRoutePossible
                  ? estimatedDexWhole.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: Math.min(6, Math.max(decimalsSafe, 0)),
                    })
                  : "0"
                : quote?.peg_count ?? 0}{" "}
              {mode === "amm"
                ? `≈ whole ${symbol}`
                : `${symbol} (${quote?.peg_ids.length ? "escrows" : "listings"})`}
            </span>
          </div>

          {mode === "floor" && quote ? (
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
              <div>
                <p className="text-neutral-500 dark:text-white/35">spent</p>
                <p className="mt-1 text-neutral-900 dark:text-white/72">{quote.total_sol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL</p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-white/35">avg</p>
                <p className="mt-1 text-neutral-900 dark:text-white/72">{quote.average_price_sol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL</p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-white/35">floor</p>
                <p className="mt-1 text-neutral-900 dark:text-white/72">
                  {quote.floor_sol !== null ? quote.floor_sol.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "--"} SOL
                </p>
              </div>
            </div>
          ) : mode === "amm" ? (
            <p className="mt-3 text-xs leading-6 text-neutral-600 dark:text-white/54">
              Probed with {dexPreview?.probe_sol ?? "--"} SOL. Route depth + price-impact shown in dex panel beside this card.
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={isConnected ? (mode === "amm" ? handleDexSwap : handleFloorSwap) : login}
        disabled={
          busy ||
          quoteLoading ||
          routeProbeLoading ||
          (mode === "amm" ? !dexActionReady : !(hasFloorFill && solValue > 0))
        }
        className="mt-5 inline-flex w-full items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy || quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {!isConnected
          ? "Connect Phantom"
          : busy
          ? mode === "amm"
            ? "Swapping..."
            : "Sweeping..."
          : quoteLoading
          ? mode === "amm"
            ? "Reading Jupiter..."
            : "Fetching floor..."
          : mode === "amm"
          ? "Swap + mint trade-art"
          : `Sweep ${quote?.peg_ids.length ?? 0} listing${quote?.peg_ids.length !== 1 ? "s" : ""}`}
      </button>

      {status ? <p className="mt-4 text-sm text-[#53c7ff]">{status}</p> : null}
      {swapError ? <p className="mt-4 text-sm text-red-300">{swapError}</p> : null}
      {!swapError && quoteReason ? <p className="mt-4 text-xs text-neutral-600 dark:text-white/45">{quoteReason}</p> : null}

      {lastTx ? (
        <a
          href={explorerTxUrl(lastTx, cluster)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-[#53c7ff]"
        >
          View transaction <ArrowUpRight className="h-3 w-3" />
        </a>
      ) : null}

      {dexArtUrl ? (
        <img
          src={dexArtUrl}
          alt="Latest dex trade-art"
          className="mx-auto mt-4 h-32 w-32 border border-neutral-300 object-cover [image-rendering:pixelated] dark:border-white/15"
        />
      ) : null}
    </section>
  );
}
