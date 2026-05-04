"use client";

import { useCallback, useState } from "react";
import Decimal from "decimal.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { Waves, Loader2 } from "lucide-react";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { describeError, explorerTxUrl } from "@/lib/cpeg-ui";

const WRAPPED_SOL = "So11111111111111111111111111111111111111112";

function rpcForCluster(cluster: string) {
  const configured =
    process.env["NEXT_PUBLIC_CPEG_BROWSER_RPC_URL"] ||
    process.env["NEXT_PUBLIC_SOLANA_BROWSER_RPC_URL"];
  if (configured) return configured;
  return clusterApiUrl(cluster === "devnet" ? "devnet" : "mainnet-beta");
}

/**
 * Orca Splash pool creation surfaced next to Jupiter routing. Splash pools reuse tick spacing 32896
 * so swaps become routable shortly after indexer refresh.
 *
 * Kept intentionally simple: signer pays rent + fee tier rent. Token-2022 mints requiring V2 inits rely
 * on the SDK path that initializes pool V2 instructions when badges exist on-chain.
 */
interface CpegOrcaSplashPoolProps {
  cluster: string;
  tokenMint: string;
}

export function CpegOrcaSplashPool({ cluster, tokenMint }: CpegOrcaSplashPoolProps) {
  const { isConnected, solanaAddress, login } = useWallet();
  const [pegPerSol, setPegPerSol] = useState("100");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [poolError, setPoolError] = useState("");
  const [signature, setSignature] = useState("");

  const isMainnet = cluster === "mainnet-beta" || cluster === "mainnet";

  const handleCreateSplash = useCallback(async () => {
    setPoolError("");
    setSignature("");
    setStatus("");
    if (!isConnected || !solanaAddress) {
      login();
      return;
    }

    let pegPerWholeUi: Decimal;
    try {
      pegPerWholeUi = new Decimal(pegPerSol.trim());
      if (!pegPerWholeUi.isPositive()) throw new Error("Enter a positive number.");
    } catch {
      setPoolError("Invalid pool price.");
      return;
    }

    setBusy(true);
    try {
      const phantom = getPhantomProvider();
      if (!phantom?.signTransaction) {
        throw new Error("Phantom cannot sign transactions in this browser context.");
      }
      const signTransaction = phantom.signTransaction.bind(phantom);

      const connection = new Connection(rpcForCluster(cluster), "confirmed");
      const userPk = new PublicKey(solanaAddress);

      const anchorWallet = {
        publicKey: userPk,
        signTransaction: signTransaction,
        signAllTransactions: async (
          txs: InstanceType<typeof VersionedTransaction>[],
        ) => Promise.all(txs.map((tx) => signTransaction(tx))),
      };

      const provider = new AnchorProvider(connection, anchorWallet as never, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });

      const whirlpoolSdk = await import("@orca-so/whirlpools-sdk");
      const { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOLS_CONFIG } = whirlpoolSdk;

      const ctx = WhirlpoolContext.withProvider(provider);
      const client = buildWhirlpoolClient(ctx);

      const wsol = new PublicKey(WRAPPED_SOL);
      const cpeg = new PublicKey(tokenMint);
      const mintA = wsol.toBuffer().compare(cpeg.toBuffer()) < 0 ? wsol : cpeg;
      const mintB = mintA.equals(wsol) ? cpeg : wsol;
      const initialSplashPrice = mintA.equals(wsol) ? pegPerWholeUi : new Decimal(1).div(pegPerWholeUi);

      setStatus("Building Orca splash pool transaction...");
      const { tx } = await client.createSplashPool(ORCA_WHIRLPOOLS_CONFIG, mintA, mintB, initialSplashPrice, userPk);

      const payload = await tx.build({
        maxSupportedTransactionVersion: 0,
        blockhashCommitment: "confirmed",
        computeBudgetOption: {
          type: "auto",
          maxPriorityFeeLamports: 8_888_888,
          minPriorityFeeLamports: 1_000,
        },
      });

      const built = payload.transaction;
      if (!(built instanceof VersionedTransaction)) {
        throw new Error("Expected a VersionedTransaction from Orca.");
      }

      for (const signer of payload.signers) {
        built.sign([signer]);
      }

      setStatus("Opening Phantom to finalize pool creation...");
      const signedOuter = await phantom.signTransaction(built);
      const signedTx = signedOuter instanceof VersionedTransaction ? signedOuter : null;
      if (!signedTx) {
        throw new Error("Phantom produced an unexpected payload.");
      }

      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        maxRetries: 5,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      });
      await connection.confirmTransaction(sig, "confirmed");

      setSignature(sig);
      setStatus("Splash pool landed. Jupiter will pick up liquidity after aggregator refresh.");
    } catch (cause) {
      setPoolError(describeError(cause, "Orca splash pool creation failed."));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [cluster, isConnected, login, pegPerSol, solanaAddress, tokenMint]);

  if (!isMainnet) {
    return (
      <div className="mt-5 border border-neutral-300 bg-neutral-100/90 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 dark:border-white/15 dark:bg-black/30 dark:text-white/50">
        In-app Splash pools rely on Orca&apos;s pinned mainnet program + config IDs. Deploy on devnet using the escrow
        market while testing.
      </div>
    );
  }

  return (
    <div className="mt-5 border border-neutral-200 bg-neutral-100/90 p-4 dark:border-white/10 dark:bg-black/25">
      <div className="flex items-start gap-2">
        <Waves className="mt-1 h-4 w-4 text-[#53c7ff]" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#53c7ff]">Orca splash pool</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/65">
            Spins up a canonical full-range Whirlpool so swaps route through Jupiter. You pay rent for vault PDAs plus
            your priority tip.
          </p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">Whole cPEG per 1 SOL</span>
        <input
          value={pegPerSol}
          onChange={(event) => setPegPerSol(event.target.value)}
          className="mt-2 w-full border border-neutral-300 bg-neutral-50 px-3 py-3 text-sm text-neutral-950 outline-none transition focus:border-[#53c7ff] dark:border-white/12 dark:bg-white/[0.04] dark:text-white"
          inputMode="decimal"
          placeholder="e.g. 100"
        />
      </label>

      <button
        type="button"
        onClick={isConnected ? handleCreateSplash : login}
        disabled={busy}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waves className="h-4 w-4" />}
        {busy ? "Building pool..." : isConnected ? "Create splash pool" : "Connect Phantom"}
      </button>

      {status ? <p className="mt-3 text-sm text-[#53c7ff]">{status}</p> : null}
      {poolError ? <p className="mt-3 text-sm text-red-300">{poolError}</p> : null}
      {signature ? (
        <a
          href={explorerTxUrl(signature, cluster)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff]"
        >
          View transaction on Explorer
        </a>
      ) : null}
    </div>
  );
}
