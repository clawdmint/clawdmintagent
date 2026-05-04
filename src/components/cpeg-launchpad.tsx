"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  PartyPopper,
  RefreshCw,
  Rocket,
} from "lucide-react";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { CpegContractBar } from "@/components/cpeg-contract-bar";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { useCpegSite } from "@/components/cpeg-site-context";
import { bpsToPercent, describeError, explorerTxUrl, truncateAddress } from "@/lib/cpeg-ui";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";

type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

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

interface LaunchPreparePayload {
  success: boolean;
  error?: string;
  launch?: {
    token_mint: string;
    collection_address: string;
    hook_validation_address: string;
    renderer_id: string;
    renderer_version: string;
    renderer_hash: string;
    collection_seed: string;
    renderer_params: Record<string, unknown>;
    max_pegs: number;
    royalty_bps: number;
    marketplace_fee_bps: number;
  };
  token2022_setup?: {
    mint_account_size: number;
    rent_lamports: string;
    instructions: LaunchInstruction[];
  };
  manifest?: {
    program_id: string;
    cluster: "devnet" | "mainnet-beta";
    instructions: LaunchInstruction[];
  };
  fees?: {
    launch_fee_lamports?: string;
    premium_indexing_fee_lamports?: string;
    total_lamports?: string;
  };
}

interface FeeQuote {
  launch: {
    base_lamports: string;
    base_sol: string;
    premium_lamports: string;
    premium_sol: string;
    total_lamports: string;
    total_sol: string;
  };
  rent: {
    lamports: string;
    sol: string;
  };
  total_sol: string;
}

const DEFAULT_FORM = {
  name: "",
  symbol: "",
  subject: "ape",
  palette: "claw",
  accessory: "auto",
  background: "auto",
  vibe: "balanced",
  maxPegs: "1000",
  decimals: "6",
  royaltyBps: "500",
  premiumIndexing: true,
};

const SUBJECT_OPTIONS: Array<[string, string]> = [
  ["ape", "Ape"],
  ["agent", "Agent"],
  ["monkey", "Monkey"],
  ["cat", "Cat"],
  ["dog", "Dog"],
  ["robot", "Robot"],
  ["alien", "Alien"],
  ["dragon", "Dragon"],
  ["frog", "Frog"],
  ["bear", "Bear"],
];

const PALETTE_OPTIONS: Array<[string, string]> = [
  ["claw", "Claw"],
  ["shadow", "Shadow"],
  ["volcanic", "Volcanic"],
  ["cyber", "Cyber"],
  ["candy", "Candy"],
  ["jungle", "Jungle"],
  ["frost", "Frost"],
  ["gold", "Gold"],
  ["emerald", "Emerald"],
  ["monochrome", "Mono"],
];

const ACCESSORY_OPTIONS: Array<[string, string]> = [
  ["auto", "Auto"],
  ["none", "Bare"],
  ["wizard_hat", "Wizard Hat"],
  ["fire_mohawk", "Fire Mohawk"],
  ["gold_chain", "Gold Chain"],
  ["crown", "Crown"],
  ["halo", "Halo"],
  ["visor", "Visor"],
  ["bandanna", "Bandanna"],
  ["samurai_helm", "Samurai Helm"],
  ["headphones", "Headphones"],
  ["signal_horns", "Signal Horns"],
  ["ninja_mask", "Ninja Mask"],
];

const BACKGROUND_OPTIONS: Array<[string, string]> = [
  ["auto", "Auto"],
  ["solid", "Solid"],
  ["stars", "Stars"],
  ["grid", "Grid"],
  ["vignette", "Vignette"],
  ["dust", "Dust"],
  ["horizon", "Horizon"],
];

const VIBE_OPTIONS: Array<[string, string]> = [
  ["balanced", "Balanced"],
  ["loud", "Loud"],
  ["holy", "Holy"],
  ["dark", "Dark"],
];

const PREVIEW_PEG_IDS = [1, 7, 23, 47, 88, 142];

const SUGGESTED_NAMES = [
  ["Claw Apes", "CLAWAPE", "ape", "claw"],
  ["Shadow Pack", "SHDW", "ape", "shadow"],
  ["Volcanic Tribe", "VOLT", "ape", "volcanic"],
  ["Cyber Agents", "CYAGT", "agent", "cyber"],
  ["Frost Wardens", "FROST", "ape", "frost"],
  ["Gold Standard", "GLD", "ape", "gold"],
];

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

function getClientRpcUrl(cluster: "devnet" | "mainnet-beta") {
  const configured =
    process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] ||
    process.env["NEXT_PUBLIC_SOLANA_BROWSER_RPC_URL"];
  if (configured) return configured;
  return clusterApiUrl(cluster);
}

function lamportsToSolDisplay(value?: string) {
  if (!value) return "0";
  return (Number(value) / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

interface LaunchResult {
  signature: string;
  cluster: "devnet" | "mainnet-beta";
  mint: string;
  collection: string;
  validation: string;
  rendererHash: string;
}

export function CpegLaunchpad() {
  const { solanaAddress, isConnected, login } = useWallet();
  const isCpegSite = useCpegSite();
  const cpegUrls = useMemo(() => cpegPublicPaths(isCpegSite), [isCpegSite]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);

  const connectedAddress = solanaAddress || "";

  const normalizedSymbol = useMemo(() => form.symbol.trim().toUpperCase(), [form.symbol]);
  const symbolValid = useMemo(() => /^[A-Z0-9]{1,12}$/.test(normalizedSymbol), [normalizedSymbol]);
  const nameValid = form.name.trim().length >= 2;
  const maxPegsNumber = useMemo(() => Number.parseInt(form.maxPegs, 10), [form.maxPegs]);
  const maxPegsValid = Number.isFinite(maxPegsNumber) && maxPegsNumber > 0 && maxPegsNumber <= 1_000_000;
  const decimalsNumber = useMemo(() => Number.parseInt(form.decimals, 10), [form.decimals]);
  const decimalsValid = Number.isFinite(decimalsNumber) && decimalsNumber >= 0 && decimalsNumber <= 9;
  const royaltyNumber = useMemo(() => Number.parseInt(form.royaltyBps, 10), [form.royaltyBps]);
  const royaltyValid = Number.isFinite(royaltyNumber) && royaltyNumber >= 0 && royaltyNumber <= 1500;

  const formValid = nameValid && symbolValid && maxPegsValid && decimalsValid && royaltyValid;
  const canLaunch = Boolean(connectedAddress) && formValid;

  const previewQuery = useMemo(() => {
    const params = new URLSearchParams({
      subject: form.subject,
      palette: form.palette,
      accessory: form.accessory,
      background: form.background,
      vibe: form.vibe,
    });
    return params.toString();
  }, [form.accessory, form.background, form.palette, form.subject, form.vibe]);

  // Fetch the live fee quote so that the user sees the actual launch cost before signing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cpeg");
        const body = (await response.json().catch(() => null)) as
          | { success?: boolean; fees?: { launch?: Record<string, string> } }
          | null;
        if (cancelled || !body?.success) return;
        const launch = body.fees?.launch as
          | {
              base_lamports?: string;
              premium_lamports?: string;
              total_lamports?: string;
              base_sol?: string;
              premium_sol?: string;
              total_sol?: string;
            }
          | undefined;
        const rentLamports = (body.fees as { rent_lamports?: string } | undefined)?.rent_lamports;
        if (launch?.total_lamports) {
          setFeeQuote({
            launch: {
              base_lamports: launch.base_lamports || "0",
              base_sol: launch.base_sol || "0",
              premium_lamports: launch.premium_lamports || "0",
              premium_sol: launch.premium_sol || "0",
              total_lamports: launch.total_lamports,
              total_sol: launch.total_sol || lamportsToSolDisplay(launch.total_lamports),
            },
            rent: {
              lamports: rentLamports || "0",
              sol: lamportsToSolDisplay(rentLamports),
            },
            total_sol: lamportsToSolDisplay(
              (BigInt(launch.total_lamports || "0") + BigInt(rentLamports || "0")).toString()
            ),
          });
        }
      } catch {
        // Quote is decorative; ignore failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyValue = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value).catch(() => {});
  }, []);

  const updateForm = useCallback(<K extends keyof typeof DEFAULT_FORM>(key: K, value: (typeof DEFAULT_FORM)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const handleLaunch = useCallback(async () => {
    setError("");
    setStatus("");
    setResult(null);

    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!canLaunch) {
      setError("Please complete the form before launching.");
      return;
    }

    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      setError("Phantom transaction signing is unavailable.");
      return;
    }

    setLaunching(true);
    try {
      const mint = Keypair.generate();
      setStatus("Preparing cPEG launch manifest…");
      const prepareResponse = await fetch("/api/cpeg/launchpad/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          symbol: normalizedSymbol,
          token_mint: mint.publicKey.toBase58(),
          authority_address: connectedAddress,
          max_pegs: maxPegsNumber,
          decimals: decimalsNumber,
          royalty_bps: royaltyNumber,
          premium_indexing: form.premiumIndexing,
          renderer_params: {
            subject: form.subject,
            palette: form.palette,
            accessory: form.accessory,
            background: form.background,
            vibe: form.vibe,
          },
        }),
      });
      const prepareBody = (await prepareResponse.json().catch(() => null)) as LaunchPreparePayload | null;
      if (
        !prepareResponse.ok ||
        !prepareBody?.success ||
        !prepareBody.token2022_setup ||
        !prepareBody.manifest ||
        !prepareBody.launch
      ) {
        throw new Error(prepareBody?.error || "Failed to prepare launch transaction.");
      }

      setStatus("Opening Phantom for launch signature…");
      const cluster = prepareBody.manifest.cluster;
      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const transaction = new Transaction();
      for (const instruction of [
        ...prepareBody.token2022_setup.instructions,
        ...prepareBody.manifest.instructions,
      ]) {
        transaction.add(manifestToInstruction(instruction));
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = new PublicKey(connectedAddress);
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.partialSign(mint);

      const signedTransaction = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
      const rawTransaction =
        signedTransaction instanceof VersionedTransaction
          ? signedTransaction.serialize()
          : signedTransaction.serialize({ requireAllSignatures: true, verifySignatures: false });

      setStatus("Broadcasting cPEG launch transaction…");
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      await fetch("/api/cpeg/launchpad/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          symbol: normalizedSymbol,
          signature,
          token_mint: prepareBody.launch.token_mint,
          collection_address: prepareBody.launch.collection_address,
          hook_validation_address: prepareBody.launch.hook_validation_address,
          renderer_id: prepareBody.launch.renderer_id,
          renderer_version: prepareBody.launch.renderer_version,
          renderer_params: prepareBody.launch.renderer_params,
        }),
      }).catch(() => null);

      setResult({
        signature,
        cluster,
        mint: prepareBody.launch.token_mint,
        collection: prepareBody.launch.collection_address,
        validation: prepareBody.launch.hook_validation_address,
        rendererHash: prepareBody.launch.renderer_hash,
      });
      setStatus("");
    } catch (launchError) {
      setError(describeError(launchError, "Failed to launch cPEG."));
      setStatus("");
    } finally {
      setLaunching(false);
    }
  }, [
    canLaunch,
    connectedAddress,
    decimalsNumber,
    form.accessory,
    form.background,
    form.name,
    form.palette,
    form.premiumIndexing,
    form.subject,
    form.vibe,
    isConnected,
    login,
    maxPegsNumber,
    normalizedSymbol,
    royaltyNumber,
  ]);

  if (result) {
    return (
      <section className="border-y border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#101010]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-[1fr_420px] md:px-10 md:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">Launch confirmed</p>
            <h2 className="mt-4 flex items-center gap-3 text-4xl font-black uppercase leading-none md:text-5xl">
              <PartyPopper className="h-10 w-10 text-[#53c7ff]" />
              {form.name || "cPEG"} is live.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-700 dark:text-white/70">
              Token-2022 mint, transfer hook, and PEG registry are all on-chain. The
              contract address below is your asset. Share it like any token CA.
            </p>

            <div className="mt-7">
              <CpegContractBar
                tokenMint={result.mint}
                cluster={result.cluster}
                symbol={form.symbol || "CPEG"}
              />
            </div>

            <div className="mt-6 grid gap-2 font-mono text-xs text-neutral-700 dark:text-white/72">
              {[
                ["Token mint", result.mint],
                ["Collection PDA", result.collection],
                ["Validation PDA", result.validation],
                ["Renderer hash", result.rendererHash],
              ].map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => copyValue(value)}
                  className="group flex items-center justify-between gap-3 border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/40 px-3 py-2 text-left transition hover:border-[#53c7ff]/40"
                >
                  <span className="text-neutral-500 dark:text-white/40">{label}</span>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{truncateAddress(value, 8, 8)}</span>
                    <Copy className="h-3 w-3 text-neutral-500 dark:text-white/35 transition group-hover:text-[#53c7ff]" />
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={cpegUrls.collection(result.mint)}
                className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
              >
                Open collection <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={explorerTxUrl(result.signature, result.cluster)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-neutral-400 dark:border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wide text-neutral-950 dark:text-white transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
              >
                View transaction <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="border border-[#53c7ff]/35 bg-[#53c7ff]/10 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">Genesis preview</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((pegId) => (
                <div key={pegId} className="aspect-square overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cpeg/preview/svg?pegId=${pegId}&${previewQuery}`}
                    alt={`${form.symbol || "cPEG"} preview #${pegId}`}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const randomize = () => {
    const random = <T,>(arr: Array<[string, T]>) => arr[Math.floor(Math.random() * arr.length)][0];
    updateForm("subject", random(SUBJECT_OPTIONS));
    updateForm("palette", random(PALETTE_OPTIONS));
    updateForm("accessory", random(ACCESSORY_OPTIONS.filter(([v]) => v !== "auto")));
    updateForm("background", random(BACKGROUND_OPTIONS.filter(([v]) => v !== "auto")));
    updateForm("vibe", random(VIBE_OPTIONS));
  };

  const applyPreset = (name: string, symbol: string, subject: string, palette: string) => {
    updateForm("name", name);
    updateForm("symbol", symbol);
    updateForm("subject", subject);
    updateForm("palette", palette);
  };

  return (
    <section className="border-y border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0a0a0a]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.1fr_0.9fr] md:px-10 md:py-14">
        <div className="space-y-5">
          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Identity</p>
              <button
                type="button"
                onClick={randomize}
                className="inline-flex items-center gap-1.5 border border-neutral-300 dark:border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 dark:text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
              >
                <RefreshCw className="h-3 w-3" /> Randomize art
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Name"
                value={form.name}
                onChange={(value) => updateForm("name", value)}
                placeholder="Claw Apes"
                error={!nameValid && form.name.length > 0 ? "At least 2 characters." : ""}
              />
              <Field
                label="Symbol"
                value={form.symbol}
                onChange={(value) => updateForm("symbol", value.toUpperCase())}
                placeholder="CLAWAPE"
                error={!symbolValid && form.symbol.length > 0 ? "1-12 chars, A-Z 0-9." : ""}
              />
              <Field
                label="Max PEGs"
                value={form.maxPegs}
                onChange={(value) => updateForm("maxPegs", value)}
                inputMode="numeric"
                error={!maxPegsValid && form.maxPegs.length > 0 ? "1 to 1,000,000." : ""}
              />
              <Field
                label="Decimals"
                value={form.decimals}
                onChange={(value) => updateForm("decimals", value)}
                inputMode="numeric"
                error={!decimalsValid && form.decimals.length > 0 ? "0 to 9." : ""}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTED_NAMES.map(([name, symbol, subject, palette]) => (
                <button
                  key={`${name}-${symbol}`}
                  type="button"
                  onClick={() => applyPreset(name, symbol, subject, palette)}
                  className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55 transition hover:border-[#53c7ff]/50 hover:text-[#53c7ff]"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Art</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Select label="Subject" value={form.subject} onChange={(value) => updateForm("subject", value)} options={SUBJECT_OPTIONS} />
              <Select label="Palette" value={form.palette} onChange={(value) => updateForm("palette", value)} options={PALETTE_OPTIONS} />
              <Select label="Accessory" value={form.accessory} onChange={(value) => updateForm("accessory", value)} options={ACCESSORY_OPTIONS} />
              <Select label="Background" value={form.background} onChange={(value) => updateForm("background", value)} options={BACKGROUND_OPTIONS} />
              <Select label="Vibe" value={form.vibe} onChange={(value) => updateForm("vibe", value)} options={VIBE_OPTIONS} />
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Economics</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Creator royalty (bps)"
                value={form.royaltyBps}
                onChange={(value) => updateForm("royaltyBps", value)}
                inputMode="numeric"
                hint={`${bpsToPercent(royaltyNumber)} of every fill.`}
                error={!royaltyValid && form.royaltyBps.length > 0 ? "0 to 1500 bps." : ""}
              />
              <label className="flex items-start gap-3 border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-4">
                <input
                  type="checkbox"
                  checked={form.premiumIndexing}
                  onChange={(event) => updateForm("premiumIndexing", event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#53c7ff]"
                />
                <span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                    Premium indexing
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-neutral-700 dark:text-white/55">
                    Rarity views and faster renderer APIs.
                  </span>
                </span>
              </label>
            </div>

            {feeQuote ? (
              <div className="mt-5 grid gap-2 border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/40 p-4 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                <Row label="Launch fee" value={`${feeQuote.launch.base_sol} SOL`} />
                {form.premiumIndexing && BigInt(feeQuote.launch.premium_lamports) > BigInt(0) ? (
                  <Row label="Premium" value={`${feeQuote.launch.premium_sol} SOL`} />
                ) : null}
                {BigInt(feeQuote.rent.lamports) > BigInt(0) ? (
                  <Row label="Mint rent" value={`${feeQuote.rent.sol} SOL`} muted />
                ) : null}
                <Row
                  label="Total"
                  value={`${
                    form.premiumIndexing ? feeQuote.launch.total_sol : feeQuote.launch.base_sol
                  } SOL + rent`}
                  highlight
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#53c7ff]">Live preview</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                v0.3.0
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {PREVIEW_PEG_IDS.map((pegId) => (
                <div
                  key={pegId}
                  className="relative aspect-square overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cpeg/preview/svg?pegId=${pegId}&${previewQuery}`}
                    alt={`Preview #${pegId}`}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                  />
                  <span className="absolute bottom-1 left-1 bg-neutral-900/70 dark:bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-neutral-700 dark:text-white/70">
                    #{pegId}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#0c0c0c] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">Wallet</p>
                <p className="mt-1 font-mono text-sm text-neutral-950 dark:text-white">
                  {connectedAddress ? truncateAddress(connectedAddress, 6, 6) : "Not connected"}
                </p>
              </div>
              <button
                type="button"
                onClick={isConnected ? handleLaunch : login}
                disabled={launching || (isConnected && !canLaunch)}
                className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {isConnected ? "Launch cPEG" : "Connect Phantom"}
              </button>
            </div>
            {status ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[#53c7ff]">
                <Loader2 className="h-3 w-3 animate-spin" /> {status}
              </p>
            ) : null}
            {error ? (
              <div className="mt-3 border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">
                {error}
              </div>
            ) : null}
            {!error && !status && isConnected && !canLaunch ? (
              <p className="mt-3 text-[11px] text-neutral-500 dark:text-white/45">Complete the form to launch.</p>
            ) : null}
            {!isConnected ? (
              <p className="mt-3 text-[11px] text-neutral-700 dark:text-white/55">Connect Phantom on devnet or mainnet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  inputMode?: "text" | "numeric" | "decimal";
}

function Field({ label, value, onChange, placeholder, hint, error, inputMode }: FieldProps) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 w-full border bg-neutral-50 dark:bg-white/[0.04] px-3 py-3 text-sm text-neutral-950 dark:text-white outline-none transition focus:border-[#53c7ff] ${
          error ? "border-red-400/60" : "border-neutral-300 dark:border-white/12"
        }`}
      />
      {error ? (
        <span className="mt-1 block text-[10px] text-red-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[10px] text-neutral-500 dark:text-white/40">{hint}</span>
      ) : null}
    </label>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full border border-neutral-300 dark:border-white/12 bg-neutral-100 dark:bg-[#151515] px-3 py-3 text-sm text-neutral-950 dark:text-white outline-none transition focus:border-[#53c7ff]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

interface RowProps {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}

function Row({ label, value, highlight, muted }: RowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-neutral-500 dark:text-white/35" : "text-neutral-700 dark:text-white/55"}>{label}</span>
      <span className={highlight ? "text-[#53c7ff]" : muted ? "text-neutral-700 dark:text-white/55" : "text-neutral-900 dark:text-[#f7f2df]"}>{value}</span>
    </div>
  );
}
