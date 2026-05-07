"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clusterApiUrl, Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
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
  authority_address?: string | null;
  cluster: string;
  max_pegs: number;
  standard_mode?: string;
  hybrid_status?: string | null;
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

interface LaunchInstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface LaunchInstruction {
  programId: string;
  accounts: LaunchInstructionAccount[];
  dataBase64: string;
}

interface SellPreparePayload {
  success: boolean;
  error?: string;
  listing?: {
    listing_address: string;
    escrow_owner_peg_address: string;
    escrow_token_account: string;
    peg_record_address: string;
    seller: string;
    peg_id: number;
    price_lamports: string;
  };
  instructions?: LaunchInstruction[];
}

interface OwnedPeg {
  id: number;
  image: string;
  owner: string | null;
}

type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function manifestToInstruction(instruction: LaunchInstruction) {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: base64ToBytes(instruction.dataBase64),
  });
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
  if (probe?.reason === "Use the cPEG vault for capture and release.") return "Vault route";
  if (probe?.has_route) return "Route ready";
  if (compatibility.collection?.cluster === "devnet") return "Devnet route unavailable";
  return "No route";
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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
  const [ownedPegs, setOwnedPegs] = useState<OwnedPeg[]>([]);
  const [slippage, setSlippage] = useState("150");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lastTx, setLastTx] = useState("");

  const selected = useMemo(() => launches.find((row) => row.token_mint === mint) || null, [launches, mint]);
  const isHybridRoute = selected?.standard_mode === "metaplex_hybrid";
  const isLaunchAuthority = Boolean(
    selected?.authority_address && solanaAddress && selected.authority_address === solanaAddress
  );
  const symbol = compatibility?.collection?.symbol || selected?.symbol || "cPEG";
  const cluster = compatibility?.collection?.cluster || selected?.cluster || "devnet";
  const receiveAmount =
    side === "sell"
      ? formatSolAmount(probe?.quote?.out_amount_raw)
      : formatTokenAmount(probe?.quote?.out_amount_raw, compatibility?.token?.decimals);
  const canUseOfficialRouter = Boolean(compatibility?.dex?.official_router.available);
  const tokenReady = Boolean(
    isHybridRoute ||
      (compatibility?.token?.is_token_2022 &&
      compatibility?.hook?.matches_cpeg_program &&
      compatibility?.collection?.collection_exists &&
      compatibility?.collection?.validation_exists)
  );
  const routePair = side === "sell" ? `${symbol} -> SOL` : `SOL -> ${symbol}`;
  const actionDisabled = busy || !mint || !tokenReady || isHybridRoute || (side === "buy" && !canUseOfficialRouter);

  const loadLaunches = useCallback(async () => {
    const response = await fetch("/api/cpeg?limit=50", { cache: "no-store" });
    const payload = await readJson<LaunchPayload>(response);
    const rows = payload?.launches || [];
    setLaunches(rows);
    if (!mint && rows[0]) setMint(rows[0].token_mint);
  }, [mint]);

  const loadReadiness = useCallback(async (targetMint: string, amount: string, routeSide: "buy" | "sell") => {
    if (!targetMint) return;
    const previewAmount = parsePositiveNumber(amount) || (routeSide === "sell" ? 1 : 0.1);
    const selectedLaunch = launches.find((row) => row.token_mint === targetMint);
    if (launches.length === 0) return;
    setLoading(true);
    setError("");
    try {
      if (selectedLaunch?.standard_mode === "metaplex_hybrid") {
        setCompatibility({
          success: true,
          collection: {
            name: selectedLaunch.name,
            symbol: selectedLaunch.symbol,
            mint: selectedLaunch.token_mint,
            cluster: selectedLaunch.cluster,
            max_pegs: selectedLaunch.max_pegs,
            peg_unit_raw: "1000000",
            collection_exists: false,
            validation_exists: false,
          },
          token: { is_token_2022: true, supply_raw: "0", decimals: 6, metadata_address: null },
          hook: { matches_cpeg_program: false },
          dex: {
            official_router: {
              available: false,
              reason: "This cPEG uses the Metaplex hybrid vault. Use capture and release instead of a direct swap route.",
            },
          },
        });
        setProbe({
          success: true,
          side: routeSide,
          supported: true,
          has_route: false,
          reason: "Use the cPEG vault for capture and release.",
        });
        return;
      }
      const [compatRes, dexRes] = await Promise.all([
        fetch(`/api/cpeg/${targetMint}/dex/compatibility`, { cache: "no-store" }),
        fetch(
          routeSide === "sell"
            ? `/api/cpeg/${targetMint}/dex?side=sell&preview_token=${encodeURIComponent(String(previewAmount))}`
            : `/api/cpeg/${targetMint}/dex?side=buy&preview_sol=${encodeURIComponent(String(previewAmount))}`,
          { cache: "no-store" }
        ),
      ]);
      const nextCompatibility = await readJson<CompatibilityPayload>(compatRes);
      const nextProbe = await readJson<DexProbePayload>(dexRes);
      if (!compatRes.ok || !nextCompatibility?.success) {
        throw new Error(nextCompatibility?.error || "Token route data is unavailable.");
      }
      setCompatibility(nextCompatibility);
      setProbe(nextProbe || { success: true, side: routeSide, supported: true, has_route: false, reason: "No route data." });
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [launches]);

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

  useEffect(() => {
    if (!mint || !solanaAddress || side !== "sell") {
      setOwnedPegs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/cpeg/${mint}/pegs?start=0&limit=60&owner=${encodeURIComponent(solanaAddress)}`,
          { cache: "no-store" }
        );
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        const pegs = Array.isArray(body?.pegs)
          ? body.pegs
              .filter((peg: { owner?: string | null }) => peg.owner === solanaAddress)
              .map((peg: { id: number; image: string; owner: string | null }) => ({
                id: peg.id,
                image: peg.image,
                owner: peg.owner,
              }))
          : [];
        setOwnedPegs(pegs);
        if (pegs[0] && !pegs.some((peg: OwnedPeg) => String(peg.id) === pegId)) {
          setPegId(String(pegs[0].id));
        }
      } catch {
        if (!cancelled) setOwnedPegs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mint, pegId, side, solanaAddress]);

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
      if (side === "sell") {
        setStatus("Preparing identity-backed sell route...");
        const sellPrepareResponse = await fetch(`/api/cpeg/${mint}/dex/sell/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seller: solanaAddress,
            peg_id: peg,
            slippage_bps: Number.isInteger(bps) ? bps : 150,
          }),
        });
        const sellPrepare = (await sellPrepareResponse.json()) as SellPreparePayload;
        if (!sellPrepareResponse.ok || !sellPrepare.success || !sellPrepare.listing || !sellPrepare.instructions?.length) {
          throw new Error(sellPrepare.error || "Could not prepare identity-backed sell.");
        }

        const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
        const transaction = new Transaction();
        for (const instruction of sellPrepare.instructions) {
          transaction.add(manifestToInstruction(instruction));
        }

        const latestBlockhash = await connection.getLatestBlockhash("confirmed");
        transaction.feePayer = new PublicKey(solanaAddress);
        transaction.recentBlockhash = latestBlockhash.blockhash;

        setStatus("Waiting for signature...");
        const signed = (await provider.signTransaction(transaction)) as SolanaWeb3Transaction;
        const rawTransaction =
          signed instanceof VersionedTransaction
            ? signed.serialize()
            : signed.serialize({ requireAllSignatures: true, verifySignatures: false });
        const signature = await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          maxRetries: 5,
          preflightCommitment: "confirmed",
        });
        setStatus("Confirming...");
        await connection.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );

        await fetch(`/api/cpeg/${mint}/market/listings/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature,
            ...sellPrepare.listing,
          }),
        }).catch(() => null);

        setLastTx(signature);
        setStatus(`Identity #${peg} is now listed on the cPEG market.`);
        void loadReadiness(mint, payAmount, side);
        return;
      }

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

          {side === "sell" && (
            <div className="mt-2 rounded-lg bg-[#101322] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                  Identity to sell
                </p>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
                  {ownedPegs.length ? `${ownedPegs.length} found` : "market route required"}
                </span>
              </div>
              {ownedPegs.length ? (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {ownedPegs.slice(0, 10).map((peg) => (
                    <button
                      key={peg.id}
                      type="button"
                      onClick={() => setPegId(String(peg.id))}
                      className={clsx(
                        "overflow-hidden rounded-md border bg-black transition",
                        String(peg.id) === pegId ? "border-cyan-400" : "border-white/10 hover:border-white/35"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={peg.image}
                        alt={`${symbol} #${peg.id}`}
                        className="aspect-square w-full object-cover [image-rendering:pixelated]"
                      />
                      <span className="block bg-black px-1 py-1 font-mono text-[9px] text-white/70">
                        #{peg.id}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-white/45">
                  Connect the holder wallet to select a specific PEG before selling tokens.
                </p>
              )}
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
            disabled={actionDisabled}
            className={clsx(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-sm font-black uppercase tracking-wide",
              actionDisabled
                ? "cursor-not-allowed bg-white/10 text-white/35"
                : "bg-orange-600 text-white hover:bg-orange-500"
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {isConnected ? (side === "sell" ? "List identity to sell" : "Swap") : "Connect wallet"}
          </button>
          {isHybridRoute && mint ? (
            <div className="mt-2 grid gap-2">
              <a
                href={`${urls.home.replace(/\/$/, "")}/${encodeURIComponent(mint)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-400/20"
              >
                Open cPEG vault <ExternalLink className="h-3 w-3" />
              </a>
              {isLaunchAuthority ? (
                <a
                  href={`${urls.launch}?mint=${encodeURIComponent(mint)}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-fuchsia-300 transition hover:bg-fuchsia-400/20"
                >
                  Manage launch <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : null}
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
        {isHybridRoute && (
          <p className="mt-4 max-w-[420px] text-center text-xs leading-6 text-neutral-500 dark:text-white/45">
            This cPEG uses a Metaplex vault. Capture whole tokens to receive PEG identities, or release a PEG to reclaim the token.
          </p>
        )}
        {side === "sell" && (
          <p className="mt-4 max-w-[420px] text-center text-xs leading-6 text-neutral-500 dark:text-white/45">
            Selling uses the identity-backed adapter: your selected PEG is escrowed and listed at route-aware pricing.
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
