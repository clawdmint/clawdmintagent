"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink, Loader2, Tag, Wallet } from "lucide-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { CollectionViewTabs } from "@/components/collection-view-tabs";
import { CollectionCountdown } from "@/components/collection-countdown";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { useTheme } from "@/components/theme-provider";

type SolanaWeb3Transaction = InstanceType<typeof Transaction> | InstanceType<typeof VersionedTransaction>;

interface AssetCollection {
  id: string;
  address: string;
  name: string;
  symbol: string;
  image_url: string | null;
  description: string;
  total_minted: number;
  max_supply: number;
  mint_price_native: string;
  chain: string;
  agent: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

interface AssetListing {
  id: string;
  seller_address: string;
  price_lamports: string;
  price_native: string;
  status: string;
  created_at: string;
}

interface AssetDetail {
  id: string;
  asset_address: string;
  token_id: number;
  owner_address: string;
  name: string;
  image_url: string | null;
  metadata_uri: string | null;
  minted_at: string;
  active_listing: AssetListing | null;
  collection: AssetCollection;
}

interface RelatedAsset {
  id: string;
  asset_address: string;
  token_id: number;
  name: string;
  image_url: string | null;
  owner_address: string;
}

interface RecentSale {
  id: string;
  price_native: string;
  buyer_address: string;
  seller_address: string;
  sold_at: string;
  tx_hash: string | null;
  asset: {
    address: string;
    token_id: number;
    name: string;
    image_url: string | null;
  };
}

interface AssetPayload {
  success: boolean;
  asset: AssetDetail;
  related_assets: RelatedAsset[];
  best_listings: Array<{
    id: string;
    seller_address: string;
    price_native: string;
    asset: {
      address: string;
      token_id: number;
      name: string;
      image_url: string | null;
      owner_address: string;
    };
  }>;
  recent_sales: RecentSale[];
}

function truncateAddress(address?: string | null) {
  if (!address) return "...";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatRelative(dateIso: string) {
  const diffMs = Date.now() - new Date(dateIso).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getDisplayAssetLabel(asset: Pick<AssetDetail, "name" | "token_id"> | Pick<RelatedAsset, "name" | "token_id">, collectionName: string) {
  const explicitName = asset.name?.trim();
  if (explicitName) return explicitName;
  return `${collectionName} #${asset.token_id + 1}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function deserializeSolanaTransaction(serializedBase64: string) {
  const bytes = base64ToBytes(serializedBase64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

export default function MarketplaceAssetPage() {
  const params = useParams();
  const collectionAddress = params.address as string;
  const assetAddress = params.assetAddress as string;
  const { theme } = useTheme();
  const { address: walletAddress, solanaAddress, isConnected, login } = useWallet();
  const connectedAddress = solanaAddress || walletAddress || "";

  const [payload, setPayload] = useState<AssetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [listingPrice, setListingPrice] = useState("1.00");
  const [submitting, setSubmitting] = useState<"listing" | "cancel" | "buy" | null>(null);
  const [copied, setCopied] = useState(false);

  const loadAsset = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/marketplace/assets/${assetAddress}`);
      const responseBody = await response.json().catch(() => null);
      if (!response.ok || !responseBody?.success) {
        throw new Error(responseBody?.error || "Failed to load collectible");
      }
      setPayload(responseBody as AssetPayload);
      setError("");
    } catch (loadError) {
      console.error("Failed to load marketplace asset:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Failed to load collectible");
    } finally {
      setLoading(false);
    }
  }, [assetAddress]);

  useEffect(() => {
    if (assetAddress) void loadAsset();
  }, [assetAddress, loadAsset]);

  const signPreparedTransaction = useCallback(async (serializedBase64: string) => {
    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      throw new Error("Phantom transaction signing is unavailable");
    }

    const transaction = deserializeSolanaTransaction(serializedBase64);
    const signedTransaction = (await provider.signTransaction(
      transaction as SolanaWeb3Transaction
    )) as SolanaWeb3Transaction;
    const serializedSignedTransaction = signedTransaction instanceof VersionedTransaction
      ? signedTransaction.serialize()
      : signedTransaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    return bytesToBase64(serializedSignedTransaction);
  }, []);

  const asset = payload?.asset ?? null;
  const collection = asset?.collection ?? null;
  const relatedAssets = payload?.related_assets ?? [];
  const recentSales = payload?.recent_sales ?? [];
  const isOwner = !!asset && !!connectedAddress && asset.owner_address === connectedAddress;
  const isListed = !!asset?.active_listing;
  const displayLabel = asset && collection ? getDisplayAssetLabel(asset, collection.name) : "";

  const handleCreateListing = useCallback(async () => {
    if (!asset || !connectedAddress) return;
    setSubmitting("listing");
    setNotice("");
    setError("");

    try {
      const prepareResponse = await fetch("/api/marketplace/listings/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_address: asset.asset_address,
          wallet_address: connectedAddress,
          price_native: listingPrice,
        }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null);
      if (!prepareResponse.ok || !prepareBody?.success) {
        throw new Error(prepareBody?.error || "Failed to prepare listing");
      }

      const signedTransactionBase64 = await signPreparedTransaction(prepareBody.listing.serialized_transaction_base64);

      const confirmResponse = await fetch("/api/marketplace/listings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_address: asset.asset_address,
          wallet_address: connectedAddress,
          price_lamports: prepareBody.listing.price_lamports,
          signed_transaction_base64: signedTransactionBase64,
        }),
      });
      const confirmBody = await confirmResponse.json().catch(() => null);
      if (!confirmResponse.ok || !confirmBody?.success) {
        throw new Error(confirmBody?.error || "Failed to confirm listing");
      }

      setNotice(`${displayLabel} listed for ${listingPrice} SOL.`);
      await loadAsset();
    } catch (listingError) {
      console.error("Failed to create listing:", listingError);
      setError(listingError instanceof Error ? listingError.message : "Failed to create listing");
    } finally {
      setSubmitting(null);
    }
  }, [asset, connectedAddress, displayLabel, listingPrice, loadAsset, signPreparedTransaction]);

  const handleCancelListing = useCallback(async () => {
    if (!asset?.active_listing || !connectedAddress) return;
    setSubmitting("cancel");
    setNotice("");
    setError("");

    try {
      const prepareResponse = await fetch("/api/marketplace/listings/cancel/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: asset.active_listing.id,
          wallet_address: connectedAddress,
        }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null);
      if (!prepareResponse.ok || !prepareBody?.success) {
        throw new Error(prepareBody?.error || "Failed to prepare cancellation");
      }

      const signedTransactionBase64 = await signPreparedTransaction(prepareBody.cancellation.serialized_transaction_base64);

      const confirmResponse = await fetch("/api/marketplace/listings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: asset.active_listing.id,
          wallet_address: connectedAddress,
          signed_transaction_base64: signedTransactionBase64,
        }),
      });
      const confirmBody = await confirmResponse.json().catch(() => null);
      if (!confirmResponse.ok || !confirmBody?.success) {
        throw new Error(confirmBody?.error || "Failed to cancel listing");
      }

      setNotice(`Listing for ${displayLabel} cancelled.`);
      await loadAsset();
    } catch (cancelError) {
      console.error("Failed to cancel listing:", cancelError);
      setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel listing");
    } finally {
      setSubmitting(null);
    }
  }, [asset, connectedAddress, displayLabel, loadAsset, signPreparedTransaction]);

  const handleBuyNow = useCallback(async () => {
    if (!asset?.active_listing || !connectedAddress) return;
    setSubmitting("buy");
    setNotice("");
    setError("");

    try {
      const prepareResponse = await fetch("/api/marketplace/buy/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: asset.active_listing.id,
          wallet_address: connectedAddress,
        }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null);
      if (!prepareResponse.ok || !prepareBody?.success) {
        throw new Error(prepareBody?.error || "Failed to prepare purchase");
      }

      const signedTransactionBase64 = await signPreparedTransaction(prepareBody.purchase.serialized_transaction_base64);

      const confirmResponse = await fetch("/api/marketplace/buy/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: asset.active_listing.id,
          wallet_address: connectedAddress,
          signed_transaction_base64: signedTransactionBase64,
        }),
      });
      const confirmBody = await confirmResponse.json().catch(() => null);
      if (!confirmResponse.ok || !confirmBody?.success) {
        throw new Error(confirmBody?.error || "Failed to settle purchase");
      }

      setNotice(`Bought ${displayLabel} for ${asset.active_listing.price_native} SOL.`);
      await loadAsset();
    } catch (buyError) {
      console.error("Failed to buy listing:", buyError);
      setError(buyError instanceof Error ? buyError.message : "Failed to settle purchase");
    } finally {
      setSubmitting(null);
    }
  }, [asset, connectedAddress, displayLabel, loadAsset, signPreparedTransaction]);

  const copyAddress = useCallback(async () => {
    if (!asset) return;
    await navigator.clipboard.writeText(asset.asset_address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [asset]);

  const stats = useMemo(() => {
    const floor = payload?.best_listings?.[0]?.price_native ? `${payload.best_listings[0].price_native} SOL` : "No floor";
    const lastSale = recentSales[0]?.price_native ? `${recentSales[0].price_native} SOL` : "No sales yet";
    return { floor, lastSale };
  }, [payload?.best_listings, recentSales]);

  if (loading) return <div className="min-h-screen" />;
  if (!asset || !collection) return <div className="min-h-screen" />;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg" />
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href={`/marketplace/${collectionAddress}`} className={clsx("inline-flex items-center gap-2 text-sm", theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Collection Market
            </Link>
            <CollectionViewTabs address={collection.address} active="market" />
          </div>

          <CollectionCountdown address={collection.address} variant="banner" />

          <div className="flex gap-3 overflow-x-auto pb-2">
            {relatedAssets.map((related) => {
              const relatedLabel = getDisplayAssetLabel(related, collection.name);
              const isActive = related.asset_address === asset.asset_address;
              return (
                <Link
                  key={related.id}
                  href={`/marketplace/${collection.address}/${related.asset_address}`}
                  className={clsx(
                    "min-w-[76px] overflow-hidden rounded-2xl border p-1 transition-colors",
                    isActive
                      ? "border-cyan-400/40 bg-cyan-400/10"
                      : theme === "dark"
                        ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  <div className="aspect-square overflow-hidden rounded-[14px] bg-black/20">
                    {related.image_url ? <img src={related.image_url} alt={relatedLabel} className="h-full w-full object-cover" /> : null}
                  </div>
                </Link>
              );
            })}
          </div>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className={clsx("overflow-hidden rounded-[30px] border", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
              <div className="aspect-[1.02] overflow-hidden bg-black/20">
                {asset.image_url ? <img src={asset.image_url} alt={displayLabel} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-gray-500">No preview</div>}
              </div>
            </div>

            <aside className={clsx("rounded-[30px] border p-6", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200">{isListed ? "Listed" : "Unlisted"}</span>
                    <button onClick={copyAddress} className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em]", theme === "dark" ? "border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white" : "border-gray-200 bg-gray-50 text-gray-500 hover:text-gray-900")}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Asset"}
                    </button>
                  </div>
                  <div>
                    <p className={clsx("font-mono text-[10px] uppercase tracking-[0.24em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>{collection.name}</p>
                    <h1 className="mt-3 text-4xl font-semibold tracking-tight">{displayLabel}</h1>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Owned by {truncateAddress(asset.owner_address)}</span>
                      <span className={theme === "dark" ? "text-gray-600" : "text-gray-300"}>•</span>
                      <a href={`https://solscan.io/account/${asset.asset_address}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
                        View asset <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>

                {notice ? <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}
                {error ? <div className="rounded-[22px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

                <div className={clsx("rounded-[24px] border p-5", theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                  <p className={clsx("font-mono text-[10px] uppercase tracking-[0.22em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Total price</p>
                  <p className="mt-3 text-[3rem] font-semibold tracking-tight leading-none">{asset.active_listing ? `${asset.active_listing.price_native} SOL` : "Not listed"}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className={clsx("rounded-[20px] border px-4 py-3", theme === "dark" ? "border-white/[0.08] bg-[#08111d]" : "border-gray-200 bg-white") }>
                      <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Floor price</p>
                      <p className="mt-2 text-xl font-semibold">{stats.floor}</p>
                    </div>
                    <div className={clsx("rounded-[20px] border px-4 py-3", theme === "dark" ? "border-white/[0.08] bg-[#08111d]" : "border-gray-200 bg-white") }>
                      <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Last sale</p>
                      <p className="mt-2 text-xl font-semibold">{stats.lastSale}</p>
                    </div>
                  </div>
                </div>

                <div className={clsx("rounded-[24px] border p-5", theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-cyan-300" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">Trade controls</p>
                  </div>

                  {!isConnected ? (
                    <button onClick={login} className="mt-4 w-full rounded-[20px] bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white">Connect wallet</button>
                  ) : isOwner ? (
                    isListed ? (
                      <button
                        onClick={handleCancelListing}
                        disabled={submitting !== null}
                        className="mt-4 w-full rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-white/[0.07] disabled:opacity-60"
                      >
                        {submitting === "cancel" ? "Cancelling..." : "Cancel listing"}
                      </button>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                          <input
                            value={listingPrice}
                            onChange={(event) => setListingPrice(event.target.value)}
                            className={clsx("rounded-[18px] border px-4 py-3 text-lg outline-none", theme === "dark" ? "border-white/[0.08] bg-[#08111d] text-white" : "border-gray-200 bg-white text-gray-900")}
                          />
                          <div className={clsx("flex items-center justify-center rounded-[18px] border text-sm font-semibold", theme === "dark" ? "border-white/[0.08] bg-[#08111d] text-gray-300" : "border-gray-200 bg-white text-gray-700")}>SOL</div>
                        </div>
                        <button
                          onClick={handleCreateListing}
                          disabled={submitting !== null}
                          className="w-full rounded-[20px] bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white disabled:opacity-60"
                        >
                          {submitting === "listing" ? "Creating listing..." : "Create listing"}
                        </button>
                      </div>
                    )
                  ) : asset.active_listing ? (
                    <button
                      onClick={handleBuyNow}
                      disabled={submitting !== null}
                      className="mt-4 w-full rounded-[20px] bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white disabled:opacity-60"
                    >
                      {submitting === "buy" ? "Submitting purchase..." : `Buy now for ${asset.active_listing.price_native} SOL`}
                    </button>
                  ) : (
                    <div className={clsx("mt-4 rounded-[20px] border px-4 py-4 text-sm", theme === "dark" ? "border-white/[0.08] bg-[#08111d] text-gray-400" : "border-gray-200 bg-white text-gray-500")}>This collectible is not currently listed.</div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={clsx("rounded-[22px] border p-4", theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                    <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Collection</p>
                    <p className="mt-2 text-base font-semibold">{collection.name}</p>
                  </div>
                  <div className={clsx("rounded-[22px] border p-4", theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                    <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Creator</p>
                    <p className="mt-2 text-base font-semibold">{collection.agent.name}</p>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className={clsx("rounded-[30px] border p-6", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">Recent sales</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Market history</h2>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {recentSales.map((sale) => (
                  <div key={sale.id} className={clsx("flex items-center justify-between gap-4 rounded-[22px] border px-4 py-4", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                    <div>
                      <p className="text-sm font-semibold">{getDisplayAssetLabel(sale.asset, collection.name)}</p>
                      <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Buyer {truncateAddress(sale.buyer_address)} • Seller {truncateAddress(sale.seller_address)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{sale.price_native} SOL</p>
                      <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>{formatRelative(sale.sold_at)}</p>
                    </div>
                  </div>
                ))}
                {recentSales.length === 0 ? <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>No fills yet. Once this collection starts trading, sales history will populate here.</p> : null}
              </div>
            </div>

            <aside className={clsx("rounded-[30px] border p-6", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">Best asks</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Live order book</h2>
              <div className="mt-5 space-y-3">
                {payload?.best_listings?.slice(0, 6).map((listing) => (
                  <Link key={listing.id} href={`/marketplace/${collection.address}/${listing.asset.address}`} className={clsx("flex items-center justify-between gap-3 rounded-[22px] border px-4 py-4 transition-colors", theme === "dark" ? "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]" : "border-gray-200 bg-gray-50 hover:bg-gray-100") }>
                    <div>
                      <p className="text-sm font-semibold">{getDisplayAssetLabel(listing.asset, collection.name)}</p>
                      <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Seller {truncateAddress(listing.seller_address)}</p>
                    </div>
                    <p className="text-sm font-semibold text-cyan-300">{listing.price_native} SOL</p>
                  </Link>
                ))}
                {!payload?.best_listings?.length ? <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>No active asks yet for this collection.</p> : null}
              </div>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}


