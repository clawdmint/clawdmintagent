"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  Layers,
  Loader2,
  PackageOpen,
  Rocket,
  Vault,
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
  vault_token_account: string | null;
  vault_owner: string | null;
  token_program_id: string | null;
  total_assets: number;
  owned_assets: number;
  pool_assets: number;
  vault_token_balance_raw: string;
  vault_token_balance_whole: number;
  max_pegs: number;
  peg_unit_raw: string;
}

interface HybridWalletAsset {
  asset_address: string;
  peg_id: number;
  status: string;
  captured_at: string | null;
}

interface HybridStateResponse {
  success: boolean;
  launch?: HybridLaunchState;
  wallet_assets?: HybridWalletAsset[];
  error?: string;
}

export interface CpegHybridPanelProps {
  tokenMint: string;
  initialAuthorityAddress?: string | null;
  compact?: boolean;
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (char) => char.charCodeAt(0));
}

function formatSimulationError(err: unknown, logs: string[]): string {
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
      /insufficient funds|insufficient lamports|invalid mint|invalid account|0x1$|0x0$|Program log: Error|custom program error/i.test(
        line
      )
  );
  const detail = interestingLog ? ` (${interestingLog.replace("Program log: ", "")})` : "";
  return `[capture-sim]Capture would be rejected on-chain: ${message}${detail}`;
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

export function CpegHybridPanel({ tokenMint, initialAuthorityAddress, compact }: CpegHybridPanelProps) {
  const { solanaAddress, isConnected, login } = useWallet();
  const [state, setState] = useState<HybridLaunchState | null>(null);
  const [walletAssets, setWalletAssets] = useState<HybridWalletAsset[]>([]);
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
    if (!initialAuthorityAddress) return Boolean(connectedAddress);
    return Boolean(connectedAddress) && connectedAddress === initialAuthorityAddress;
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
      const response = await fetch(`/api/cpeg/${tokenMint}/hybrid/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority_address: connectedAddress }),
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Failed to deploy hybrid vault.");
      }
      await refreshState();
      setStatus("Hybrid vault deployed.");
    } catch (cause) {
      setSetupError(describeError(cause, "Failed to deploy hybrid vault."));
    } finally {
      setSetupBusy(false);
    }
  }, [connectedAddress, isConnected, login, refreshState, tokenMint]);

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
        | { success?: boolean; error?: string; instructions?: ManifestInstruction[]; capture?: { cluster: string } }
        | null;
      if (!prepareResponse.ok || !prepareBody?.success || !prepareBody.instructions) {
        throw new Error(prepareBody?.error || "Failed to prepare capture transfer.");
      }

      const provider = getPhantomProvider();
      if (!provider?.signTransaction) throw new Error("Phantom signing is unavailable.");

      const cluster = prepareBody.capture?.cluster || state.cluster;
      const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
      const transaction = new Transaction();
      for (const ix of prepareBody.instructions) transaction.add(manifestToInstruction(ix));
      const latest = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = new PublicKey(connectedAddress);
      transaction.recentBlockhash = latest.blockhash;

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
          throw new Error(formatSimulationError(sim.value.err, sim.value.logs || []));
        }
      } catch (simError) {
        if (simError instanceof Error && simError.message.startsWith("[capture-sim]")) {
          throw simError;
        }
        // Network-level simulation failure should not block; keep going and let
        // sendRawTransaction surface its own error.
      }

      setStatus("Broadcasting capture transfer...");
      const signature = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        "confirmed"
      );
      setLastTx(signature);

      setStatus("Minting your Metaplex Core PEG identities...");
      const confirmResponse = await fetch(`/api/cpeg/${tokenMint}/hybrid/capture/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: connectedAddress, signature, count }),
      });
      const confirmBody = (await confirmResponse.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!confirmResponse.ok || !confirmBody?.success) {
        throw new Error(confirmBody?.error || "Capture transfer was confirmed, but minting failed.");
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
        setError("Hybrid vault is not configured for this launch yet.");
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
              release?: { target_owner: string; collection_address: string };
              instructions?: ManifestInstruction[];
            }
          | null;
        if (!prepareResponse.ok || !prepareBody?.success || !prepareBody.release || !prepareBody.instructions) {
          throw new Error(prepareBody?.error || "Failed to prepare release.");
        }

        const cluster = state.cluster || "mainnet-beta";
        const connection = new Connection(getClientRpcUrl(cluster), "confirmed");
        const transaction = new Transaction();
        for (const ix of prepareBody.instructions) transaction.add(manifestToInstruction(ix));
        const latest = await connection.getLatestBlockhash("confirmed");
        transaction.feePayer = new PublicKey(connectedAddress);
        transaction.recentBlockhash = latest.blockhash;
        setStatus("Opening Phantom for release approval...");
        const signed = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
        const raw = signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize({ requireAllSignatures: true, verifySignatures: false });
        setStatus("Broadcasting release transfer...");
        const releaseSignature = await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          maxRetries: 5,
          preflightCommitment: "confirmed",
        });
        await connection.confirmTransaction(
          { signature: releaseSignature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
          "confirmed"
        );
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
        setError(describeError(releaseError, "Failed to release cPEG."));
      } finally {
        setActionBusy(null);
      }
    },
    [connectedAddress, isConnected, login, refreshState, state, tokenMint]
  );

  if (stateLoading && !state) {
    return (
      <div className="border border-neutral-200 bg-neutral-100 p-5 text-sm text-neutral-600 dark:border-white/10 dark:bg-[#0c0c0c] dark:text-white/55">
        <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" /> Loading hybrid vault state...
      </div>
    );
  }

  if (!state) {
    return null;
  }

  const setupComplete = state.hybrid_status === "HYBRID_CONFIGURED";

  return (
    <section
      className={`border border-[#53c7ff]/30 bg-[#0c1722] p-5 ${
        compact ? "" : "md:p-7"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">
            Metaplex Hybrid Vault
          </p>
          <p className="mt-2 text-lg font-black uppercase tracking-tight text-white">
            {state.symbol} cPEG vault
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          <span className={setupComplete ? "text-[#53c7ff]" : "text-[#f7b85c]"}>
            {setupComplete ? "Configured" : "Awaiting setup"}
          </span>
          <span>·</span>
          <span>{state.owned_assets} captured</span>
          <span>·</span>
          <span>{state.vault_token_balance_whole} tokens in vault</span>
        </div>
      </div>

      {!setupComplete ? (
        <div className="mt-5 grid gap-3 border border-white/10 bg-black/40 p-4">
          <p className="text-sm text-white/75">
            Deploy the on-chain Metaplex Core collection and agent token vault for this launch.
            One-time, runs from the agent wallet.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={isConnected ? handleSetup : login}
              disabled={setupBusy || !isAuthority}
              className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
              title={isAuthority ? "Deploy Metaplex hybrid vault" : "Only the launch authority wallet can deploy"}
            >
              {setupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
              Deploy hybrid vault
            </button>
            {!isAuthority ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                Connect the launch authority wallet to enable deploy.
              </span>
            ) : null}
          </div>
          {setupError ? (
            <div className="border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-200">{setupError}</div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
            <Stat icon={Vault} label="Vault token account" value={truncateAddress(state.vault_token_account || "", 6, 6)} />
            <Stat icon={Layers} label="Core collection" value={truncateAddress(state.collection_address || "", 6, 6)} />
            <Stat icon={PackageOpen} label="Captured / pool" value={`${state.owned_assets} / ${state.pool_assets}`} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="border border-white/10 bg-black/40 p-4">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-3 w-3 text-[#53c7ff]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fe2ff]">Capture</p>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Send whole agent tokens to the vault and receive deterministic Metaplex Core
                cPEG identities in return. 1 token per cPEG.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  value={captureCount}
                  inputMode="numeric"
                  onChange={(event) => setCaptureCount(event.target.value)}
                  className="w-24 border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-[#53c7ff]"
                />
                <button
                  type="button"
                  onClick={isConnected ? handleCapture : login}
                  disabled={Boolean(actionBusy)}
                  className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionBusy === "capture" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageOpen className="h-3 w-3" />}
                  {isConnected ? "Capture cPEG" : "Connect Phantom"}
                </button>
              </div>
            </div>

            <div className="border border-white/10 bg-black/40 p-4">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-3 w-3 text-[#ec5cff]" />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#f6c4ff]">Release</p>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Return a captured cPEG identity to the vault and reclaim the underlying agent
                token. Released identities go back to the pool.
              </p>
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
                          disabled={Boolean(actionBusy)}
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
  icon: typeof Vault;
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

