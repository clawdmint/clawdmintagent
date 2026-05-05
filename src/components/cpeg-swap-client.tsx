"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clusterApiUrl, Connection, VersionedTransaction } from "@solana/web3.js";
import { ArrowDown, ArrowDownUp, ExternalLink, Loader2, RefreshCw, Settings, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { useCpegSite } from "@/components/cpeg-site-context";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";
import { describeError, explorerTxUrl, truncateAddress } from "@/lib/cpeg-ui";

interface LaunchRow {
  name: string;
  symbol: string;
  token_mint: string;
  cluster: string;
  max_pegs: number;
  preview_image: string;
  market: {
    active_listings: number;
    floor_sol: string | null;
    volume_sol: string;
  };
}

interface LaunchPayload {
  success: boolean;
  launches: LaunchRow[];
}

interface CompatibilityPayload {
  success: boolean;
  error?: string;
  collection?: {
    name: string;
    symbol: string;
    mint: string;
    cluster: string;
    max_pegs: number;
    peg_unit_raw: string;
    collection_exists: boolean;
    validation_exists: boolean;
  };
  token?: {
    is_token_2022: boolean;
    supply_raw: string;
    decimals: number;
    metadata_address: string | null;
  };
  hook?: {
    matches_cpeg_program: boolean;
  };
  dex?: {
    official_router: { available: boolean; reason: string };
  };
}

interface DexProbePayload {
  success: boolean;
  side?: "buy" | "sell";
  supported?: boolean;
  has_route?: boolean;
  reason?: string;
  quote?: { out_amount_raw: string; price_impact_pct: number | null; route_steps: number };
}

function getClientRpcUrl(cluster: string) {
  if (cluster === "devnet") {
    return process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] || clusterApiUrl("devnet");
  }
  return process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] || clusterApiUrl("mainnet-beta");
}

function parsePositiveNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatTokenAmount(raw: string | undefined, decimals: number | undefined) {
  if (!raw || decimals === undefined) return "";
  const amount = Number(BigInt(raw)) / 10 ** decimals;
  if (!Number.isFinite(amount)) return "";
  return amount.toLocaleString(undefined, { maximumFractionDigits: Math.min(decimals, 6) });
}

function formatSolAmount(raw: string | undefined) {
  if (!raw) return "";
  const amount = Number(BigInt(raw)) / 1_000_000_000;
  if (!Number.isFinite(amount)) return "";
  return amount.toLocaleString(undefined, { maximumFractionDigits: 9 });
}

function routeLabel(probe: DexProbePayload | null, compatibility: CompatibilityPayload | null) {
  if (!compatibility?.success) return "Select a token";
  if (probe?.has_route) return "Route ready";
  if (compatibility.collection?.cluster === "devnet") return "Devnet route unavailable";
  return "No route";
}

export function CpegSwapClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const site = useCpegSite();
  const urls = useMemo(() => cpegPublicPaths(site), [site]);
  const { solanaAddress, isConnected, login } = useWallet();

  const [launches, setLaunches] = useState<LaunchRow[]>([]);
  const [mint, setMint] = useState(searchParams?.get("mint") || "");
  const [side, setSide] = useState<"sell" | "buy">(
    searchParams?.get("side") === "buy" ? "buy" : "sell"
  );
  const [compatibility, setCompatibility] = useState<CompatibilityPayload | null>(null);
  const [probe, setProbe] = useState<DexProbePayload | null>(null);
  const [payAmount, setPayAmount] = useState(side === "sell" ? "1" : "0.1");
  const [pegId, setPegId] = useState("1");
  const [slippage, setSlippage] = useState("150");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lastTx, setLastTx] = useState("");

  const selected = useMemo(() => launches.find((row) => row.token_mint === mint) || null, [launches, mint]);
  const symbol = compatibility?.collection?.symbol || selected?.symbol || "cPEG";
  const cluster = compatibility?.collection?.cluster || selected?.cluster || "devnet";
  const receiveAmount =
    side === "sell"
      ? formatSolAmount(probe?.quote?.out_amount_raw)
      : formatTokenAmount(probe?.quote?.out_amount_raw, compatibility?.token?.decimals);
  const canUseOfficialRouter = Boolean(compatibility?.dex?.official_router.available);
  const tokenReady = Boolean(
    compatibility?.token?.is_token_2022 &&
      compatibility?.hook?.matches_cpeg_program &&
      compatibility?.collection?.collection_exists &&
      compatibility?.collection?.validation_exists
  );
  const routePair = side === "sell" ? `${symbol} -> SOL` : `SOL -> ${symbol}`;

  const loadLaunches = useCallback(async () => {
    const response = await fetch("/api/cpeg?limit=50", { cache: "no-store" });
    const payload = (await response.json()) as LaunchPayload;
    const rows = payload.launches || [];
    setLaunches(rows);
    if (!mint && rows[0]) setMint(rows[0].token_mint);
  }, [mint]);

  const loadReadiness = useCallback(async (targetMint: string, amount: string, routeSide: "buy" | "sell") => {
    if (!targetMint) return;
    const previewAmount = parsePositiveNumber(amount) || (routeSide === "sell" ? 1 : 0.1);
    setLoading(true);
    setError("");
    try {
      const [compatRes, dexRes] = await Promise.all([
        fetch(`/api/cpeg/${targetMint}/dex/compatibility`, { cache: "no-store" }),
        fetch(
          routeSide === "sell"
            ? `/api/cpeg/${targetMint}/dex?side=sell&preview_token=${encodeURIComponent(String(previewAmount))}`
            : `/api/cpeg/${targetMint}/dex?side=buy&preview_sol=${encodeURIComponent(String(previewAmount))}`,
          { cache: "no-store" }
        ),
      ]);
      setCompatibility((await compatRes.json()) as CompatibilityPayload);
      setProbe((await dexRes.json()) as DexProbePayload);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLaunches();
  }, [loadLaunches]);

  useEffect(() => {
    if (!mint) return;
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("mint", mint);
    params.set("side", side);
    router.replace(`${urls.swap}?${params.toString()}`, { scroll: false });
    void loadReadiness(mint, payAmount, side);
  }, [loadReadiness, mint, payAmount, router, searchParams, side, urls.swap]);

  const flipSide = useCallback(() => {
    setSide((value) => {
      const next = value === "sell" ? "buy" : "sell";
      setPayAmount(next === "sell" ? "1" : "0.1");
      setStatus("");
      setError("");
      return next;
    });
  }, []);

  const handleOfficialSwap = useCallback(async () => {
    setError("");
    setStatus("");
    setLastTx("");
    if (!mint) return;
    if (side === "sell") {
      setError("Identity-backed token sells use the market until AMM sell routing is enabled.");
      return;
    }
    if (!isConnected || !solanaAddress) {
      await login();
      return;
    }

    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      setError("Phantom transaction signing is unavailable.");
      return;
    }

    const amount = parsePositiveNumber(payAmount);
    const peg = Number.parseInt(pegId, 10);
    const bps = Number.parseInt(slippage, 10);
    if (!amount) {
      setError("Enter a valid SOL amount.");
      return;
    }
    if (!Number.isInteger(peg) || peg < 1) {
      setError("Enter a valid identity number.");
      return;
    }

    setBusy(true);
    try {
      setStatus("Preparing route...");
      const response = await fetch(`/api/cpeg/${mint}/dex/jupiter/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer: solanaAddress,
          side,
          sol_amount: amount,
          slippage_bps: Number.isInteger(bps) ? bps : 150,
          peg_id: peg,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || typeof payload.swap_transaction_base64 !== "string") {
        throw new Error(payload.error || "Could not prepare the route.");
      }

      const transaction = VersionedTransaction.deserialize(Buffer.from(payload.swap_transaction_base64, "base64"));
      setStatus("Waiting for signature...");
      const signed = (await provider.signTransaction(transaction)) as InstanceType<typeof VersionedTransaction>;
      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      setStatus("Confirming...");
      await connection.confirmTransaction(signature, "confirmed");
      setLastTx(signature);
      setStatus(`Swap confirmed. Identity #${peg} was included.`);
      void loadReadiness(mint, payAmount, side);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [cluster, isConnected, loadReadiness, login, mint, payAmount, pegId, side, slippage, solanaAddress]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#f4efe7] px-4 py-12 text-[#1b1d2d] dark:bg-[#070707] dark:text-white">
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-cyan-500">Swap</p>
        <h1 className="mt-3 text-center text-3xl font-black tracking-tight md:text-4xl">Token Swap</h1>
        <p className="mt-2 text-center font-mono text-xs text-neutral-500 dark:text-white/45">trade tokens on solana</p>

        <div className="mt-8 w-full overflow-hidden rounded-xl bg-[#171a2b] p-2 shadow-2xl shadow-black/15">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-black text-white">Swap</p>
            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              className="rounded-md p-1 text-white/45 hover:bg-white/5 hover:text-white"
              aria-label="Swap settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-lg bg-[#101322] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">You pay</p>
                <input
                  value={payAmount}
                  onChange={(event) => setPayAmount(event.target.value)}
                  className="mt-3 w-full bg-transparent text-3xl font-black text-white outline-none"
                  inputMode="decimal"
                />
              </div>
              {side === "sell" ? (
                <select
                  value={mint}
                  onChange={(event) => setMint(event.target.value)}
                  className="mt-7 max-w-[160px] rounded-full bg-[#1d2135] px-3 py-2 text-sm font-black text-white outline-none"
                >
                  <option value="">cPEG</option>
                  {launches.map((row) => (
                    <option key={row.token_mint} value={row.token_mint}>
                      {row.symbol}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-7 max-w-[160px] rounded-full bg-[#1d2135] px-3 py-2 text-sm font-black text-white">
                  SOL
                </div>
              )}
            </div>
          </div>

          <div className="relative flex h-4 items-center justify-center">
            <button
              type="button"
              onClick={flipSide}
              className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-[#1d2135] text-orange-400 hover:bg-[#252a43]"
              aria-label="Switch swap direction"
            >
              {side === "sell" ? <ArrowDown className="h-4 w-4" /> : <ArrowDownUp className="h-4 w-4" />}
            </button>
          </div>

          <div className="rounded-lg bg-[#101322] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">You receive</p>
                <p className="mt-3 truncate text-3xl font-black text-white">{receiveAmount || "--"}</p>
              </div>
              {side === "sell" ? (
                <div className="mt-7 rounded-full bg-[#1d2135] px-3 py-2 text-sm font-black text-white">SOL</div>
              ) : (
                <select
                  value={mint}
                  onChange={(event) => setMint(event.target.value)}
                  className="mt-7 max-w-[160px] rounded-full bg-[#1d2135] px-3 py-2 text-sm font-black text-white outline-none"
                >
                  <option value="">cPEG</option>
                  {launches.map((row) => (
                    <option key={row.token_mint} value={row.token_mint}>
                      {row.symbol}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {detailsOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-[#101322] p-3">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Identity</span>
                <input
                  value={pegId}
                  onChange={(event) => setPegId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white outline-none"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Slippage bps</span>
                <input
                  value={slippage}
                  onChange={(event) => setSlippage(event.target.value)}
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white outline-none"
                />
              </label>
            </div>
          )}

          <div className="px-4 py-3">
            <div className="flex items-center justify-between font-mono text-[11px] text-white/40">
              <span className="inline-flex items-center gap-2">
                <RefreshCw className={clsx("h-3 w-3", loading && "animate-spin")} />
                {routeLabel(probe, compatibility)}
              </span>
              <span>{routePair}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOfficialSwap}
            disabled={busy || !mint || !canUseOfficialRouter || !tokenReady || side === "sell"}
            className={clsx(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-sm font-black uppercase tracking-wide",
              busy || !mint || !canUseOfficialRouter || !tokenReady || side === "sell"
                ? "cursor-not-allowed bg-white/10 text-white/35"
                : "bg-orange-600 text-white hover:bg-orange-500"
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {isConnected ? "Swap" : "Connect wallet"}
          </button>
        </div>

        <div className="mt-4 w-full rounded-xl border border-neutral-200 bg-white/60 p-4 font-mono text-[11px] text-neutral-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
          <div className="flex items-center justify-between gap-4">
            <span>Route</span>
            <span className={probe?.has_route ? "text-emerald-500" : "text-neutral-500"}>
              {probe?.has_route ? routePair : routeLabel(probe, compatibility)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span>Price impact</span>
            <span>{probe?.quote?.price_impact_pct == null ? "--" : `${probe.quote.price_impact_pct}%`}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <span>Token</span>
            <span>{mint ? truncateAddress(mint) : "--"}</span>
          </div>
        </div>

        {!canUseOfficialRouter && compatibility?.dex?.official_router.reason && side === "buy" && (
          <p className="mt-4 max-w-[420px] text-center text-xs leading-6 text-neutral-500 dark:text-white/45">
            {compatibility.dex.official_router.reason}
          </p>
        )}
        {side === "sell" && (
          <p className="mt-4 max-w-[420px] text-center text-xs leading-6 text-neutral-500 dark:text-white/45">
            Identity-backed sells use the market until the AMM sell route can escrow a specific identity.
          </p>
        )}
        {status && <p className="mt-4 text-center text-sm text-emerald-500">{status}</p>}
        {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}
        {lastTx && (
          <a
            href={explorerTxUrl(lastTx, cluster)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 font-mono text-xs text-cyan-500 hover:text-cyan-300"
          >
            View transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
