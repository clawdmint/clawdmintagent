"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  LayoutGrid,
  LineChart,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wallet,
} from "lucide-react";
import { CollectionViewTabs } from "@/components/collection-view-tabs";
import { getPhantomProvider, useWallet } from "@/components/wallet-context";
import { useTheme } from "@/components/theme-provider";

interface CollectionDetail {
  id: string;
  address: string;
  name: string;
  description: string;
  image_url: string;
  total_minted: number;
  max_supply: number;
  native_token: string;
  mint_price_native: string;
  market?: {
    owners_count: number;
    listed_count: number;
    floor_price_native: string | null;
    total_volume_native: string;
  };
  agent: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

interface MarketplaceListing {
  id: string;
  seller_address: string;
  price_native: string;
  status: string;
  created_at: string;
  asset: {
    address: string;
    token_id: number;
    name: string;
    image_url: string | null;
    owner_address: string;
  };
}

interface MarketplaceAsset {
  id: string;
  asset_address: string;
  token_id: number;
  owner_address: string;
  name: string;
  image_url: string | null;
  metadata_uri: string | null;
  minted_at: string;
  active_listing: MarketplaceListing | null;
}

interface MarketplaceSale {
  id: string;
  price_native: string;
  buyer_address: string;
  seller_address: string;
  sold_at: string;
  asset: {
    address: string;
    token_id: number;
    name: string;
    image_url: string | null;
  };
}

interface MarketSummary {
  ownersCount: number;
  listedCount: number;
  floorPriceNative: string | null;
  totalVolumeNative: string;
  recentSales: MarketplaceSale[];
}

interface CollectionMarketPayload {
  success: boolean;
  market: {
    summary: MarketSummary;
    listings: MarketplaceListing[];
    assets: MarketplaceAsset[];
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function deserializeSolanaTransaction(serializedBase64: string): Transaction | VersionedTransaction {
  const bytes = base64ToBytes(serializedBase64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
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

function getDisplayAssetLabel(
  asset: Pick<MarketplaceAsset, "name" | "token_id"> | Pick<MarketplaceListing["asset"], "name" | "token_id">,
  collectionName: string
) {
  const explicitName = asset.name?.trim();
  if (explicitName) return explicitName;
  return `${collectionName} #${asset.token_id + 1}`;
}

function parsePrice(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function StatBox({ label, value, theme }: { label: string; value: string; theme: string }) {
  return (
    <div
      className={clsx(
        "rounded-[22px] border px-4 py-4",
        theme === "dark" ? "border-white/[0.08] bg-[#08111d]/84" : "border-gray-200 bg-white"
      )}
    >
      <p className={clsx("font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>{label}</p>
      <p className="mt-2 text-[1.8rem] font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function PillButton({
  active,
  children,
  onClick,
  theme,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  theme: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.16em] transition-colors",
        active
          ? theme === "dark"
            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
            : "border-cyan-300 bg-cyan-50 text-cyan-700"
          : theme === "dark"
            ? "border-white/[0.08] bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-white"
            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      {children}
    </button>
  );
}

export default function CollectionMarketPage() {
  const params = useParams();
  const address = params.address as string;
  const { theme } = useTheme();
  const { address: walletAddress, solanaAddress, isConnected } = useWallet();
  const connectedAddress = solanaAddress || walletAddress || "";

  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [market, setMarket] = useState<CollectionMarketPayload["market"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "listed" | "unlisted" | "owned">("all");
  const [priceFilter, setPriceFilter] = useState<"any" | "under-0.5" | "0.5-1" | "1+">("any");
  const [sortMode, setSortMode] = useState<"listed-low-high" | "listed-newest" | "token-asc" | "token-desc">("listed-low-high");
  const [buyingAssetAddress, setBuyingAssetAddress] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [collectionResponse, marketResponse] = await Promise.all([
        fetch(`/api/collections/${address}`),
        fetch(`/api/collections/${address}/market`),
      ]);

      const collectionPayload = await collectionResponse.json().catch(() => null);
      const marketPayload = await marketResponse.json().catch(() => null);

      if (!collectionResponse.ok || !collectionPayload?.success) {
        throw new Error(collectionPayload?.error || "Failed to load collection");
      }
      if (!marketResponse.ok || !marketPayload?.success) {
        throw new Error(marketPayload?.error || "Failed to load collection market");
      }

      setCollection(collectionPayload.collection as CollectionDetail);
      setMarket(marketPayload.market as CollectionMarketPayload["market"]);
      setError("");
    } catch (loadError) {
      console.error("Failed to load collection market:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Failed to load collection market");
    } finally {
      setLoading(false);
    }
  }, [address]);

  const signPreparedTransaction = useCallback(async (serializedBase64: string) => {
    const provider = getPhantomProvider();
    if (!provider?.signTransaction) {
      throw new Error("Phantom transaction signing is unavailable");
    }

    const transaction = deserializeSolanaTransaction(serializedBase64);
    const signedTransaction = (await provider.signTransaction(transaction as Transaction | VersionedTransaction)) as Transaction | VersionedTransaction;
    const serializedSignedTransaction = signedTransaction instanceof VersionedTransaction
      ? signedTransaction.serialize()
      : signedTransaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    return bytesToBase64(serializedSignedTransaction);
  }, []);

  const handleCardBuyNow = useCallback(async (asset: MarketplaceAsset) => {
    if (!asset.active_listing) {
      return;
    }

    if (!isConnected || !connectedAddress) {
      setError("Connect Phantom to buy listed NFTs.");
      return;
    }

    setBuyingAssetAddress(asset.asset_address);
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

      const signedTransactionBase64 = await signPreparedTransaction(
        prepareBody.purchase.serialized_transaction_base64
      );

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

      setNotice(`Bought ${getDisplayAssetLabel(asset, collection?.name || "Asset")} for ${asset.active_listing.price_native} SOL.`);
      await loadData();
    } catch (buyError) {
      console.error("Failed to buy listing from card:", buyError);
      setError(buyError instanceof Error ? buyError.message : "Failed to settle purchase");
    } finally {
      setBuyingAssetAddress(null);
    }
  }, [collection?.name, connectedAddress, isConnected, loadData, signPreparedTransaction]);

  useEffect(() => {
    if (address) void loadData();
  }, [address, loadData]);

  const inventory = market?.assets ?? [];
  const activeListings = market?.listings ?? [];
  const recentSales = market?.summary.recentSales ?? [];

  const topOwners = useMemo(() => {
    const ownerMap = new Map<string, number>();
    for (const asset of inventory) {
      if (!asset.owner_address) continue;
      ownerMap.set(asset.owner_address, (ownerMap.get(asset.owner_address) ?? 0) + 1);
    }
    return Array.from(ownerMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([owner, count]) => ({ owner, count }));
  }, [inventory]);

  const activityFeed = useMemo(() => {
    const listingEntries = activeListings.slice(0, 8).map((listing) => ({
      id: `listing:${listing.id}`,
      type: "list" as const,
      created_at: listing.created_at,
      label: getDisplayAssetLabel(listing.asset, collection?.name || "Asset"),
      value: `${listing.price_native} SOL`,
      actor: listing.seller_address,
    }));

    const saleEntries = recentSales.slice(0, 8).map((sale) => ({
      id: `sale:${sale.id}`,
      type: "sale" as const,
      created_at: sale.sold_at,
      label: getDisplayAssetLabel(sale.asset, collection?.name || "Asset"),
      value: `${sale.price_native} SOL`,
      actor: sale.buyer_address,
    }));

    return [...listingEntries, ...saleEntries]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 12);
  }, [activeListings, recentSales, collection?.name]);

  const filteredInventory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = inventory.filter((asset) => {
      const label = getDisplayAssetLabel(asset, collection?.name || "Asset").toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        label.includes(normalizedQuery) ||
        (asset.owner_address || "").toLowerCase().includes(normalizedQuery);
      if (!matchesQuery) return false;

      const isOwned = !!connectedAddress && asset.owner_address === connectedAddress;
      const isListed = !!asset.active_listing;
      if (statusFilter === "listed" && !isListed) return false;
      if (statusFilter === "unlisted" && isListed) return false;
      if (statusFilter === "owned" && !isOwned) return false;

      if (priceFilter !== "any") {
        const price = asset.active_listing ? parsePrice(asset.active_listing.price_native) : Number.POSITIVE_INFINITY;
        if (priceFilter === "under-0.5" && !(price < 0.5)) return false;
        if (priceFilter === "0.5-1" && !(price >= 0.5 && price <= 1)) return false;
        if (priceFilter === "1+" && !(price >= 1)) return false;
      }

      return true;
    });

    return items.sort((left, right) => {
      if (sortMode === "token-asc") return left.token_id - right.token_id;
      if (sortMode === "token-desc") return right.token_id - left.token_id;
      if (sortMode === "listed-newest") {
        const leftTime = left.active_listing ? new Date(left.active_listing.created_at).getTime() : 0;
        const rightTime = right.active_listing ? new Date(right.active_listing.created_at).getTime() : 0;
        return rightTime - leftTime;
      }

      const leftPrice = left.active_listing ? parsePrice(left.active_listing.price_native) : Number.POSITIVE_INFINITY;
      const rightPrice = right.active_listing ? parsePrice(right.active_listing.price_native) : Number.POSITIVE_INFINITY;
      if (leftPrice !== rightPrice) return leftPrice - rightPrice;
      return left.token_id - right.token_id;
    });
  }, [inventory, query, collection?.name, connectedAddress, statusFilter, priceFilter, sortMode]);

  if (loading) {
    return <div className="min-h-screen" />;
  }

  if (!collection || !market) {
    return <div className="min-h-screen" />;
  }

  const heroPrice = parsePrice(collection.mint_price_native) === 0 ? "Free mint" : `${collection.mint_price_native} ${collection.native_token}`;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg" />
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/marketplace" className={clsx("inline-flex items-center gap-2 text-sm", theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Marketplace
            </Link>
            <CollectionViewTabs address={collection.address} active="market" />
          </div>

          <section className={clsx("overflow-hidden rounded-[30px] border", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="relative overflow-hidden px-6 py-7 lg:px-8 lg:py-8">
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `linear-gradient(135deg, rgba(34,211,238,0.18), transparent 40%), url(${collection.image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                <div className="relative space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200">Collection Market</span>
                    <span className={clsx("rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em]", theme === "dark" ? "border-white/[0.08] bg-white/[0.03] text-gray-400" : "border-gray-200 bg-gray-50 text-gray-500")}>{inventory.length} assets indexed</span>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[200px_minmax(0,1fr)] xl:items-end">
                    <div className="aspect-square w-full max-w-[200px] overflow-hidden rounded-[26px] border border-white/[0.08] bg-black/30 shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
                      <img src={collection.image_url} alt={collection.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className={clsx("font-mono text-[11px] uppercase tracking-[0.28em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Curated secondary market</p>
                        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{collection.name}</h1>
                        <p className={clsx("mt-3 max-w-3xl text-sm leading-7 md:text-[15px]", theme === "dark" ? "text-gray-300" : "text-gray-600")}>{collection.description}</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <StatBox label="Owners" value={String(market.summary.ownersCount)} theme={theme} />
                        <StatBox label="Listed" value={String(market.summary.listedCount)} theme={theme} />
                        <StatBox label="Floor" value={market.summary.floorPriceNative ? `${market.summary.floorPriceNative} SOL` : "No listings"} theme={theme} />
                        <StatBox label="Volume" value={`${market.summary.totalVolumeNative} SOL`} theme={theme} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside className={clsx("border-l px-5 py-6 lg:px-6", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50/70") }>
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className={clsx("flex h-11 w-11 items-center justify-center rounded-2xl", theme === "dark" ? "bg-cyan-400/10 text-cyan-300" : "bg-cyan-50 text-cyan-600") }>
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">Your market console</p>
                    </div>
                  </div>
                  <div className={clsx("rounded-[24px] border p-4", theme === "dark" ? "border-white/[0.08] bg-[#091321]" : "border-gray-200 bg-white") }>
                    <p className={clsx("font-mono text-[10px] uppercase tracking-[0.22em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Connected wallet</p>
                    <p className="mt-3 text-lg font-semibold">{connectedAddress ? truncateAddress(connectedAddress) : "Wallet not connected"}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className={clsx("rounded-[22px] border p-4", theme === "dark" ? "border-white/[0.08] bg-[#091321]" : "border-gray-200 bg-white") }>
                      <p className={clsx("font-mono text-[10px] uppercase tracking-[0.22em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Owned here</p>
                      <p className="mt-2 text-3xl font-semibold">{inventory.filter((asset) => asset.owner_address === connectedAddress).length}</p>
                    </div>
                    <div className={clsx("rounded-[22px] border p-4", theme === "dark" ? "border-white/[0.08] bg-[#091321]" : "border-gray-200 bg-white") }>
                      <p className={clsx("font-mono text-[10px] uppercase tracking-[0.22em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Active listings</p>
                      <p className="mt-2 text-3xl font-semibold">{activeListings.length}</p>
                    </div>
                  </div>
                  <div className={clsx("rounded-[24px] border p-4", theme === "dark" ? "border-white/[0.08] bg-[#091321]" : "border-gray-200 bg-white") }>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">Best asks</p>
                      <span className={clsx("rounded-full px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-400" : "bg-gray-100 text-gray-500")}>{activeListings.length}</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {activeListings.slice(0, 4).map((listing) => (
                        <Link key={listing.id} href={`/marketplace/${collection.address}/${listing.asset.address}`} className={clsx("flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 transition-colors", theme === "dark" ? "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]" : "border-gray-200 bg-gray-50 hover:bg-gray-100") }>
                          <div>
                            <p className="text-sm font-semibold">{getDisplayAssetLabel(listing.asset, collection.name)}</p>
                            <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Seller {truncateAddress(listing.seller_address)}</p>
                          </div>
                          <p className="text-sm font-semibold text-cyan-300">{listing.price_native} SOL</p>
                        </Link>
                      ))}
                      {activeListings.length === 0 ? <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>No active listings yet for this collection.</p> : null}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            <aside className={clsx("rounded-[28px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
              <div className="flex items-center gap-3">
                <div className={clsx("flex h-10 w-10 items-center justify-center rounded-2xl", theme === "dark" ? "bg-white/[0.04] text-white" : "bg-gray-100 text-gray-700") }>
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">Filters</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">Tighten the board</h2>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <p className={clsx("mb-3 font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Status</p>
                  <div className="flex flex-wrap gap-2">
                    <PillButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")} theme={theme}>All</PillButton>
                    <PillButton active={statusFilter === "listed"} onClick={() => setStatusFilter("listed")} theme={theme}>Listed</PillButton>
                    <PillButton active={statusFilter === "unlisted"} onClick={() => setStatusFilter("unlisted")} theme={theme}>Unlisted</PillButton>
                    <PillButton active={statusFilter === "owned"} onClick={() => setStatusFilter("owned")} theme={theme}>Owned</PillButton>
                  </div>
                </div>

                <div>
                  <p className={clsx("mb-3 font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Price</p>
                  <div className="flex flex-wrap gap-2">
                    <PillButton active={priceFilter === "any"} onClick={() => setPriceFilter("any")} theme={theme}>Any</PillButton>
                    <PillButton active={priceFilter === "under-0.5"} onClick={() => setPriceFilter("under-0.5")} theme={theme}>{"< 0.5"}</PillButton>
                    <PillButton active={priceFilter === "0.5-1"} onClick={() => setPriceFilter("0.5-1")} theme={theme}>0.5 - 1</PillButton>
                    <PillButton active={priceFilter === "1+"} onClick={() => setPriceFilter("1+")} theme={theme}>{"> 1"}</PillButton>
                  </div>
                </div>

                <div className={clsx("rounded-[22px] border p-4", theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                  <p className={clsx("font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Quick collection snapshot</p>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between"><span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Mint price</span><span className="font-semibold">{heroPrice}</span></div>
                    <div className="flex items-center justify-between"><span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Creator</span><span className="font-semibold">{collection.agent.name}</span></div>
                    <div className="flex items-center justify-between"><span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Supply</span><span className="font-semibold">{collection.total_minted}/{collection.max_supply}</span></div>
                  </div>
                </div>
              </div>
            </aside>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border px-4 py-4 lg:px-5" style={{ borderColor: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgb(229 231 235)", background: theme === "dark" ? "rgba(7,17,29,0.88)" : "white" }}>
                <div className="flex items-center gap-3">
                  <div className={clsx("flex h-10 w-10 items-center justify-center rounded-2xl", theme === "dark" ? "bg-white/[0.04] text-white" : "bg-gray-100 text-gray-700") }>
                    <LayoutGrid className="h-4 w-4" />
                  </div>
                  <div className="relative min-w-[220px] flex-1">
                    <Search className={clsx("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", theme === "dark" ? "text-gray-500" : "text-gray-400") } />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search editions, owners, or asset labels"
                      className={clsx("w-full rounded-2xl border py-3 pl-10 pr-4 text-sm outline-none transition-colors", theme === "dark" ? "border-white/[0.08] bg-white/[0.03] text-white placeholder:text-gray-500 focus:border-cyan-400/30" : "border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:border-cyan-300")}
                    />
                  </div>
                </div>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
                  style={{ colorScheme: theme === "dark" ? "dark" : "light" }}
                  className={clsx("rounded-2xl border px-4 py-3 text-sm outline-none", theme === "dark" ? "border-white/[0.08] bg-white/[0.03] text-white [color-scheme:dark]" : "border-gray-200 bg-gray-50 text-gray-900 [color-scheme:light]")}
                >
                  <option value="listed-low-high">Price: low to high</option>
                  <option value="listed-newest">Newest listings</option>
                  <option value="token-asc">Edition: ascending</option>
                  <option value="token-desc">Edition: descending</option>
                </select>
              </div>

              {notice ? <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}
              {error ? <div className="rounded-[22px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredInventory.map((asset) => {
                  const assetLabel = getDisplayAssetLabel(asset, collection.name);
                  const assetHref = `/marketplace/${collection.address}/${asset.asset_address}`;
                  const isOwned = connectedAddress === asset.owner_address;
                  return (
                    <article
                      key={asset.id}
                      className={clsx("group overflow-hidden rounded-[26px] border transition-all", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/90 hover:-translate-y-1 hover:border-cyan-400/20 hover:bg-[#0b1727]" : "border-gray-200 bg-white hover:-translate-y-1 hover:shadow-xl")}
                    >
                      <Link href={assetHref} className="block">
                      <div className="relative aspect-square overflow-hidden border-b border-white/[0.06] bg-black/20">
                        {asset.image_url ? (
                          <img src={asset.image_url} alt={assetLabel} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-gray-500">No preview</div>
                        )}
                        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 py-3">
                          <span className={clsx("rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]", asset.active_listing ? "bg-cyan-400/15 text-cyan-200" : "bg-black/35 text-white/70")}>{asset.active_listing ? "Listed" : "Unlisted"}</span>
                          {isOwned ? <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200">Owned</span> : null}
                        </div>
                      </div>
                      <div className="space-y-4 px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="line-clamp-1 text-xl font-semibold tracking-tight">{assetLabel}</h3>
                              <p className={clsx("mt-1 text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>Owner {truncateAddress(asset.owner_address)}</p>
                            </div>
                            <ArrowUpRight className={clsx("mt-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5", theme === "dark" ? "text-gray-500" : "text-gray-400") } />
                          </div>
                        </div>

                        <div className={clsx("rounded-[20px] border px-4 py-3", theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                          <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Market status</p>
                          {asset.active_listing ? (
                            <div className="mt-2 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-2xl font-semibold tracking-tight">{asset.active_listing.price_native}</p>
                                <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Listed {formatRelative(asset.active_listing.created_at)}</p>
                              </div>
                              <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200">SOL</span>
                            </div>
                          ) : (
                            <>
                              <p className="mt-2 text-xl font-semibold tracking-tight">Not listed yet</p>
                              <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Open detail view to list or inspect.</p>
                            </>
                          )}
                        </div>
                      </div>
                      </Link>
                      {asset.active_listing && !isOwned ? (
                        <div className="px-4 pb-4">
                          <button
                            type="button"
                            onClick={() => void handleCardBuyNow(asset)}
                            disabled={buyingAssetAddress === asset.asset_address}
                            className={clsx(
                              "flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition-all",
                              theme === "dark"
                                ? "border-cyan-400/20 bg-gradient-to-r from-cyan-400/14 to-blue-500/12 text-white hover:border-cyan-300/35 hover:from-cyan-400/18 hover:to-blue-500/16"
                                : "border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 text-gray-900 hover:border-cyan-300"
                            )}
                          >
                            <div>
                              <p className="text-sm font-semibold">Buy now</p>
                              <p className={clsx("mt-0.5 text-[11px]", theme === "dark" ? "text-cyan-100/70" : "text-gray-500")}>
                                {asset.active_listing.price_native} SOL
                              </p>
                            </div>
                            {buyingAssetAddress === asset.asset_address ? (
                              <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Signing...</span>
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              {filteredInventory.length === 0 ? (
                <div className={clsx("rounded-[28px] border px-6 py-10 text-center", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
                  <Sparkles className="mx-auto h-8 w-8 text-cyan-300" />
                  <h3 className="mt-4 text-2xl font-semibold tracking-tight">No assets match this filter</h3>
                  <p className={clsx("mt-2 text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>Try resetting status, price, or search to widen the board.</p>
                </div>
              ) : null}
            </div>

            <aside className="space-y-5">
              <div className={clsx("rounded-[28px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-cyan-300" />
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">Activity</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight">Live market tape</h2>
                    </div>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {activityFeed.map((entry) => (
                    <div key={entry.id} className={clsx("rounded-[22px] border px-4 py-3", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{entry.label}</p>
                          <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>{entry.type === "sale" ? "Bought by" : "Listed by"} {truncateAddress(entry.actor)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{entry.value}</p>
                          <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>{formatRelative(entry.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activityFeed.length === 0 ? <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Activity will populate here as listings and fills come in.</p> : null}
                </div>
              </div>

              <div className={clsx("rounded-[28px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#07111d]/88" : "border-gray-200 bg-white") }>
                <div className="flex items-center gap-3">
                  <LineChart className="h-5 w-5 text-cyan-300" />
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">Analytics</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">Top owners</h2>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {topOwners.map((owner, index) => (
                    <div key={owner.owner} className={clsx("flex items-center justify-between rounded-[22px] border px-4 py-3", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50") }>
                      <div className="flex items-center gap-3">
                        <div className={clsx("flex h-9 w-9 items-center justify-center rounded-2xl font-mono text-xs", theme === "dark" ? "bg-white/[0.06] text-gray-300" : "bg-white text-gray-500")}>{index + 1}</div>
                        <div>
                          <p className="text-sm font-semibold">{truncateAddress(owner.owner)}</p>
                          <p className={clsx("mt-1 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Collector wallet</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-cyan-300">{owner.count}</p>
                    </div>
                  ))}
                  {topOwners.length === 0 ? <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>Owner distribution will appear here once assets are indexed.</p> : null}
                </div>
              </div>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}


