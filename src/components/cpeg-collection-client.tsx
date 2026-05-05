"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import Image from "next/image";
import { clusterApiUrl, Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import {
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import Link from "next/link";
import {
  ArrowUpRight,
  Coins,
  Lock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Unlock,
  Users,
} from "lucide-react";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { CpegRelativeTime } from "@/components/cpeg-relative-time";
import { useCpegSite } from "@/components/cpeg-site-context";
import { describeError, explorerTxUrl, truncateAddress } from "@/lib/cpeg-ui";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";

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

interface CpegCollectionClientProps {
  launch: {
    name: string;
    symbol: string;
    tokenMint: string;
    collectionAddress: string;
    hookValidationAddress: string;
    cluster: string;
    pegUnitRaw: string;
    maxPegs: number;
    authorityAddress: string;
  };
}

interface PegGalleryItem {
  id: number;
  name: string;
  image: string;
  minted: boolean;
  owner: string | null;
  traits: {
    rarity: string;
    rank?: number;
    accessory?: string;
    marking?: string;
    aura?: string;
  };
}

interface CollectionStats {
  collection: {
    max_pegs: number;
    total_minted: number | null;
    burned_pegs: number | null;
    royalty_bps: number;
    marketplace_fee_bps: number;
  };
  market: {
    active_listings: number;
    filled_listings: number;
    distinct_sellers: number;
    floor_sol: string | null;
    volume_sol: string;
  };
}

interface ActivityEvent {
  id: string;
  kind: "ACTIVE" | "FILLED" | "CANCELLED";
  peg_id: number;
  token_mint: string;
  price_sol: string;
  seller: string;
  buyer: string | null;
  tx: string | null;
  at: string;
  image: string;
  trade_art_image?: string;
}

function ActivityEventThumb(props: Omit<ComponentProps<typeof Image>, "src" | "onError"> & { event: ActivityEvent }) {
  const { event, alt, ...rest } = props;
  const primary =
    event.kind === "FILLED" && typeof event.trade_art_image === "string" && event.trade_art_image.length > 0
      ? event.trade_art_image
      : event.image;
  const [src, setSrc] = useState(primary);
  useEffect(() => {
    setSrc(primary);
  }, [primary, event.id]);
  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      unoptimized
      onError={() => {
        setSrc(event.image);
      }}
    />
  );
}

interface PegGalleryPayload {
  success: boolean;
  pegs: PegGalleryItem[];
  page: {
    start: number;
    limit: number;
    next_start: number | null;
    previous_start: number | null;
  };
}

interface TradeArtItem {
  trade_index: string;
  peg_id: number;
  address: string;
  recorded: true;
  image: string;
  record: {
    trader: string;
    amountIn: string;
    amountOut: string;
    slot: string;
  };
  sale: {
    seller: string;
    buyer: string | null;
    price_lamports: string;
    sold_at: string | null;
    tx: string | null;
  };
}

interface TradeArtPayload {
  success: boolean;
  trade_art: TradeArtItem[];
  page: {
    offset: number;
    limit: number;
    next_offset: number | null;
    previous_offset: number | null;
  };
}

interface TokenStatePayload {
  success: boolean;
  token: {
    mint: string;
    cluster: string;
    decimals: number;
    supply_raw: string;
    supply_ui: string;
    whole_units: number;
    max_pegs: number;
    mint_authority: string | null;
    freeze_authority: string | null;
    is_sealed: boolean;
    authority_address: string;
    metadata: { name: string; symbol: string; uri: string } | null;
  };
  holders: {
    total_known: number | null;
    top: Array<{ address: string; amount: string; ui_amount: number; share_bps: number }>;
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

// Address shortening + transaction explorer helpers come from shared cpeg-ui utilities so that
// every cPEG surface uses the same formatting.
const short = (value: string) => truncateAddress(value, 6, 6);
const getExplorerTx = (signature: string, cluster: string) => explorerTxUrl(signature, cluster);

export function CpegCollectionClient({ launch }: CpegCollectionClientProps) {
  const { solanaAddress, isConnected, login } = useWallet();
  const isCpegSite = useCpegSite();
  const cpegUrls = useMemo(() => cpegPublicPaths(isCpegSite), [isCpegSite]);
  const [pegId, setPegId] = useState("1");
  const [mintTokenUnit, setMintTokenUnit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const [mintedPeg, setMintedPeg] = useState<number | null>(null);
  const [galleryStart, setGalleryStart] = useState(1);
  const [gallery, setGallery] = useState<PegGalleryPayload | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [tradeArtOffset, setTradeArtOffset] = useState(0);
  const [tradeArtGallery, setTradeArtGallery] = useState<TradeArtPayload | null>(null);
  const [tradeArtLoading, setTradeArtLoading] = useState(false);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [token, setToken] = useState<TokenStatePayload | null>(null);
  const [tokenRefresh, setTokenRefresh] = useState(0);
  const [sealBusy, setSealBusy] = useState(false);
  const [sealError, setSealError] = useState("");
  const [sealStatus, setSealStatus] = useState("");
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [metadataStatus, setMetadataStatus] = useState("");

  const connectedAddress = solanaAddress || "";
  const isMintAuthority = Boolean(
    connectedAddress && connectedAddress === launch.authorityAddress
  );
  const previewPegId = useMemo(() => {
    const parsed = Number.parseInt(pegId, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
  }, [pegId]);

  useEffect(() => {
    if (!isMintAuthority && mintTokenUnit) {
      setMintTokenUnit(false);
    }
  }, [isMintAuthority, mintTokenUnit]);

  const handleClaim = useCallback(async () => {
    setError("");
    setStatus("");
    setSignature("");
    setMintedPeg(null);

    if (!isConnected || !connectedAddress) {
      login();
      return;
    }

    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      setError("Phantom transaction signing is unavailable.");
      return;
    }

    const numericPegId = Number.parseInt(pegId, 10);
    if (!Number.isInteger(numericPegId) || numericPegId < 0 || numericPegId >= launch.maxPegs) {
      setError(`PEG id must be between 0 and ${launch.maxPegs - 1}.`);
      return;
    }

    setBusy(true);
    try {
      const connection = new Connection(getClientRpcUrl(launch.cluster), "confirmed");
      const owner = new PublicKey(connectedAddress);
      const mint = new PublicKey(launch.tokenMint);
      const ownerTokenAccount = getAssociatedTokenAddressSync(
        mint,
        owner,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ownerTokenAccountInfo = await connection.getAccountInfo(ownerTokenAccount, "confirmed");
      const transaction = new Transaction();

      if (!ownerTokenAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            owner,
            ownerTokenAccount,
            owner,
            mint,
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      if (mintTokenUnit && isMintAuthority) {
        transaction.add(
          createMintToInstruction(
            mint,
            ownerTokenAccount,
            owner,
            BigInt(launch.pegUnitRaw),
            [],
            TOKEN_2022_PROGRAM_ID
          )
        );
      }

      setStatus("Preparing OwnerPeg, syncPeg, and mintPeg instructions...");
      const prepareResponse = await fetch(`/api/cpeg/${launch.tokenMint}/pegs/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: connectedAddress,
          payer: connectedAddress,
          owner_token_account: ownerTokenAccount.toBase58(),
          peg_id: numericPegId,
        }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null);
      if (!prepareResponse.ok || !prepareBody?.success) {
        throw new Error(prepareBody?.error || "Failed to prepare cPEG claim.");
      }

      for (const instruction of prepareBody.instructions as ManifestInstruction[]) {
        transaction.add(manifestToInstruction(instruction));
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = owner;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      setStatus("Opening Phantom for token + PEG signature...");
      const signedTransaction = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
      const rawTransaction =
        signedTransaction instanceof VersionedTransaction
          ? signedTransaction.serialize()
          : signedTransaction.serialize({ requireAllSignatures: true, verifySignatures: false });

      setStatus("Broadcasting PEG claim transaction...");
      const tx = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: tx,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      setSignature(tx);
      setMintedPeg(numericPegId);
      setStatus("Token unit and cPEG identity are now linked on-chain.");
      setGalleryStart(Math.max(0, Math.floor(numericPegId / 24) * 24));
    } catch (claimError) {
      setError(describeError(claimError, "Failed to claim cPEG."));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [connectedAddress, isConnected, isMintAuthority, launch, login, mintTokenUnit, pegId]);

  const loadGallery = useCallback(async (start: number) => {
    setGalleryLoading(true);
    try {
      const response = await fetch(`/api/cpeg/${launch.tokenMint}/pegs?start=${start}&limit=24`);
      const body = (await response.json().catch(() => null)) as PegGalleryPayload | null;
      if (response.ok && body?.success) {
        setGallery(body);
      }
    } finally {
      setGalleryLoading(false);
    }
  }, [launch.tokenMint]);

  const handleSealMint = useCallback(async () => {
    setSealError("");
    setSealStatus("");

    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!isMintAuthority) {
      setSealError("Only the launch authority can seal the supply.");
      return;
    }
    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      setSealError("Phantom transaction signing is unavailable.");
      return;
    }

    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(
            "This permanently revokes the mint authority. After confirmation no wallet, including yours, can ever mint another token on this cPEG. Continue?"
          )
        : true;
    if (!confirmed) return;

    setSealBusy(true);
    try {
      setSealStatus("Building seal transaction...");
      const connection = new Connection(getClientRpcUrl(launch.cluster), "confirmed");
      const owner = new PublicKey(connectedAddress);
      const mint = new PublicKey(launch.tokenMint);
      const transaction = new Transaction();
      transaction.add(
        createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID)
      );
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = owner;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      setSealStatus("Opening Phantom for seal signature...");
      const signed = (await provider.signTransaction(
        transaction as SolanaWeb3Transaction
      )) as SolanaWeb3Transaction;
      const raw =
        signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize({ requireAllSignatures: true, verifySignatures: false });

      setSealStatus("Broadcasting seal transaction...");
      const tx = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: tx,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );
      setSealStatus("Supply sealed. Mint authority is now permanently revoked.");
      setTokenRefresh((value) => value + 1);
    } catch (sealEx) {
      setSealError(describeError(sealEx, "Failed to seal supply."));
      setSealStatus("");
    } finally {
      setSealBusy(false);
    }
  }, [connectedAddress, isConnected, isMintAuthority, launch.cluster, launch.tokenMint, login]);

  const handleInitializeTokenMetadata = useCallback(async () => {
    setMetadataError("");
    setMetadataStatus("");

    if (!isConnected || !connectedAddress) {
      login();
      return;
    }
    if (!isMintAuthority) {
      setMetadataError("Only the mint authority can initialize token metadata.");
      return;
    }
    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      setMetadataError("Phantom transaction signing is unavailable.");
      return;
    }

    setMetadataBusy(true);
    try {
      setMetadataStatus("Preparing Token-2022 metadata instructions...");
      const prepareResponse = await fetch(`/api/cpeg/${launch.tokenMint}/token-metadata/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payer: connectedAddress }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null);
      if (!prepareResponse.ok || !prepareBody?.success) {
        throw new Error(prepareBody?.error || "Failed to prepare token metadata.");
      }
      if (prepareBody.already_initialized) {
        setMetadataStatus("Token metadata is already initialized.");
        setTokenRefresh((value) => value + 1);
        return;
      }

      const connection = new Connection(getClientRpcUrl(launch.cluster), "confirmed");
      const transaction = new Transaction();
      for (const instruction of prepareBody.instructions as ManifestInstruction[]) {
        transaction.add(manifestToInstruction(instruction));
      }
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = new PublicKey(connectedAddress);
      transaction.recentBlockhash = latestBlockhash.blockhash;

      setMetadataStatus("Opening Phantom for metadata signature...");
      const signed = (await provider.signTransaction(transaction as SolanaWeb3Transaction)) as SolanaWeb3Transaction;
      const raw =
        signed instanceof VersionedTransaction
          ? signed.serialize()
          : signed.serialize({ requireAllSignatures: true, verifySignatures: false });

      setMetadataStatus("Broadcasting token metadata transaction...");
      const tx = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: tx,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );
      setMetadataStatus("Token metadata initialized. Explorers can now read the token details.");
      setTokenRefresh((value) => value + 1);
    } catch (metadataEx) {
      setMetadataError(describeError(metadataEx, "Failed to initialize token metadata."));
      setMetadataStatus("");
    } finally {
      setMetadataBusy(false);
    }
  }, [connectedAddress, isConnected, isMintAuthority, launch.cluster, launch.tokenMint, login]);

  const loadTradeArtGallery = useCallback(async (offset: number) => {
    setTradeArtLoading(true);
    try {
      const response = await fetch(`/api/cpeg/${launch.tokenMint}/trade-art?offset=${offset}&limit=24`);
      const body = (await response.json().catch(() => null)) as TradeArtPayload | null;
      if (response.ok && body?.success) {
        setTradeArtGallery(body);
      }
    } finally {
      setTradeArtLoading(false);
    }
  }, [launch.tokenMint]);

  useEffect(() => {
    void loadGallery(galleryStart);
  }, [galleryStart, loadGallery, mintedPeg]);

  useEffect(() => {
    void loadTradeArtGallery(tradeArtOffset);
  }, [loadTradeArtGallery, tradeArtOffset]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/cpeg/${launch.tokenMint}/stats`);
        const body = (await response.json().catch(() => null)) as
          | (CollectionStats & { success: boolean })
          | null;
        if (!cancelled && response.ok && body?.success) {
          setStats({ collection: body.collection, market: body.market });
        }
      } catch {
        // ignore stats failures (UI degrades gracefully)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launch.tokenMint, mintedPeg, signature]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/cpeg/${launch.tokenMint}/token`);
        const body = (await response.json().catch(() => null)) as TokenStatePayload | null;
        if (!cancelled && response.ok && body?.success) {
          setToken(body);
        }
      } catch {
        // token-state failures degrade gracefully (panel hides)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launch.tokenMint, mintedPeg, signature, tokenRefresh]);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/cpeg/${launch.tokenMint}/activity?limit=20`);
        const body = (await response.json().catch(() => null)) as
          | { success: boolean; events: ActivityEvent[] }
          | null;
        if (!cancelled && response.ok && body?.success) {
          setActivity(body.events || []);
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launch.tokenMint, mintedPeg, signature]);

  return (
    <div className="grid gap-8">
      {stats ? (
        <div className="grid gap-3 md:grid-cols-5">
          {[
            {
              label: "Minted",
              value:
                stats.collection.total_minted !== null
                  ? `${stats.collection.total_minted.toLocaleString()} / ${stats.collection.max_pegs.toLocaleString()}`
                  : `-- / ${stats.collection.max_pegs.toLocaleString()}`,
              accent: "text-neutral-900 dark:text-[#f7f2df]",
            },
            {
              label: "Floor",
              value: stats.market.floor_sol ? `${stats.market.floor_sol} SOL` : "--",
              accent: "text-[#53c7ff]",
            },
            {
              label: "Volume",
              value: `${stats.market.volume_sol} SOL`,
              accent: "text-neutral-900 dark:text-[#f7f2df]",
            },
            {
              label: "Listed",
              value: stats.market.active_listings.toLocaleString(),
              accent: "text-neutral-700 dark:text-white/72",
            },
            {
              label: "Burned",
              value: (stats.collection.burned_pegs ?? 0).toLocaleString(),
              accent: "text-neutral-700 dark:text-white/55",
            },
          ].map((cell) => (
            <div
              key={cell.label}
              className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-4"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">
                {cell.label}
              </p>
              <p className={`mt-2 text-xl font-black ${cell.accent}`}>{cell.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={cpegUrls.market({ mint: launch.tokenMint })}
          className="inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-[#53c7ff] transition hover:bg-[#53c7ff]/20"
        >
          <ShoppingBag className="h-3 w-3" /> P2P market
        </Link>
        <a
          href={`https://explorer.solana.com/address/${launch.collectionAddress}${
            launch.cluster === "devnet" ? "?cluster=devnet" : ""
          }`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral-700 dark:text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
        >
          Solana Explorer <ArrowUpRight className="h-3 w-3" />
        </a>
        {token ? (
          token.token.is_sealed ? (
            <span className="inline-flex items-center gap-2 border border-[#f7c948]/40 bg-[#f7c948]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-[#f7c948]">
              <Lock className="h-3 w-3" /> Supply sealed
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
              <Unlock className="h-3 w-3" /> Mint open
            </span>
          )
        ) : null}
      </div>

      {token ? (
        <section className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
                Token-2022 state
              </p>
              <h2 className="mt-1 text-2xl font-black uppercase">
                {token.token.is_sealed ? "Supply is permanently sealed" : "Supply is still open"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/65">
                {token.token.is_sealed
                  ? "The mint authority has been revoked on-chain. No wallet, including the launch authority, can ever create another token. Total supply is fixed forever and identity follows the token unit on every transfer."
                  : "The launch authority can still mint new units while the supply is open. Sealing it revokes the mint authority on-chain and locks the supply forever, matching the cPEG fixed-supply guarantee."}
              </p>
            </div>
            {token.token.is_sealed ? (
              <span className="inline-flex items-center gap-2 border border-[#f7c948]/40 bg-[#f7c948]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f7c948]">
                <ShieldCheck className="h-3 w-3" /> Authority revoked
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-600 dark:text-white/60">
                <Unlock className="h-3 w-3" /> Authority active
              </span>
            )}
          </header>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/25 p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">
                <Coins className="h-3 w-3" /> Circulating supply
              </p>
              <p className="mt-2 text-xl font-black text-neutral-900 dark:text-[#f7f2df]">
                {token.token.whole_units.toLocaleString()}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                of {token.token.max_pegs.toLocaleString()} target
              </p>
            </div>
            <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/25 p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">
                <Users className="h-3 w-3" /> Top holders
              </p>
              <p className="mt-2 text-xl font-black text-[#53c7ff]">
                {token.holders.top.length || "--"}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                tracked from largest accounts
              </p>
            </div>
            <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/25 p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">
                {token.token.is_sealed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                Mint authority
              </p>
              <p className="mt-2 text-xl font-black text-neutral-900 dark:text-[#f7f2df]">
                {token.token.is_sealed ? "Sealed" : truncateAddress(token.token.mint_authority || "")}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                {token.token.is_sealed ? "no further mints possible" : "can still mint until sealed"}
              </p>
            </div>
            <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100/90 dark:bg-black/25 p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">
                <ShieldCheck className="h-3 w-3" /> Decimals
              </p>
              <p className="mt-2 text-xl font-black text-neutral-900 dark:text-[#f7f2df]">{token.token.decimals}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                1 cPEG = 1 whole unit
              </p>
            </div>
          </div>

          {token.holders.top.length > 0 ? (
            <div className="mt-5 border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-black/30">
              <header className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-700 dark:text-white/55">
                  Largest holders
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/35">
                  share of supply
                </p>
              </header>
              <ul className="divide-y divide-white/5">
                {token.holders.top.slice(0, 6).map((holder, index) => {
                  const sharePct = (holder.share_bps / 100).toFixed(2);
                  return (
                    <li
                      key={holder.address}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 font-mono text-xs"
                    >
                      <span className="flex items-center gap-3 text-neutral-700 dark:text-white/70">
                        <span className="text-neutral-500 dark:text-white/35">{(index + 1).toString().padStart(2, "0")}</span>
                        <a
                          href={`https://explorer.solana.com/address/${holder.address}${
                            launch.cluster === "devnet" ? "?cluster=devnet" : ""
                          }`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-neutral-900 dark:text-white/85 transition hover:text-[#53c7ff]"
                        >
                          {truncateAddress(holder.address)}
                        </a>
                      </span>
                      <span className="text-neutral-700 dark:text-white/55">
                        {holder.ui_amount.toLocaleString()} <span className="text-neutral-400 dark:text-white/30">/ {sharePct}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {isMintAuthority && !token.token.is_sealed ? (
            <div className="mt-5 border border-[#f7c948]/30 bg-[#f7c948]/[0.06] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#f7c948]">
                    Authority action
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-700 dark:text-white/72">
                    Once you finish the genesis distribution, seal the supply. This sets the
                    mint authority to null on-chain and ends your ability to mint new units.
                    There is no unseal. Buyers gain a permanent fixed-supply guarantee.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSealMint}
                  disabled={sealBusy}
                  className="inline-flex items-center gap-2 border border-[#f7c948] bg-[#f7c948] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#f7c948]/85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sealBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                  Seal supply forever
                </button>
              </div>
              {sealStatus ? <p className="mt-3 text-sm text-[#53c7ff]">{sealStatus}</p> : null}
              {sealError ? <p className="mt-3 text-sm text-red-300">{sealError}</p> : null}
            </div>
          ) : null}

          {isMintAuthority && !token.token.metadata ? (
            <div className="mt-5 border border-[#53c7ff]/30 bg-[#53c7ff]/[0.06] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#53c7ff]">
                    Explorer metadata
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-700 dark:text-white/72">
                    Initialize Token-2022 metadata so explorers can read this collection&apos;s
                    name, symbol, image, and cPEG metadata URI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleInitializeTokenMetadata}
                  disabled={metadataBusy}
                  className="inline-flex items-center gap-2 border border-[#53c7ff] bg-[#53c7ff] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#f7f2df] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {metadataBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Initialize metadata
                </button>
              </div>
              {metadataStatus ? <p className="mt-3 text-sm text-[#53c7ff]">{metadataStatus}</p> : null}
              {metadataError ? <p className="mt-3 text-sm text-red-300">{metadataError}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="border-y border-neutral-200 py-8 dark:border-white/10">
        <div className="grid gap-6 md:grid-cols-[1fr_320px] md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">
              Hold token. Own cPEG.
            </p>
            <h2 className="mt-3 max-w-4xl text-4xl font-black uppercase leading-none text-neutral-950 dark:text-[#f7f2df] md:text-6xl">
              Every whole token maps to one numbered identity.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link
              href={cpegUrls.market({ mint: launch.tokenMint })}
              className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
            >
              <ShoppingBag className="h-4 w-4" /> Browse market
            </Link>
            <button
              type="button"
              onClick={() => setGalleryStart(0)}
              className="inline-flex items-center gap-2 border border-neutral-300 px-5 py-3 text-sm font-bold uppercase tracking-wide text-neutral-700 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/15 dark:text-white/72"
            >
              View gallery
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-5">
          <div className="aspect-square border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black">
            <Image
              src={`/api/cpeg/${launch.tokenMint}/pegs/${previewPegId}/svg`}
              alt={`${launch.symbol} #${previewPegId}`}
              width={640}
              height={640}
              className="h-full w-full object-cover [image-rendering:pixelated]"
              unoptimized
            />
          </div>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-600 dark:text-white/50">
            deterministic renderer / {launch.symbol} #{previewPegId}
          </p>
        </div>

        {isMintAuthority && !token?.token.is_sealed ? (
          <div className="border border-neutral-200 dark:border-white/10 bg-neutral-50/95 dark:bg-black/28 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              Genesis distribution
            </p>
            <h2 className="mt-3 text-3xl font-black uppercase">
              Mint a PEG to seed the collection.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/62">
              Available only while the mint is open. Pick a PEG ID to mint one whole Token-2022
              unit plus its matching PegRecord identity in a single transaction. When the
              genesis is complete, seal the supply from the Token-2022 panel above.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                  PEG ID
                </span>
                <input
                  value={pegId}
                  inputMode="numeric"
                  onChange={(event) => setPegId(event.target.value)}
                  className="mt-2 w-full border border-neutral-300 dark:border-white/12 bg-neutral-50 dark:bg-white/[0.04] px-3 py-3 text-sm text-neutral-950 dark:text-white outline-none focus:border-[#53c7ff]"
                />
              </label>
              <label className="flex items-center justify-between border border-neutral-300 dark:border-white/12 bg-neutral-50 dark:bg-white/[0.04] px-3 py-3 md:mt-6">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                  Mint token unit first
                </span>
                <input
                  type="checkbox"
                  checked={mintTokenUnit}
                  onChange={(event) => setMintTokenUnit(event.target.checked)}
                  className="h-4 w-4 accent-[#53c7ff]"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-2 border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-4 font-mono text-xs text-neutral-600 dark:text-white/64">
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500 dark:text-white/40">Token mint</span>
                <span title={launch.tokenMint}>{short(launch.tokenMint)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500 dark:text-white/40">Collection</span>
                <span title={launch.collectionAddress}>{short(launch.collectionAddress)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500 dark:text-white/40">Authority</span>
                <span title={launch.authorityAddress}>{short(launch.authorityAddress)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={isConnected ? handleClaim : login}
              disabled={busy}
              className="mt-5 inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isConnected ? `Mint ${launch.symbol} #${previewPegId}` : "Connect Phantom"}
            </button>
            <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/35">
              Authority-only / syncPeg + mintPeg are bundled in one signature
            </p>

            {status ? <p className="mt-4 text-sm text-[#53c7ff]">{status}</p> : null}
            {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
            {signature && mintedPeg !== null ? (
              <div className="mt-5 border border-[#53c7ff]/30 bg-[#53c7ff]/10 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9fe2ff]">
                  {launch.symbol} #{mintedPeg} is live
                </p>
                <a
                  href={getExplorerTx(signature, launch.cluster)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-neutral-950 dark:text-white hover:text-[#53c7ff]"
                >
                  View transaction <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="border border-neutral-200 bg-neutral-100/95 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              No mint. No claim.
            </p>
            <h2 className="mt-3 text-3xl font-black uppercase">
              Buy the token. Hold the identity.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/65">
              Every whole Token-2022 unit points at one numbered cPEG. When the unit moves,
              the identity follows.
            </p>
            <ol className="mt-6 grid gap-3 text-sm text-neutral-700 dark:text-white/72">
              <li className="flex items-start gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#53c7ff]">
                  01
                </span>
                <span>
                  Pick a listed cPEG from the market.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#53c7ff]">
                  02
                </span>
                <span>
                  Buy it with SOL. The token unit and identity settle together.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#53c7ff]">
                  03
                </span>
                <span>
                  Hold the token. The cPEG is yours.
                </span>
              </li>
            </ol>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={cpegUrls.market({ mint: launch.tokenMint })}
                className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
              >
                <ShoppingBag className="h-4 w-4" /> Browse market
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                fixed supply, numbered identities
              </span>
            </div>

            <div className="mt-6 grid gap-2 border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-4 font-mono text-xs text-neutral-600 dark:text-white/64">
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500 dark:text-white/40">Token mint</span>
                <span title={launch.tokenMint}>{short(launch.tokenMint)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500 dark:text-white/40">Collection</span>
                <span title={launch.collectionAddress}>{short(launch.collectionAddress)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-neutral-500 dark:text-white/40">Wallet</span>
                <span>{connectedAddress ? short(connectedAddress) : "not connected"}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {(tradeArtGallery?.trade_art?.length ?? 0) > 0 ? (
        <section className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
                Trade art
              </p>
              <h2 className="mt-2 text-2xl font-black uppercase">Recorded on every fill</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-700 dark:text-white/55">
                Auto-generated from on-chain sale data. One piece per market fill.
              </p>
            </div>
            {(tradeArtGallery?.page.previous_offset !== null && tradeArtGallery?.page.previous_offset !== undefined) ||
            tradeArtGallery?.page.next_offset !== null ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    tradeArtLoading ||
                    tradeArtGallery?.page.previous_offset === null ||
                    tradeArtGallery?.page.previous_offset === undefined
                  }
                  onClick={() => {
                    const prev = tradeArtGallery?.page.previous_offset;
                    if (prev !== null && prev !== undefined) setTradeArtOffset(prev);
                  }}
                  className="border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-xs uppercase tracking-wide text-neutral-700 dark:text-white/70 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={tradeArtLoading || tradeArtGallery?.page.next_offset === null}
                  onClick={() => {
                    const next = tradeArtGallery?.page.next_offset;
                    if (next !== null && next !== undefined) setTradeArtOffset(next);
                  }}
                  className="border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-xs uppercase tracking-wide text-neutral-700 dark:text-white/70 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {(tradeArtGallery?.trade_art || []).map((item) => (
              <Link
                key={item.trade_index}
                href={
                  item.sale.tx
                    ? getExplorerTx(item.sale.tx, launch.cluster)
                    : cpegUrls.collectionWithHash(launch.tokenMint, `peg-${item.peg_id}`)
                }
                target={item.sale.tx ? "_blank" : undefined}
                rel={item.sale.tx ? "noreferrer" : undefined}
                className="group border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-black/30 p-2 transition hover:border-[#53c7ff]/40"
              >
                <div className="aspect-square overflow-hidden bg-neutral-200 dark:bg-black">
                  <Image
                    src={item.image}
                    alt={`cPEG trade art #${item.trade_index}`}
                    width={240}
                    height={240}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                    unoptimized
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-700 dark:text-white/70">
                    {launch.symbol} #{item.peg_id}
                  </p>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-[#53c7ff]">
                    {(Number(item.sale.price_lamports) / 1_000_000_000).toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    SOL
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              Recent activity
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase">Market pulse</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-700 dark:text-white/55">
              Listings, fills, and cancellations in chronological order. Click an event to view
              the on-chain transaction.
            </p>
          </div>
          <RefreshCw className={`h-3 w-3 text-neutral-400 dark:text-white/30 ${activityLoading ? "animate-spin" : ""}`} />
        </div>

        {activity.length ? (
          <div className="mt-5 grid gap-2">
            {activity.slice(0, 12).map((event) => {
              const accent =
                event.kind === "FILLED"
                  ? "text-[#53c7ff]"
                  : event.kind === "CANCELLED"
                  ? "text-neutral-500 dark:text-white/40"
                  : "text-neutral-900 dark:text-[#f7f2df]";
              const Wrapper = event.tx
                ? (props: React.ComponentProps<"a">) => (
                    <a {...props} href={getExplorerTx(event.tx as string, launch.cluster)} target="_blank" rel="noreferrer" />
                  )
                : (props: React.ComponentProps<"div">) => <div {...props} />;
              return (
                <Wrapper
                  key={event.id}
                  className="group flex items-center gap-3 border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-black/30 p-3 transition hover:border-[#53c7ff]/40"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black">
                    <ActivityEventThumb
                      event={event}
                      alt={`${launch.symbol} #${event.peg_id}`}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover [image-rendering:pixelated]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${accent}`}>
                        {event.kind === "FILLED" ? "Sold" : event.kind === "CANCELLED" ? "Delisted" : "Listed"}
                      </span>
                      <span className="font-bold uppercase text-neutral-900 dark:text-white/85">#{event.peg_id}</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/40">
                      {event.kind === "FILLED" && event.buyer
                        ? `${truncateAddress(event.buyer)} from ${truncateAddress(event.seller)}`
                        : truncateAddress(event.seller)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-sm font-black tracking-tight text-[#53c7ff]">
                      {event.price_sol} SOL
                    </span>
                    <CpegRelativeTime
                      iso={event.at}
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500 dark:text-white/40"
                    />
                  </div>
                </Wrapper>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 border border-dashed border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
              No marketplace activity for this collection yet
            </p>
            <Link
              href={cpegUrls.market({ mint: launch.tokenMint })}
              className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#53c7ff]"
            >
              List the first one <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </section>

      <section className="border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              Collection grid
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase">All PEG identities</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={galleryLoading || !gallery?.page.previous_start}
              onClick={() => {
                const previousStart = gallery?.page.previous_start;
                if (previousStart !== null && previousStart !== undefined) setGalleryStart(previousStart);
              }}
              className="border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-xs uppercase tracking-wide text-neutral-700 dark:text-white/70 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={galleryLoading || gallery?.page.next_start === null}
              onClick={() => gallery?.page.next_start !== null && gallery?.page.next_start !== undefined && setGalleryStart(gallery.page.next_start)}
              className="border border-neutral-300 dark:border-white/15 px-3 py-2 font-mono text-xs uppercase tracking-wide text-neutral-700 dark:text-white/70 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {(gallery?.pegs || []).map((peg) => (
            <button
              key={peg.id}
              type="button"
              onClick={() => setPegId(String(peg.id))}
              className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-black/30 p-2 text-left transition hover:border-[#53c7ff]"
            >
              <div className="aspect-square bg-neutral-200 dark:bg-black">
                <Image
                  src={peg.image}
                  alt={peg.name}
                  width={240}
                  height={240}
                  className="h-full w-full object-cover [image-rendering:pixelated]"
                  unoptimized
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-700 dark:text-white/70">#{peg.id}</p>
                <span className={peg.minted ? "text-[10px] uppercase text-[#53c7ff]" : "text-[10px] uppercase text-neutral-500 dark:text-white/35"}>
                  {peg.minted ? "minted" : "open"}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-neutral-600 dark:text-white/42">{peg.traits.rarity}</p>
              <p className="mt-1 truncate font-mono text-[10px] uppercase text-neutral-400 dark:text-white/30">
                {[peg.traits.accessory, peg.traits.marking, peg.traits.aura].filter(Boolean).join(" / ")}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
