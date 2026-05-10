"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  Layers,
  type LucideIcon,
  Loader2,
  PackageOpen,
  Rocket,
  ShieldCheck,
  Tag,
} from "lucide-react";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { useCpegSite } from "@/components/cpeg-site-context";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";
import { describeError, explorerTxUrl, truncateAddress } from "@/lib/cpeg-ui";

type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

interface ManifestAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface ManifestInstruction {
  programId: string;
  accounts: ManifestAccount[];
  dataBase64: string;
}

interface HybridLaunchState {
  id: string;
  token_mint: string;
  symbol: string;
  name: string;
  cluster: string;
  hybrid_status: string;
  collection_address: string | null;
  mpl_hybrid_escrow_address?: string | null;
  mpl_hybrid_escrow_account_initialized?: boolean;
  mpl_hybrid_escrow_account_owner?: string | null;
  mpl_hybrid_escrow_token_account?: string | null;
  mpl_hybrid_escrow_token_account_initialized?: boolean;
  mpl_hybrid_native_ready?: boolean;
  vault_token_account: string | null;
  vault_owner: string | null;
  custody_model?: string | null;
  target_custody_model?: string | null;
  custody_warning?: string | null;
  token_program_id: string | null;
  total_assets: number;
  owned_assets: number;
  pool_assets: number;
  vault_token_balance_raw: string;
  vault_token_balance_whole: number;
  token_supply_raw: string;
  decimals: number;
  max_pegs: number;
  effective_max_pegs: number;
  available_capacity: number;
  burned_capacity: number;
  peg_unit_raw: string;
}

interface HybridWalletAsset {
  asset_address: string;
  peg_id: number;
  status: string;
  captured_at: string | null;
}

interface HybridProtocolFees {
  enabled: boolean;
  recipient: string | null;
  captureLamports: string;
  releaseLamports: string;
  listLamports: string;
  mplHybridProtocolFeeLamports: string;
}

interface HybridStateResponse {
  success: boolean;
  launch?: HybridLaunchState;
  protocol_fees?: HybridProtocolFees;
  wallet_assets?: HybridWalletAsset[];
  error?: string;
}

interface HybridErrorDetails {
  balance_sol?: number;
  required_sol?: number;
  wallet_address?: string;
}

export interface CpegHybridPanelProps {
  tokenMint: string;
  initialAuthorityAddress?: string | null;
  compact?: boolean;
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
}

function formatSimulationError(action: "capture" | "release", err: unknown, logs: string[]): string {
  let message: string;
  if (typeof err === "string") {
    message = err;
  } else if (err && typeof err === "object") {
    try {
      message = JSON.stringify(err);
    } catch {
      message = String(err);
    }
  } else {
    message = String(err);
  }
  const interestingLog = logs.find(
    (line) =>
      /insufficient funds|insufficient lamports|invalid mint|invalid account|InvalidMintAccount|InvalidProjectFeeWallet|GetAccountDataSize|Neither the asset|0x1$|0x0$|Program log: Error|custom program error|failed/i.test(
        line
      )
  );
  const detail = interestingLog ? ` (${interestingLog.replace("Program log: ", "")})` : "";
  return `[${action}-sim]${action === "capture" ? "Capture" : "Release"} would be rejected on-chain: ${message}${detail}`;
}

async function formatBroadcastError(error: unknown, connection: InstanceType<typeof Connection>, fallback: string) {
  const maybeLogs =
    error && typeof error === "object" && "getLogs" in error && typeof (error as { getLogs?: unknown }).getLogs === "function"
      ? await (error as { getLogs: (connection: InstanceType<typeof Connection>) => Promise<string[] | null> })
          .getLogs(connection)
          .catch(() => null)
      : null;
  const logs = maybeLogs || [];
  const usefulLogs = logs.filter((line) =>
    /Program log: Error|custom program error|Invalid|insufficient|owner|authority|mint|account|GetAccountDataSize|failed/i.test(line)
  );
  if (usefulLogs.length) {
    return `${fallback} ${usefulLogs.slice(-3).map((line) => line.replace("Program log: ", "")).join(" | ")}`;
  }
  return describeError(error, fallback);
}

function manifestToInstruction(instruction: ManifestInstruction) {
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
  const configured =
    process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] ||
    process.env["NEXT_PUBLIC_SOLANA_BROWSER_RPC_URL"];
  if (configured) return configured;
  return clusterApiUrl(cluster === "devnet" ? "devnet" : "mainnet-beta");
}

function formatHybridError(error: string, details?: HybridErrorDetails | null) {
  if (!details?.required_sol) return error;
  const current = typeof details.balance_sol === "number" ? details.balance_sol.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "--";
  const required = details.required_sol.toLocaleString(undefined, { maximumFractionDigits: 6 });
  const wallet = details.wallet_address ? ` Agent wallet: ${truncateAddress(details.wallet_address, 6, 6)}.` : "";
  return `${error}. Required: ${required} SOL. Current: ${current} SOL.${wallet}`;
}

function formatRawTokenAmount(raw: string | bigint, decimals: number, symbol: string) {
  let value: bigint;
  try {
    value = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  } catch {
    value = BigInt(0);
  }
  const scale = BigInt(`1${"0".repeat(Math.max(0, decimals || 0))}`);
  const whole = value / scale;
  const fraction = value % scale;
  const fractionText = decimals > 0 ? fraction.toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  const compactWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${compactWhole}${fractionText ? `.${fractionText.slice(0, 6)}` : ""} ${symbol}`;
}

export function CpegHybridPanel({ tokenMint, initialAuthorityAddress, compact }: CpegHybridPanelProps) {
  const site = useCpegSite();
  const urls = useMemo(() => cpegPublicPaths(site), [site]);
  const { solanaAddress, isConnected, login } = useWallet();
  const [state, setState] = useState<HybridLaunchState | null>(null);
  const [walletAssets, setWalletAssets] = useState<HybridWalletAsset[]>([]);
  const [protocolFees, setProtocolFees] = useState<HybridProtocolFees | null>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState("");
  const [captureCount, setCaptureCount] = useState("1");

  const connectedAddress = solanaAddress || "";
  const isAuthority = useMemo(() => {
    return Boolean(initialAuthorityAddress && connectedAddress && connectedAddress === initialAuthorityAddress);
  }, [connectedAddress, initialAuthorityAddress]);

  const refreshState = useCallback(
    async (silent?: boolean) => {
      if (!silent) setStateLoading(true);
      try {
        const params = new URLSearchParams();
        if (connectedAddress) params.set("wallet", connectedAddress);
        const response = await fetch(`/api/cpeg/${tokenMint}/hybrid/state?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as HybridStateResponse | null;
        if (response.ok && body?.success && body.launch) {
          setState(body.launch);
          setWalletAssets(body.wallet_assets || []);
          setProtocolFees(body.protocol_fees || null);
        }
      } catch {
        // ignore; UI will show last known state
      } finally {
        if (!silent) setStateLoading(false);
      }
    },
    [connectedAddress, tokenMint]
  );

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const handleSetup = useCallback(async () => {
    setSetupError("");
    setError("");
    setStatus("");
    if (!isConnected) {
      login();
      return;
    }
    setSetupBusy(true);
    try {
      const alreadyConfigured = state?.hybrid_status === "HYBRID_CONFIGURED";
      setStatus(alreadyConfigured ? "Migrating to Metaplex Hybrid escrow..." : "Enabling cPEG...");
      const response = await fetch(`/api/cpeg/${tokenMint}/hybrid/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority_address: connectedAddress }),
      });
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string; details?: HybridErrorDetails }
        | null;
      if (!response.ok || !body?.success) {
        throw new Error(formatHybridError(body?.error || "Failed to enable cPEG.", body?.details));
      }
      await refreshState();
      setStatus(alreadyConfigured ? "Metaplex Hybrid escrow is active." : "cPEG is enabled.");
    } catch (cause) {
      const alreadyConfigured = state?.hybrid_status === "HYBRID_CONFIGURED";
      const message = describeError(cause, alreadyConfigured ? "Failed to migrate escrow." : "Failed to enable cPEG.");
      setSetupError(message);
      setError(message);
    } finally {
      setSetupBusy(false);
    }
  }, [connectedAddress, isConnected, login, refreshState, state?.hybrid_status, tokenMint]);

  const handleCapture = useCallback(async () => {
    setError("");
    setStatus("");
    setLastTx("");
    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!state) return;
    const count = Math.max(1, Math.min(8, Number.parseInt(captureCount, 10) || 1));
    setActionBusy("capture");
    try {
      setStatus(`Preparing capture of ${count} cPEG...`);
      const prepareResponse = await fetch(`/api/cpeg/${tokenMint}/hybrid/capture/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: connectedAddress, count }),
      });
      const prepareBody = (await prepareResponse.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            instructions?: ManifestInstruction[];
            serialized_transaction_base64?: string;
            capture?: {
              cluster: string;
              assets?: Array<{ asset_address: string; peg_id: number }>;
              serialized_transaction_base64?: string;
            };
          }
        | null;
      if (!prepareResponse.ok || !prepareBody?.success || !prepareBody.instructions) {
        throw new Error(prepareBody?.error || "Failed to prepare capture transfer.");
      }

      const provider = getPhantomProvider();
      if (!provider?.signTransaction) throw new Error("Phantom signing is unavailable.");

      const cluster = prepareBody.capture?.cluster || state.cluster;
      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const preparedTransaction =
        prepareBody.serialized_transaction_base64 || prepareBody.capture?.serialized_transaction_base64 || "";
      const transaction = preparedTransaction ? Transaction.from(base64ToBytes(preparedTransaction)) : new Transaction();
      let latest: { blockhash: string; lastValidBlockHeight: number } | null = null;
      if (!preparedTransaction) {
        for (const ix of prepareBody.instructions) transaction.add(manifestToInstruction(ix));
        const freshBlockhash = await connection.getLatestBlockhash("confirmed");
        latest = freshBlockhash;
        transaction.feePayer = new PublicKey(connectedAddress);
        transaction.recentBlockhash = freshBlockhash.blockhash;
      }

      setStatus("Opening Phantom for capture approval...");
      const signed = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
      const raw = signed instanceof VersionedTransaction
        ? signed.serialize()
        : signed.serialize({ requireAllSignatures: true, verifySignatures: false });

      // Run a server-side simulation first so we can surface the exact program
      // error / instruction logs back to the user instead of the generic
      // "On-chain rejected" message that comes from sendRawTransaction failures.
      setStatus("Simulating capture transfer...");
      try {
        const sim = signed instanceof VersionedTransaction
          ? await connection.simulateTransaction(signed, { sigVerify: false, commitment: "confirmed" })
          : await connection.simulateTransaction(signed as InstanceType<typeof Transaction>, undefined, true);
        if (sim.value.err) {
          throw new Error(formatSimulationError("capture", sim.value.err, sim.value.logs || []));
        }
      } catch (simError) {
        if (simError instanceof Error && simError.message.startsWith("[capture-sim]")) {
          throw simError;
        }
        // Network-level simulation failure should not block; keep going and let
        // sendRawTransaction surface its own error.
      }

      setStatus("Broadcasting capture transfer...");
      let signature = "";
      try {
        signature = await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          maxRetries: 5,
          preflightCommitment: "confirmed",
        });
      } catch (sendError) {
        throw new Error(await formatBroadcastError(sendError, connection, "Capture was rejected on-chain."));
      }
      if (latest) {
        await connection.confirmTransaction(
          { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
          "confirmed"
        );
      } else {
        await connection.confirmTransaction(signature, "confirmed");
      }
      setLastTx(signature);

      setStatus("Minting your Metaplex Core PEG identities...");
      const confirmResponse = await fetch(`/api/cpeg/${tokenMint}/hybrid/capture/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: connectedAddress,
          signature,
          count,
          asset_addresses: prepareBody.capture?.assets?.map((asset) => asset.asset_address) || undefined,
        }),
      });
      const confirmBody = (await confirmResponse.json().catch(() => null)) as
        | { success?: boolean; error?: string; details?: HybridErrorDetails }
        | null;
      if (!confirmResponse.ok || !confirmBody?.success) {
        throw new Error(
          formatHybridError(
            confirmBody?.error || "Capture transfer was confirmed, but minting failed.",
            confirmBody?.details
          )
        );
      }
      await refreshState();
      setStatus(`Captured ${count} cPEG.`);
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : "";
      // Already-detailed messages (from our backend or from simulation) should
      // pass through unchanged; only fall back to the friendly mapper when we
      // do not already have a useful sentence to show.
      if (message.startsWith("[capture-sim]")) {
        setError(message.replace("[capture-sim]", "").trim());
      } else if (message && message.length > 0 && !/program error/i.test(message)) {
        setError(message.length > 220 ? `${message.slice(0, 220)}...` : message);
      } else {
        setError(describeError(captureError, "Failed to capture cPEG."));
      }
    } finally {
      setActionBusy(null);
    }
  }, [captureCount, connectedAddress, isConnected, login, refreshState, state, tokenMint]);

  const handleRelease = useCallback(
    async (asset: HybridWalletAsset) => {
      setError("");
      setStatus("");
      setLastTx("");
      if (!isConnected || !connectedAddress) {
        login();
        return;
      }
      if (!state || !state.collection_address) {
        setError("cPEG is not enabled for this launch yet.");
        return;
      }
      const provider = getPhantomProvider();
      if (!provider?.signTransaction) {
        setError("Phantom signing is unavailable.");
        return;
      }
      setActionBusy(`release-${asset.asset_address}`);
      try {
        setStatus(`Preparing release for cPEG #${asset.peg_id}...`);
        const prepareResponse = await fetch(`/api/cpeg/${tokenMint}/hybrid/release/prepare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: connectedAddress, asset_address: asset.asset_address }),
        });
        const prepareBody = (await prepareResponse.json().catch(() => null)) as
          | {
              success?: boolean;
              error?: string;
              serialized_transaction_base64?: string;
              release?: {
                target_owner: string;
                collection_address: string;
                serialized_transaction_base64?: string;
              };
              instructions?: ManifestInstruction[];
            }
          | null;
        if (!prepareResponse.ok || !prepareBody?.success || !prepareBody.release || !prepareBody.instructions) {
          throw new Error(prepareBody?.error || "Failed to prepare release.");
        }

        const cluster = state.cluster || "mainnet-beta";
        const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
        const preparedTransaction =
          prepareBody.serialized_transaction_base64 || prepareBody.release?.serialized_transaction_base64 || "";
        const transaction = preparedTransaction ? Transaction.from(base64ToBytes(preparedTransaction)) : new Transaction();
        let latest: { blockhash: string; lastValidBlockHeight: number } | null = null;
        if (!preparedTransaction) {
          for (const ix of prepareBody.instructions) transaction.add(manifestToInstruction(ix));
          const freshBlockhash = await connection.getLatestBlockhash("confirmed");
          latest = freshBlockhash;
          transaction.feePayer = new PublicKey(connectedAddress);
          transaction.recentBlockhash = freshBlockhash.blockhash;
        }
        setStatus("Opening Phantom for release approval...");
        const signed = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
        const raw = signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize({ requireAllSignatures: true, verifySignatures: false });
        setStatus("Simulating release transfer...");
        try {
          const sim = signed instanceof VersionedTransaction
            ? await connection.simulateTransaction(signed, { sigVerify: false, commitment: "confirmed" })
            : await connection.simulateTransaction(signed as InstanceType<typeof Transaction>, undefined, true);
          if (sim.value.err) {
            throw new Error(formatSimulationError("release", sim.value.err, sim.value.logs || []));
          }
        } catch (simError) {
          if (simError instanceof Error && simError.message.startsWith("[release-sim]")) {
            throw simError;
          }
        }
        setStatus("Broadcasting release transfer...");
        let releaseSignature = "";
        try {
          releaseSignature = await connection.sendRawTransaction(raw, {
            skipPreflight: false,
            maxRetries: 5,
            preflightCommitment: "confirmed",
          });
        } catch (sendError) {
          throw new Error(await formatBroadcastError(sendError, connection, "Release was rejected on-chain."));
        }
        if (latest) {
          await connection.confirmTransaction(
            { signature: releaseSignature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
            "confirmed"
          );
        } else {
          await connection.confirmTransaction(releaseSignature, "confirmed");
        }
        setLastTx(releaseSignature);

        setStatus("Settling token payout...");
        const confirmResponse = await fetch(`/api/cpeg/${tokenMint}/hybrid/release/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: connectedAddress,
            asset_address: asset.asset_address,
            release_signature: releaseSignature,
          }),
        });
        const confirmBody = (await confirmResponse.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!confirmResponse.ok || !confirmBody?.success) {
          throw new Error(confirmBody?.error || "Asset transfer was confirmed, but token payout failed.");
        }
        await refreshState();
        setStatus(`Released cPEG #${asset.peg_id}.`);
      } catch (releaseError) {
        const message = releaseError instanceof Error ? releaseError.message : "";
        if (message.startsWith("[release-sim]")) {
          setError(message.replace("[release-sim]", "").trim());
        } else if (message && message.length > 0 && !/program error/i.test(message)) {
          setError(message.length > 220 ? `${message.slice(0, 220)}...` : message);
        } else {
          setError(describeError(releaseError, "Failed to release cPEG."));
        }
      } finally {
        setActionBusy(null);
      }
    },
    [connectedAddress, isConnected, login, refreshState, state, tokenMint]
  );

  if (stateLoading && !state) {
    return (
      <div className="border border-neutral-200 bg-neutral-100 p-5 text-sm text-neutral-600 dark:border-white/10 dark:bg-[#0c0c0c] dark:text-white/55">
        <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" /> Loading cPEG state...
      </div>
    );
  }

  if (!state) {
    return null;
  }

  const setupComplete = state.hybrid_status === "HYBRID_CONFIGURED";
  const mainnetEscrowBlocked = state.cluster === "mainnet-beta" && state.mpl_hybrid_native_ready !== true;
  const setupNeedsFinalize =
    setupComplete &&
    state.cluster === "mainnet-beta" &&
    state.mpl_hybrid_escrow_address &&
    (state.mpl_hybrid_escrow_account_initialized === false ||
      state.mpl_hybrid_escrow_token_account_initialized === false);
  const captureCountNumber = Math.max(1, Math.min(8, Number.parseInt(captureCount, 10) || 1));
  const requiredRaw = (() => {
    try {
      return BigInt(state.peg_unit_raw || "0") * BigInt(captureCountNumber);
    } catch {
      return BigInt(0);
    }
  })();
  const backingUnitLabel = formatRawTokenAmount(state.peg_unit_raw, state.decimals, state.symbol);
  const requiredLabel = formatRawTokenAmount(requiredRaw, state.decimals, state.symbol);
  const supplyLabel = formatRawTokenAmount(state.token_supply_raw, state.decimals, state.symbol);
  const collectionHref = urls.collection(tokenMint);
  const marketHref = urls.market({ mint: tokenMint });

  const formatSolFromLamports = (raw: string | undefined | null) => {
    if (!raw) return "0";
    try {
      const lamports = BigInt(raw);
      if (lamports === BigInt(0)) return "0";
      const whole = lamports / BigInt(1_000_000_000);
      const fraction = lamports % BigInt(1_000_000_000);
      if (fraction === BigInt(0)) return whole.toString();
      return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")}`;
    } catch {
      return "0";
    }
  };
  const captureFeeTotalSol = (() => {
    try {
      const clawd = BigInt(protocolFees?.captureLamports || "0") * BigInt(captureCountNumber);
      const mpl = BigInt(protocolFees?.mplHybridProtocolFeeLamports || "0") * BigInt(captureCountNumber);
      return formatSolFromLamports((clawd + mpl).toString());
    } catch {
      return "0";
    }
  })();
  const releaseFeeTotalSol = (() => {
    try {
      const clawd = BigInt(protocolFees?.releaseLamports || "0");
      const mpl = BigInt(protocolFees?.mplHybridProtocolFeeLamports || "0");
      return formatSolFromLamports((clawd + mpl).toString());
    } catch {
      return "0";
    }
  })();

  return (
    <section
      className={`border border-[#53c7ff]/30 bg-[#0c1722] p-5 ${
        compact ? "" : "md:p-7"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">
            Token backed cPEG
          </p>
          <p className="mt-2 text-lg font-black uppercase tracking-tight text-white">
            {state.symbol} cPEG route
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Buy the agent token, convert the fixed backing amount into a deterministic Core cPEG,
            release it back to tokens, or trade exact cPEG identities on the market.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          {isAuthority ? (
            <a
              href={`${urls.launch}?mint=${encodeURIComponent(tokenMint)}`}
              className="inline-flex items-center gap-1 border border-[#ec5cff]/35 bg-[#ec5cff]/10 px-2 py-1 text-[#f6c4ff] transition hover:bg-[#ec5cff]/20"
            >
              Manage launch <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <span className={setupComplete && !mainnetEscrowBlocked ? "text-[#53c7ff]" : "text-[#f7b85c]"}>
            {setupComplete ? (mainnetEscrowBlocked ? "Finalize setup" : "Configured") : "Awaiting setup"}
          </span>
          <span>|</span>
          <span>{state.owned_assets} captured</span>
          <span>|</span>
          <span>{state.available_capacity} available</span>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <ActionLink href={collectionHref} icon={PackageOpen} label="Get cPEG" />
        <ActionLink href="#release" icon={ArrowDownUp} label="Release" />
        <ActionLink href={marketHref} icon={Tag} label="List / Buy cPEG" />
      </div>

      {!setupComplete ? (
        <div className="mt-5 grid gap-3 border border-white/10 bg-black/40 p-4">
          <p className="text-sm text-white/75">
            Enable the Metaplex Hybrid escrow route for this token and Core PEG collection.
            This is a one-time creator action.
          </p>
          {mainnetEscrowBlocked ? (
            <div className="border border-[#f7b85c]/40 bg-[#f7b85c]/10 p-3 text-xs leading-5 text-[#ffe2a8]">
              Mainnet cPEG is locked until the Metaplex Hybrid escrow is initialized. This protects user funds from the legacy agent-wallet vault path.
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={isConnected ? handleSetup : login}
              disabled={setupBusy || !isAuthority}
              className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
              title={isAuthority ? "Enable Metaplex Hybrid route" : "Only the launch authority wallet can enable cPEG"}
            >
              {setupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
              Enable cPEG
            </button>
            {!isAuthority ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                Connect the launch authority wallet to enable cPEG.
              </span>
            ) : null}
          </div>
          {setupError ? (
            <div className="border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">{setupError}</div>
          ) : null}
        </div>
      ) : (
        <>
          {mainnetEscrowBlocked ? (
            <div className="mt-5 border border-[#f7b85c]/40 bg-[#f7b85c]/10 p-4 text-sm leading-6 text-[#ffe2a8]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {state.custody_warning ||
                    "Mainnet capture, release, and market settlement require Metaplex Hybrid escrow custody before user funds can move."}
                </span>
                {isAuthority ? (
                  <button
                    type="button"
                    onClick={isConnected ? handleSetup : login}
                    disabled={setupBusy}
                    className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {setupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                    {setupNeedsFinalize ? "Finalize escrow" : "Migrate escrow"}
                  </button>
                ) : null}
              </div>
              {setupBusy && status ? (
                <div className="mt-3 flex items-center gap-2 border border-[#f7b85c]/30 bg-black/25 p-3 text-xs text-[#ffe2a8]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {status}
                </div>
              ) : null}
              {setupError ? (
                <div className="mt-3 border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">
                  {setupError}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
            <Stat icon={ShieldCheck} label="Backing per cPEG" value={backingUnitLabel} />
            <Stat icon={Layers} label="Available cPEGs" value={`${state.available_capacity} / ${state.effective_max_pegs}`} />
            <Stat icon={PackageOpen} label="Token supply" value={supplyLabel} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="border border-[#53c7ff]/30 bg-[#53c7ff]/10 p-4">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-3 w-3 text-[#53c7ff]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">Get cPEG</p>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Convert your {state.symbol} tokens into cPEG identities. Each cPEG is backed by{" "}
                <span className="font-bold text-white">{backingUnitLabel}</span>.
              </p>
              <div className="mt-3 border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60">
                Required now <span className="float-right text-[#53c7ff]">{requiredLabel}</span>
              </div>
              <div className="mt-2 border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60">
                Network + protocol fee
                <span className="float-right text-white/85">~{captureFeeTotalSol} SOL</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  value={captureCount}
                  inputMode="numeric"
                  aria-label="cPEG amount"
                  onChange={(event) => setCaptureCount(event.target.value)}
                  className="w-24 border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-[#53c7ff]"
                />
                <button
                  type="button"
                  onClick={isConnected ? handleCapture : login}
                  disabled={Boolean(actionBusy) || state.available_capacity < captureCountNumber || mainnetEscrowBlocked}
                  className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionBusy === "capture" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageOpen className="h-3 w-3" />}
                  {isConnected ? `Get ${captureCountNumber} cPEG` : "Connect Phantom"}
                </button>
              </div>
              {state.available_capacity < captureCountNumber ? (
                <p className="mt-3 text-xs text-[#f7b85c]">Not enough cPEG capacity remains.</p>
              ) : null}
            </div>

            <div id="release" className="border border-white/10 bg-black/40 p-4">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-3 w-3 text-[#ec5cff]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#f6c4ff]">Release</p>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Return a cPEG identity and reclaim its backing unit. Released identities go back
                to the pool and can be captured again.
              </p>
              <div className="mt-3 border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60">
                Redeem value <span className="float-right text-[#ec5cff]">{backingUnitLabel}</span>
              </div>
              <div className="mt-2 border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/60">
                Network + protocol fee
                <span className="float-right text-white/85">~{releaseFeeTotalSol} SOL</span>
              </div>
              {connectedAddress ? (
                walletAssets.length ? (
                  <div className="mt-3 grid gap-2">
                    {walletAssets.slice(0, 6).map((asset) => (
                      <div
                        key={asset.asset_address}
                        className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/65"
                      >
                        <span>#{asset.peg_id}</span>
                        <span className="truncate text-white/45">{truncateAddress(asset.asset_address, 5, 5)}</span>
                        <button
                          type="button"
                          onClick={() => handleRelease(asset)}
                          disabled={Boolean(actionBusy) || mainnetEscrowBlocked}
                          className="inline-flex items-center gap-1 border border-[#ec5cff]/50 bg-[#ec5cff]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#ec5cff] transition hover:bg-[#ec5cff]/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actionBusy === `release-${asset.asset_address}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Release
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-white/45">No captured cPEGs in this wallet.</p>
                )
              ) : (
                <p className="mt-3 text-xs text-white/45">Connect Phantom to see your captured cPEGs.</p>
              )}
            </div>
          </div>
        </>
      )}

      {(status || error || lastTx) && (
        <div className="mt-4 grid gap-2 text-xs">
          {status ? (
            <div className="flex items-center gap-2 border border-white/10 bg-white/[0.03] p-3 text-[#53c7ff]">
              {actionBusy || setupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} {status}
            </div>
          ) : null}
          {error ? (
            <div className="border border-red-400/40 bg-red-400/10 p-3 text-red-200">{error}</div>
          ) : null}
          {lastTx ? (
            <a
              href={explorerTxUrl(lastTx, state.cluster)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55 transition hover:text-[#53c7ff]"
            >
              Last transaction <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function Stat({ icon: Icon, label, value }: StatProps) {
  return (
    <div className="bg-black/45 px-4 py-3">
      <div className="flex items-center gap-2 text-white/45">
        <Icon className="h-3 w-3" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em]">{label}</p>
      </div>
      <p className="mt-1 text-sm font-black tracking-tight text-white">{value || "--"}</p>
    </div>
  );
}

interface ActionLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
}

function ActionLink({ href, icon: Icon, label }: ActionLinkProps) {
  return (
    <a
      href={href}
      className="flex items-center justify-center gap-2 border border-white/10 bg-black/30 px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-[#53c7ff]/60 hover:bg-[#53c7ff]/10 hover:text-[#53c7ff]"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
