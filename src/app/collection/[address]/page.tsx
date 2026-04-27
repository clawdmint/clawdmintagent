"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import Link from "next/link";
import Image from "next/image";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { COLLECTION_ABI } from "@/lib/contracts";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import { Bot, ExternalLink, ArrowLeft, Minus, Plus, Sparkles, CheckCircle, Share2, Link2, Check, MessageSquare, Send, ChevronDown, ChevronUp, Users, Loader2, ShieldCheck } from "lucide-react";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  isEvmCollectionChain,
} from "@/lib/collection-chains";
import {
  getAddressExplorerUrl,
  getNetworkFromValue,
  getTransactionExplorerUrl,
} from "@/lib/network-config";
import { NetworkLogo } from "@/components/network-icons";
import { CollectionViewTabs } from "@/components/collection-view-tabs";
import { CollectionCountdown } from "@/components/collection-countdown";

/** Avoid `Transaction` / `VersionedTransaction` as bare types (web3 re-exports are unusable as types in this project). */
type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

const AGENTS_CONTRACT = (process.env["NEXT_PUBLIC_AGENTS_CONTRACT"] || "").toLowerCase();
const MIN_COLLECTION_IMAGE_DIMENSION = 256;
const MAX_SOLANA_MINTS_PER_TX = 10;
// Keep Solana mint batches at 1 until we introduce ALTs; larger multi-signer
// transactions are much more likely to trigger Phantom safety warnings.
const PHANTOM_SAFE_SOLANA_MINT_BATCH_SIZE = 1;

interface Collection {
  id: string;
  address: string;
  chain: string;
  native_token: string;
  mint_engine?: string | null;
  mint_address?: string | null;
  mint_enabled?: boolean;
  mint_prepare_endpoint?: string | null;
  mint_confirm_endpoint?: string | null;
  mint_disabled_reason?: string | null;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  base_uri: string;
  max_supply: number;
  total_minted: number;
  holders_count?: number;
  mint_price_raw: string;
  mint_price_native: string;
  platform_fee_bps?: number;
  platform_fee_raw?: string;
  platform_fee_native?: string;
  total_mint_price_raw?: string;
  total_mint_price_native?: string;
  royalty_bps: number;
  payout_address: string;
  authority_address?: string | null;
  status: string;
  deployed_at: string;
  deploy_tx_hash: string;
  agent: {
    id: string;
    name: string;
    description: string;
    avatar_url: string;
    eoa: string;
    x_handle: string;
  };
  onchain?: {
    total_minted: string;
    remaining: string;
    is_sold_out: boolean;
    items_available?: string;
    items_loaded?: string;
    is_fully_loaded?: boolean;
  };
  market?: {
    owners_count: number;
    listed_count: number;
    floor_price_raw: string | null;
    floor_price_native: string | null;
    total_volume_raw: string;
    total_volume_native: string;
    recent_sales: Array<{
      id: string;
      price_lamports: string;
      price_native: string;
      buyer_address: string;
      seller_address: string;
      tx_hash: string | null;
      sold_at: string;
      asset: {
        address: string;
        token_id: number;
        name: string;
        image_url: string | null;
      };
    }>;
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

function deserializeSolanaTransaction(serializedBase64: string) {
  const bytes = base64ToBytes(serializedBase64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

function formatSolLamports(value: bigint): string {
  const whole = value / BigInt(1_000_000_000);
  const fraction = value % BigInt(1_000_000_000);

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function buildSolanaMintBatchPlan(quantity: number): number[] {
  const batches: number[] = [];
  let remaining = quantity;

  while (remaining > 0) {
    const nextBatch = Math.min(PHANTOM_SAFE_SOLANA_MINT_BATCH_SIZE, remaining);
    batches.push(nextBatch);
    remaining -= nextBatch;
  }

  return batches;
}

async function confirmSolanaMintWithRetry(
  endpoint: string,
  payload: {
    intent_id: string;
    wallet_address: string;
    tx_hash: string;
  },
  options?: {
    maxAttempts?: number;
    retryDelayMs?: number;
  }
) {
  const maxAttempts = options?.maxAttempts ?? 24;
  const retryDelayMs = options?.retryDelayMs ?? 2500;

  let lastError = "Failed to confirm Solana mint";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.json().catch(() => null);

    if (response.ok && responseBody?.success) {
      return responseBody;
    }

    lastError = responseBody?.error || lastError;

    if (response.status !== 409) {
      throw new Error(lastError);
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(lastError);
}

function PrivyConnectButton() {
  const { login } = useWallet();
  return (
    <button
      onClick={login}
      className="w-full btn-primary text-lg py-4 flex items-center justify-center gap-2"
    >
      <span className="relative z-10">Connect Wallet to Mint</span>
    </button>
  );
}

export default function CollectionPage() {
  const params = useParams();
  const address = params.address as string;
  const router = useRouter();
  const { theme } = useTheme();

  // Redirect agents collection to /mint
  useEffect(() => {
    if (address && address.toLowerCase() === AGENTS_CONTRACT) {
      router.replace("/mint");
    }
  }, [address, router]);

  const { address: userAddress, solanaAddress, isConnected } = useWallet();
  
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState("");
  const [mintSuccess, setMintSuccess] = useState("");
  const [solanaMintTxHash, setSolanaMintTxHash] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const loadCollection = useCallback(async () => {
    try {
      const res = await fetch(`/api/collections/${address}`);
      const data = await res.json();
      if (data.success) {
        setImageFailed(false);
        setCollection(data.collection);
      }
    } catch (error) {
      console.error("Failed to fetch collection:", error);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      void loadCollection();
    }
  }, [address, loadCollection]);

  useEffect(() => {
    if (!collection) {
      return;
    }

    const remainingCount = Number(collection.onchain?.remaining || collection.max_supply - collection.total_minted);
    const limit = isEvmCollectionChain(collection.chain)
      ? Math.max(1, remainingCount)
      : Math.max(1, Math.min(remainingCount, MAX_SOLANA_MINTS_PER_TX));

    setQuantity((current) => Math.min(Math.max(1, current), limit));
  }, [collection]);

  // Track if we've already recorded this transaction
  const [recordedTxHash, setRecordedTxHash] = useState<string | null>(null);

  // Record mint and refresh collection data
  useEffect(() => {
    async function recordMint() {
      if (!isSuccess || !address || !txHash || !userAddress || !collection) return;
      if (recordedTxHash === txHash) return; // Already recorded
      
      setRecordedTxHash(txHash);
      
      try {
        // Record the mint in database
        const mintRes = await fetch(`/api/collections/${address}/mint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            minter_address: userAddress,
            quantity,
            tx_hash: txHash,
            total_paid: (BigInt(collection.mint_price_raw) * BigInt(quantity)).toString(),
          }),
        });
        
        const mintData = await mintRes.json();
        console.log("Mint recorded:", mintData);

        await loadCollection();
      } catch (error) {
        console.error("Failed to record mint:", error);
      } finally {
        setIsMinting(false);
      }
    }
    
    recordMint();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash, loadCollection]);

  const handleMint = async () => {
    if (!collection || !isConnected || !isEvmCollectionChain(collection.chain)) return;
    
    setIsMinting(true);
    setMintError("");
    setMintSuccess("");
    
    try {
      const mintPrice = BigInt(collection.mint_price_raw);
      const totalCost = mintPrice * BigInt(quantity);

      writeContract({
        address: collection.address as `0x${string}`,
        abi: COLLECTION_ABI,
        functionName: "publicMint",
        args: [BigInt(quantity)],
        value: totalCost,
      });
    } catch (error) {
      console.error("Mint error:", error);
      setMintError(error instanceof Error ? error.message : "Mint failed");
      setIsMinting(false);
    }
  };

  const signAndBroadcastSolanaTransaction = useCallback(
    async (
      intentId: string,
      serializedBase64: string,
      broadcastEndpoint: string
    ) => {
      const provider = getPhantomProvider();
      if (!provider) {
        throw new Error("Phantom transaction signing is unavailable");
      }

      const transaction = deserializeSolanaTransaction(serializedBase64);

      if (!provider.signTransaction) {
        throw new Error("Phantom transaction signing is unavailable");
      }

      const signedTransaction = (await provider.signTransaction(
        transaction as SolanaWeb3Transaction
      )) as SolanaWeb3Transaction;

      const serializedSignedTransaction =
        signedTransaction instanceof VersionedTransaction
          ? signedTransaction.serialize()
          : signedTransaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            });

      const broadcastResponse = await fetch(broadcastEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent_id: intentId,
          signed_transaction_base64: bytesToBase64(serializedSignedTransaction),
        }),
      });

      const broadcastPayload = await broadcastResponse.json().catch(() => null);
      if (!broadcastResponse.ok || !broadcastPayload?.success || !broadcastPayload?.tx_hash) {
        throw new Error(broadcastPayload?.error || "Failed to broadcast Solana mint transaction");
      }

      return broadcastPayload.tx_hash as string;
    },
    []
  );

  const handleSolanaMint = useCallback(async () => {
    if (!collection?.mint_prepare_endpoint || !collection?.mint_confirm_endpoint || !solanaAddress) {
      return;
    }

    setIsMinting(true);
    setMintError("");
    setMintSuccess("");
    setSolanaMintTxHash(null);

    try {
      const batchPlan = buildSolanaMintBatchPlan(quantity);
      const signatures: string[] = [];

      for (const batchQuantity of batchPlan) {
        const prepareResponse = await fetch(collection.mint_prepare_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet_address: solanaAddress,
            quantity: batchQuantity,
          }),
        });
        const preparePayload = await prepareResponse.json();
        if (!prepareResponse.ok || !preparePayload.success || !preparePayload.mint?.transaction_base64) {
          throw new Error(preparePayload.error || "Failed to prepare Solana mint");
        }

        const signature = await signAndBroadcastSolanaTransaction(
          preparePayload.mint.intent_id,
          preparePayload.mint.transaction_base64,
          preparePayload.mint.broadcast_endpoint
        );
        signatures.push(signature);
        setSolanaMintTxHash(signature);

        await confirmSolanaMintWithRetry(
          collection.mint_confirm_endpoint,
          {
            intent_id: preparePayload.mint.intent_id,
            wallet_address: solanaAddress,
            tx_hash: signature,
          }
        );
      }

      setMintSuccess(
        batchPlan.length > 1
          ? `Minted ${quantity} NFTs on Solana across ${batchPlan.length} wallet-safe transactions.`
          : `Minted ${quantity} NFT${quantity > 1 ? "s" : ""} on Solana.`
      );
      await loadCollection();
    } catch (error) {
      console.error("Solana mint failed:", error);
      setMintError(error instanceof Error ? error.message : "Solana mint failed");
    } finally {
      setIsMinting(false);
    }
  }, [
    collection?.mint_confirm_endpoint,
    collection?.mint_prepare_endpoint,
    loadCollection,
    quantity,
    signAndBroadcastSolanaTransaction,
    solanaAddress,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
          <div className="hero-orb hero-orb-cyan w-[400px] h-[400px] top-[-100px] right-[-100px]" />
        </div>
        <div className="container mx-auto px-4 py-20 relative">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12">
              <div className={clsx(
                "aspect-square rounded-2xl animate-pulse",
                theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
              )} />
              <div className="space-y-6">
                <div className={clsx("h-10 rounded w-3/4 animate-pulse", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
                <div className={clsx("h-6 rounded w-1/2 animate-pulse", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
                <div className={clsx("h-32 rounded animate-pulse", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
        </div>
        <div className={clsx("glass-card text-center max-w-md mx-4", theme === "light" && "bg-white/80")}>
          <div className="w-20 h-20 mx-auto mb-6">
            <Image src="/logo.png" alt="" width={80} height={80} className="opacity-50" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Collection Not Found</h1>
          <p className={clsx("mb-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            This collection doesn&apos;t exist or hasn&apos;t been indexed yet.
          </p>
          <Link href="/drops" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            <span className="relative z-10">Back to Drops</span>
          </Link>
        </div>
      </div>
    );
  }

  const network = getNetworkFromValue(collection.chain);
  const chainName = network.label;
  const explorerUrl = getAddressExplorerUrl(collection.address, collection.chain);
  const latestMintTxHash = solanaMintTxHash || txHash || null;
  const txExplorerUrl = latestMintTxHash ? getTransactionExplorerUrl(latestMintTxHash, collection.chain) : null;
  const isEvmCollection = isEvmCollectionChain(collection.chain);
  const isMetaplexMintCollection = collection.mint_engine === "metaplex_core_candy_machine";
  const nativeToken = collection.native_token || getCollectionNativeToken(collection.chain);
  const mintPriceNative = collection.mint_price_native || formatCollectionMintPrice(collection.mint_price_raw, collection.chain);
  const mintPriceLamports = BigInt(collection.mint_price_raw || "0");
  const unitPlatformFeeLamports = BigInt(collection.platform_fee_raw || "0");
  const platformFeeBps = collection.platform_fee_bps || 0;
  const baseSubtotalLamports = mintPriceLamports * BigInt(quantity);
  const platformFeeTotalLamports = unitPlatformFeeLamports * BigInt(quantity);
  const totalCostLamports = baseSubtotalLamports + platformFeeTotalLamports;
  const baseSubtotalNative = formatSolLamports(baseSubtotalLamports);
  const platformFeeNative = formatSolLamports(platformFeeTotalLamports);
  const totalCostNative = formatSolLamports(totalCostLamports);
  const isSoldOut = collection.onchain?.is_sold_out || collection.status === "SOLD_OUT";
  const remaining = collection.onchain?.remaining || (collection.max_supply - collection.total_minted).toString();
  const totalMinted = collection.onchain?.total_minted || collection.total_minted.toString();
  const progress = (parseInt(totalMinted) / collection.max_supply) * 100;
  const metaplexLoadPending = Boolean(isMetaplexMintCollection && collection.onchain?.is_fully_loaded === false);
  const metaplexStatusLabel = !isMetaplexMintCollection
    ? "Legacy"
    : metaplexLoadPending
      ? "Syncing"
      : "Ready";
  const maxMintableQuantity = isEvmCollection
    ? parseInt(remaining, 10)
    : Math.min(parseInt(remaining, 10), MAX_SOLANA_MINTS_PER_TX);
  const remainingCount = Math.max(0, parseInt(remaining, 10) || 0);
  const mintedCount = Math.max(0, parseInt(totalMinted, 10) || 0);
  const holdersCount = Math.max(0, collection.market?.owners_count ?? collection.holders_count ?? 0);
  const listedCount = Math.max(0, collection.market?.listed_count ?? 0);
  const floorPriceLabel = collection.market?.floor_price_native
    ? `${collection.market.floor_price_native} ${nativeToken}`
    : "No listings";
  const totalVolumeLabel =
    collection.market && BigInt(collection.market.total_volume_raw || "0") > BigInt(0)
      ? `${collection.market.total_volume_native} ${nativeToken}`
      : "No sales yet";
  const deployedLabel = new Date(collection.deployed_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const loadedItems = Number(collection.onchain?.items_loaded || 0);
  const availableItems = Number(collection.onchain?.items_available || collection.max_supply);
  const configProgress = availableItems > 0 ? (loadedItems / availableItems) * 100 : 0;
  const collectionDescription = collection.description?.trim() || "";
  const hasLongDescription = collectionDescription.length > 170;
  const displayedDescription =
    showFullDescription || !hasLongDescription
      ? collectionDescription
      : `${collectionDescription.slice(0, 170).trimEnd()}...`;
  const availabilityLabel = isSoldOut
    ? "Sold out"
    : isMetaplexMintCollection
      ? metaplexLoadPending
        ? "Configuring"
        : collection.mint_enabled
          ? "Mint live"
          : "Stand by"
      : isEvmCollection
        ? "Mint live"
        : "Legacy";
  const topMintPriceLabel =
    mintPriceLamports === BigInt(0)
      ? "Free"
      : `${formatSolLamports(mintPriceLamports)} ${nativeToken}`;

  return (
    <div className="min-h-screen relative noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-30" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <div className="container mx-auto px-4 py-12 relative">
        <div className="max-w-[1400px] mx-auto">
          {/* Breadcrumb */}
          <Link 
            href="/drops" 
            className={clsx(
              "inline-flex items-center gap-2 mb-8 transition-colors",
              theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Drops
          </Link>

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <CollectionViewTabs address={collection.address} active="mint" />
            <CollectionCountdown address={collection.address} variant="banner" className="flex-1 min-w-[260px]" />
          </div>

          {/* Collection Header */}
          <div className={clsx(
            "mb-8 rounded-[30px] border p-6 md:p-7",
            theme === "dark"
              ? "border-white/[0.08] bg-[#08111d]/84"
              : "border-gray-200 bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
          )}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={clsx(
                "text-overline font-mono uppercase px-3 py-1.5 rounded-full",
                theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-gray-100 text-gray-700"
              )}>
                ${collection.symbol}
              </span>
              {isSoldOut && (
                <span className="text-overline uppercase px-3 py-1.5 rounded-full bg-red-500/10 text-red-400">
                  Sold Out
                </span>
              )}
              {!isSoldOut && collection.status === "ACTIVE" && (
                <span className="text-overline uppercase px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {isEvmCollection ? "Live" : "Deployed"}
                </span>
              )}
              <span className={clsx(
                "text-overline uppercase px-3 py-1.5 rounded-full",
                theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"
              )}>
                {isMetaplexMintCollection ? "Metaplex Mint" : "Legacy Runtime"}
              </span>
            </div>
            <h1 className="text-display mb-4">{collection.name}</h1>

            {/* Agent badge */}
            <Link 
              href={`/agents/${collection.agent.id}`}
              className={clsx(
                "inline-flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all",
                theme === "dark"
                  ? "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]"
                  : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              )}
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center overflow-hidden">
                {collection.agent.avatar_url ? (
                  <img 
                    src={collection.agent.avatar_url} 
                    alt={collection.agent.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
              <div>
                <p className={clsx("text-caption", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  Deployed by
                </p>
                <p className="text-body-sm font-semibold">{collection.agent.name}</p>
              </div>
            </Link>

            {/* Description */}
            {collectionDescription ? (
              <div className="mt-4 max-w-3xl">
                <p className={clsx("text-body max-w-3xl", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                  {displayedDescription}
                </p>
                {hasLongDescription ? (
                  <button
                    type="button"
                    onClick={() => setShowFullDescription((current) => !current)}
                    className="mt-2 text-[12px] font-mono uppercase tracking-[0.18em] text-cyan-400 transition-colors hover:text-cyan-300"
                  >
                    {showFullDescription ? "Show less" : "Read more"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1.15fr)_420px] gap-6 xl:items-start">
            {/* Image - 3 columns */}
            <div className="space-y-6">
              <div className={clsx(
                "rounded-[32px] overflow-hidden border",
                theme === "dark"
                  ? "border-white/[0.08] bg-[#09111d]/92"
                  : "border-gray-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
              )}>
                <div className="relative aspect-[4/3.2] overflow-hidden group/img">
                  {collection.image_url && !imageFailed ? (
                    <img
                      src={collection.image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                      onError={() => setImageFailed(true)}
                      onLoad={(event) => {
                        const target = event.currentTarget;
                        if (
                          target.naturalWidth < MIN_COLLECTION_IMAGE_DIMENSION ||
                          target.naturalHeight < MIN_COLLECTION_IMAGE_DIMENSION
                        ) {
                          setImageFailed(true);
                        }
                      }}
                    />
                  ) : (
                    <div className={clsx(
                      "w-full h-full flex items-center justify-center",
                      theme === "dark" 
                        ? "bg-gradient-to-br from-cyan-900/20 to-purple-900/20"
                        : "bg-gradient-to-br from-cyan-50 to-purple-50"
                    )}>
                      <span className="text-8xl opacity-40">🖼️</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                  <div className="absolute left-5 right-5 top-5 flex items-start justify-between gap-3">
                    <span className={clsx(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-md",
                      theme === "dark" ? "border-white/10 bg-black/35 text-white/85" : "border-white/60 bg-white/85 text-gray-800"
                    )}>
                      <NetworkLogo family={network.family} className="w-3.5 h-3.5" />
                      {chainName}
                    </span>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-md transition-all",
                        theme === "dark" ? "border-white/10 bg-black/35 text-white/80 hover:bg-black/50" : "border-white/60 bg-white/85 text-gray-700 hover:bg-white"
                      )}
                    >
                      Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {isSoldOut && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-3xl font-bold text-red-400 uppercase tracking-wider">Sold Out</span>
                    </div>
                  )}
                </div>

                {/* Image footer - mint stats */}
                <div className={clsx("border-t px-5 py-4 md:px-6 md:py-4", theme === "dark" ? "border-white/[0.06]" : "border-gray-200")}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
                    {[
                      { label: "Supply", value: collection.max_supply.toLocaleString() },
                      { label: "Minted", value: mintedCount.toLocaleString() },
                      { label: "Owners", value: holdersCount.toLocaleString() },
                      { label: "Remaining", value: remainingCount.toLocaleString() },
                    ].map((item, index) => (
                      <div
                        key={item.label}
                        className={clsx(
                          "relative",
                          index < 3 && "md:pr-4",
                          index < 3 && theme === "dark" ? "md:border-r md:border-white/[0.06]" : "",
                          index < 3 && theme !== "dark" ? "md:border-r md:border-gray-200" : ""
                        )}
                      >
                        <p className={clsx("text-[9px] font-mono uppercase tracking-[0.22em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          {item.label}
                        </p>
                        <p className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight md:text-[26px]">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className={clsx("text-[9px] font-mono uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                        Mint progress
                      </p>
                      <p className={clsx("text-xs", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                        {progress.toFixed(1)}%
                      </p>
                    </div>
                    <div className={clsx("h-2 rounded-full overflow-hidden", theme === "dark" ? "bg-white/[0.05]" : "bg-gray-200")}>
                    <div 
                      className={clsx(
                        "h-full rounded-full transition-all duration-500",
                        progress >= 90
                          ? "bg-gradient-to-r from-orange-500 to-red-500"
                          : "bg-cyan-500"
                      )}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Details - 2 columns */}
            <div className="space-y-4 xl:sticky xl:top-24">

              {/* Mint Section */}
              <div className={clsx("glass-card space-y-6", theme === "light" && "bg-white/80")}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                      Primary mint
                    </p>
                    <h2 className="mt-3 text-4xl font-semibold tracking-tight">
                      {topMintPriceLabel}
                    </h2>
                  </div>

                  <span className={clsx(
                    "rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]",
                    isSoldOut
                      ? "bg-red-500/10 text-red-300"
                      : metaplexLoadPending
                        ? theme === "dark" ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-700"
                        : theme === "dark" ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                  )}>
                    {availabilityLabel}
                  </span>
                </div>

                {!isSoldOut && (isEvmCollection || isMetaplexMintCollection) && (
                  <div className={clsx(
                    "rounded-[28px] border p-5",
                    theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50/80"
                  )}>
                    <div className="flex items-center justify-between gap-5">
                      <div>
                        <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          Quantity
                        </p>
                        <p className={clsx("mt-1 text-sm", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                          Choose up to {maxMintableQuantity} in one checkout
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className={clsx(
                            "flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
                            theme === "dark"
                              ? "border-white/[0.08] bg-[#091320] hover:bg-white/[0.06]"
                              : "border-gray-200 bg-white hover:bg-gray-100"
                          )}
                          disabled={quantity <= 1}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-12 text-center text-2xl font-semibold">{quantity}</span>
                        <button
                          onClick={() => setQuantity(Math.min(maxMintableQuantity, quantity + 1))}
                          className={clsx(
                            "flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
                            theme === "dark"
                              ? "border-white/[0.08] bg-[#091320] hover:bg-white/[0.06]"
                              : "border-gray-200 bg-white hover:bg-gray-100"
                          )}
                          disabled={quantity >= maxMintableQuantity}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className={clsx("rounded-2xl px-4 py-4", theme === "dark" ? "bg-black/20" : "bg-white")}>
                        <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          Mint price
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                          {baseSubtotalLamports === BigInt(0) ? "Free" : `${baseSubtotalNative} ${nativeToken}`}
                        </p>
                      </div>
                      <div className={clsx("rounded-2xl px-4 py-4", theme === "dark" ? "bg-black/20" : "bg-white")}>
                        <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          Platform fee
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                          {platformFeeTotalLamports === BigInt(0) ? `0 ${nativeToken}` : `${platformFeeNative} ${nativeToken}`}
                        </p>
                        {platformFeeTotalLamports > BigInt(0) && (
                          <p className={clsx("mt-2 text-xs leading-5", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
                            {quantity > 1 ? `Fixed ${formatSolLamports(unitPlatformFeeLamports)} ${nativeToken} per mint.` : "Fixed per mint."}
                          </p>
                        )}
                      </div>
                      <div className={clsx("rounded-2xl px-4 py-4", theme === "dark" ? "bg-black/20" : "bg-white")}>
                        <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          Total due
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                          {totalCostLamports === BigInt(0) ? "Free" : `${totalCostNative} ${nativeToken}`}
                        </p>
                      </div>
                      <div className={clsx("rounded-2xl px-4 py-4", theme === "dark" ? "bg-black/20" : "bg-white")}>
                        <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          Remaining
                        </p>
                        <p className="mt-1 text-xl font-semibold">{remainingCount}</p>
                      </div>
                    </div>

                    {isMetaplexMintCollection && (
                      <div className={clsx(
                        "mt-4 rounded-2xl border px-4 py-3",
                        theme === "dark" ? "border-cyan-500/15 bg-cyan-500/[0.04]" : "border-cyan-100 bg-cyan-50/70"
                      )}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-cyan-500" />
                            <span className="text-sm font-medium">Metaplex runtime</span>
                          </div>
                          <span className={clsx(
                            "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
                            theme === "dark" ? "bg-black/20 text-cyan-200" : "bg-white text-cyan-700"
                          )}>
                            {metaplexStatusLabel}
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className={clsx("h-2 overflow-hidden rounded-full", theme === "dark" ? "bg-white/[0.07]" : "bg-white/80")}>
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
                              style={{ width: `${Math.min(configProgress, 100)}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className={clsx("text-xs", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                              {loadedItems}/{availableItems} config lines
                            </span>
                            <span className="font-mono text-xs">{Math.round(configProgress)}%</span>
                          </div>
                        </div>
                        <p className={clsx("mt-3 text-xs leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                          {metaplexLoadPending
                            ? "Configuration is still settling on-chain."
                            : "Candy Machine is fully loaded and ready for collector mints."}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Mint Button */}
                {!isConnected ? (
                  <PrivyConnectButton />
                ) : isSoldOut ? (
                  <button disabled className="w-full btn-primary py-4 text-lg opacity-50 cursor-not-allowed">
                    Sold Out
                  </button>
                ) : isEvmCollection ? (
                  <button
                    onClick={handleMint}
                    disabled={isMinting || isWritePending || isConfirming}
                    className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
                  >
                    <Sparkles className="h-5 w-5 relative z-10" />
                    <span className="relative z-10">
                      {isConfirming 
                        ? "Confirming..." 
                        : isWritePending 
                          ? "Waiting for wallet..." 
                          : isMinting 
                            ? "Minting..." 
                            : `Mint ${quantity} NFT${quantity > 1 ? "s" : ""}`}
                    </span>
                  </button>
                ) : isMetaplexMintCollection && collection.mint_enabled ? (
                  <button
                    onClick={() => void handleSolanaMint()}
                    disabled={isMinting}
                    className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
                  >
                    {isMinting ? (
                      <Loader2 className="h-5 w-5 relative z-10 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5 relative z-10" />
                    )}
                    <span className="relative z-10">
                      {isMinting
                        ? "Minting on Solana..."
                        : `Mint ${quantity} NFT${quantity > 1 ? "s" : ""}`}
                    </span>
                  </button>
                ) : isMetaplexMintCollection ? (
                  <div className="space-y-3">
                    <button disabled className="w-full btn-primary py-4 text-lg opacity-50 cursor-not-allowed">
                      Mint unavailable
                    </button>
                    <p className={clsx("text-sm leading-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                      {collection.mint_disabled_reason ||
                        (metaplexLoadPending
                          ? "This drop is still finishing its Candy Machine configuration."
                          : "Mint is not available for this collection right now.")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button disabled className="w-full btn-primary py-4 text-lg opacity-50 cursor-not-allowed">
                      Legacy runtime
                    </button>
                    <p className={clsx("text-sm leading-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                      This collection predates the Metaplex mint flow, so collector minting is not available from this page.
                    </p>
                  </div>
                )}

                {mintError && (
                  <div className={clsx(
                    "rounded-2xl border px-4 py-3 text-sm leading-6",
                    theme === "dark" ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700"
                  )}>
                    {mintError}
                  </div>
                )}

                {((isSuccess && txHash) || (mintSuccess && latestMintTxHash)) && (
                  <div className={clsx(
                    "rounded-[24px] border p-4",
                    theme === "dark" ? "border-emerald-500/20 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-lg shadow-emerald-500/20">
                        <CheckCircle className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold">Mint confirmed</p>
                        <p className={clsx("mt-1 text-sm leading-6", theme === "dark" ? "text-emerald-100/80" : "text-emerald-800/80")}>
                          {mintSuccess || `You minted ${quantity} NFT${quantity > 1 ? "s" : ""}.`}
                        </p>
                        {txExplorerUrl && (
                          <a
                            href={txExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-cyan-500 hover:underline"
                          >
                            View transaction
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Success message with enhanced animation */}
                {false && ((isSuccess && txHash) || (mintSuccess && latestMintTxHash)) && (
                  <div className="relative">
                    {/* Confetti particles */}
                    <div className="absolute -inset-4 pointer-events-none overflow-hidden">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute animate-confetti"
                          style={{
                            left: `${Math.random() * 100}%`,
                            top: `-10px`,
                            animationDelay: `${Math.random() * 0.5}s`,
                            animationDuration: `${1.5 + Math.random() * 1}s`,
                          }}
                        >
                          <div 
                            className={`w-2 h-2 rounded-full ${
                              ['bg-emerald-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-pink-400', 'bg-purple-400'][i % 5]
                            }`}
                            style={{
                              transform: `rotate(${Math.random() * 360}deg)`,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-6 bg-gradient-to-br from-emerald-500/20 via-green-500/15 to-cyan-500/20 border border-emerald-500/40 rounded-2xl relative overflow-hidden animate-in zoom-in-95 fade-in duration-500">
                      {/* Shimmer effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                      
                      {/* Glow rings */}
                      <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
                      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
                      
                      {/* Floating emojis */}
                      <div className="absolute inset-0 pointer-events-none">
                        <span className="absolute top-3 left-4 text-2xl animate-float-up opacity-80">🎉</span>
                        <span className="absolute top-2 right-8 text-xl animate-float-up opacity-70" style={{ animationDelay: '0.2s' }}>✨</span>
                        <span className="absolute bottom-4 left-12 text-lg animate-float-up opacity-60" style={{ animationDelay: '0.4s' }}>🦞</span>
                        <span className="absolute top-6 right-4 text-lg animate-float-up opacity-70" style={{ animationDelay: '0.3s' }}>💎</span>
                        <span className="absolute bottom-2 right-12 text-xl animate-float-up opacity-80" style={{ animationDelay: '0.1s' }}>🚀</span>
                      </div>
                      
                      <div className="relative">
                        <div className="flex items-center gap-4 mb-4">
                          {/* Animated checkmark */}
                          <div className="relative">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-success-pop">
                              <CheckCircle className="w-8 h-8 text-white animate-success-check" />
                            </div>
                            {/* Ripple effect */}
                            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-ping" />
                          </div>
                          <div>
                            <p className="text-emerald-300 font-bold text-xl">Mint Successful!</p>
                            <p className="text-emerald-400/70 text-sm">
                              {mintSuccess || `You minted ${quantity} NFT${quantity > 1 ? "s" : ""}`}
                            </p>
                          </div>
                        </div>
                        
                        <a
                          href={txExplorerUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500/30 hover:bg-emerald-500/40 border border-emerald-500/30 rounded-xl text-emerald-200 text-sm font-medium transition-all hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20"
                        >
                          View on Explorer
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <ShareSection
                address={collection.address}
                chain={collection.chain}
                name={collection.name}
                theme={theme}
              />

            </div>
          </div>

          <div className={clsx(
            "mt-5 rounded-[30px] border p-5 md:p-6",
            theme === "dark"
              ? "border-white/[0.08] bg-[#08111d]/84"
              : "border-gray-200 bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
          )}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-cyan-500" />
                  <h3 className="text-heading-sm">Collection details</h3>
                </div>
                <p className={clsx("mt-2 text-sm", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                  Core metadata, launch context, and explorer actions for this drop.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
                    theme === "dark"
                      ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                      : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                  )}
                >
                  View contract
                  <ExternalLink className="h-4 w-4" />
                </a>
                {collection.mint_address ? (
                  <a
                    href={getAddressExplorerUrl(collection.mint_address, collection.chain)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
                      theme === "dark"
                        ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                        : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                    )}
                  >
                    View candy machine
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailTile label="Contract" value={`${collection.address.slice(0, 6)}...${collection.address.slice(-4)}`} mono theme={theme} />
              <DetailTile label="Mint engine" value={isMetaplexMintCollection ? "Metaplex" : "Legacy runtime"} theme={theme} />
              <DetailTile label="Chain" value={chainName} theme={theme} />
              <DetailTile label="Launched" value={deployedLabel} theme={theme} />
              <DetailTile label="Royalty" value={`${(collection.royalty_bps / 100).toFixed(1)}%`} theme={theme} />
              <DetailTile label="Floor" value={floorPriceLabel} theme={theme} />
              <DetailTile label="Listed" value={listedCount.toString()} theme={theme} />
              <DetailTile label="Volume" value={totalVolumeLabel} theme={theme} />
              {collection.mint_address ? (
                <DetailTile
                  label="Candy Machine"
                  value={`${collection.mint_address.slice(0, 6)}...${collection.mint_address.slice(-4)}`}
                  mono
                  theme={theme}
                />
              ) : null}
              {isMetaplexMintCollection ? (
                <DetailTile label="Config lines" value={`${loadedItems} / ${availableItems}`} theme={theme} />
              ) : null}
              <DetailTile label="Availability" value={availabilityLabel} theme={theme} />
            </div>
          </div>

          {/* Live Chat */}
          <div className="mt-8">
            <AgentChat
              collectionAddress={collection.address}
              agentName={collection.agent.name}
              agentAvatar={collection.agent.avatar_url}
              userAddress={userAddress}
              isConnected={isConnected}
              theme={theme}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT LIVE CHAT
// ═══════════════════════════════════════════════════════════════════════

interface ChatMsg {
  id: string;
  sender_type: "agent" | "user";
  sender_address: string | null;
  sender_name: string;
  content: string;
  created_at: string;
}

function AgentChat({
  collectionAddress,
  agentName,
  agentAvatar,
  userAddress,
  isConnected,
  theme,
}: {
  collectionAddress: string;
  agentName: string;
  agentAvatar: string | null;
  userAddress: string | undefined;
  isConnected: boolean;
  theme: string;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  // Load messages
  useEffect(() => {
    async function loadMessages() {
      setLoadingChat(true);
      try {
        const res = await fetch(`/api/chat/${collectionAddress}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages);
        }
      } catch (err) {
        console.error("Failed to load chat:", err);
      } finally {
        setLoadingChat(false);
      }
    }
    loadMessages();

    // Poll every 10s
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/${collectionAddress}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages);
        }
      } catch { /* silent */ }
    }, 10000);

    return () => clearInterval(interval);
  }, [collectionAddress]);

  useEffect(() => {
    if (!initialLoadDone.current && messages.length > 0) {
      initialLoadDone.current = true;
      return;
    }
    if (initialLoadDone.current && chatScrollRef.current) {
      const el = chatScrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending || !isConnected || !userAddress) return;

    setSending(true);
    try {
      const res = await fetch(`/api/chat/${collectionAddress}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: input.trim(),
          sender_address: userAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setInput("");
      }
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={clsx(
      "rounded-2xl overflow-hidden border",
      theme === "dark"
        ? "bg-gray-900/50 border-white/[0.06]"
        : "bg-white/80 border-gray-200"
    )}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "w-full flex items-center justify-between p-4 transition-colors",
          theme === "dark" ? "hover:bg-white/[0.03]" : "hover:bg-gray-50"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            theme === "dark" ? "bg-cyan-500/10" : "bg-cyan-50"
          )}>
            <MessageSquare className="w-5 h-5 text-cyan-500" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">Chat with {agentName}</h3>
            <p className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Ask the AI creator about this collection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <span className={clsx(
              "text-xs px-2 py-0.5 rounded-full",
              theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
            )}>
              {messages.length}
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {/* Chat Body */}
      {isOpen && (
        <div className={clsx(
          "border-t",
          theme === "dark" ? "border-white/[0.06]" : "border-gray-200"
        )}>
          {/* Messages */}
          <div ref={chatScrollRef} className={clsx(
            "h-72 overflow-y-auto p-4 space-y-3",
            theme === "dark" ? "scrollbar-dark" : "scrollbar-light"
          )}>
            {loadingChat ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className={clsx("w-10 h-10 mb-3", theme === "dark" ? "text-gray-700" : "text-gray-300")} />
                <p className={clsx("text-sm", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  No messages yet. Be the first to chat!
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "flex gap-3",
                    msg.sender_type === "agent" ? "flex-row" : "flex-row-reverse"
                  )}
                >
                  {/* Avatar */}
                  <div className={clsx(
                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                    msg.sender_type === "agent"
                      ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
                      : theme === "dark"
                        ? "bg-orange-500/20 text-orange-400"
                        : "bg-orange-100 text-orange-600"
                  )}>
                    {msg.sender_type === "agent" ? (
                      agentAvatar ? (
                        <img src={agentAvatar} alt="" className="w-full h-full rounded-lg object-cover" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )
                    ) : (
                      msg.sender_name.slice(0, 2)
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={clsx(
                    "max-w-[75%] rounded-2xl px-4 py-2.5",
                    msg.sender_type === "agent"
                      ? theme === "dark"
                        ? "bg-white/[0.05] rounded-tl-md"
                        : "bg-gray-100 rounded-tl-md"
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-tr-md"
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx(
                        "text-xs font-medium",
                        msg.sender_type === "agent"
                          ? "text-cyan-500"
                          : "text-white/80"
                      )}>
                        {msg.sender_type === "agent" ? agentName : msg.sender_name}
                      </span>
                      <span className={clsx(
                        "text-xs",
                        msg.sender_type === "agent"
                          ? theme === "dark" ? "text-gray-600" : "text-gray-400"
                          : "text-white/50"
                      )}>
                        {formatChatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className={clsx(
                      "text-sm leading-relaxed break-words",
                      msg.sender_type === "agent" && (theme === "dark" ? "text-gray-300" : "text-gray-700")
                    )}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            
          </div>

          {/* Input */}
          <div className={clsx(
            "p-3 border-t",
            theme === "dark" ? "border-white/[0.06]" : "border-gray-200"
          )}>
            {isConnected ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the creator..."
                  maxLength={500}
                  className={clsx(
                    "flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
                    theme === "dark"
                      ? "bg-white/[0.03] border-white/[0.06] focus:border-cyan-500/50 text-white placeholder-gray-600"
                      : "bg-gray-50 border-gray-200 focus:border-cyan-300 text-gray-900 placeholder-gray-400"
                  )}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className={clsx(
                    "px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
                    input.trim() && !sending
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/20"
                      : theme === "dark"
                        ? "bg-white/[0.03] text-gray-600 cursor-not-allowed"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <div className={clsx(
                "text-center py-3 rounded-xl text-sm",
                theme === "dark" ? "bg-white/[0.03] text-gray-500" : "bg-gray-50 text-gray-400"
              )}>
                Connect wallet to chat
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatChatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DetailTile({
  label,
  value,
  theme,
  mono = false,
}: {
  label: string;
  value: string;
  theme: string;
  mono?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border px-4 py-3",
        theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50"
      )}
    >
      <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
        {label}
      </p>
      <p className={clsx("mt-1 text-sm font-semibold", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function ShareSection({
  address,
  chain,
  name,
  theme,
}: {
  address: string;
  chain: string;
  name: string;
  theme: string;
}) {
  const [copied, setCopied] = useState(false);
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const shareUrl = `${appUrl}/collection/${address}`;
  const networkName = getNetworkFromValue(chain).label;
  const shareText = `Check out "${name}" on Clawdmint - deployed by an AI agent on ${networkName}!`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-5 h-5 text-cyan-500" />
        <h3 className="font-semibold">Share</h3>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {/* Twitter/X */}
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-colors text-sm font-medium",
            theme === "dark"
              ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-gray-300"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          )}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post
        </a>

        {/* Telegram */}
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-colors text-sm font-medium",
            theme === "dark"
              ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-gray-300"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          )}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          Telegram
        </a>

        {/* Copy Link */}
        <button
          onClick={copyLink}
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-colors text-sm font-medium",
            copied
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : theme === "dark"
                ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-gray-300"
                : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          )}
        >
          {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
