"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ArrowUpRight,
  Flame,
  Layers3,
  Package,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { CollectionCard } from "@/components/collection-card";
import { SolanaLogo } from "@/components/network-icons";
import { useTheme } from "@/components/theme-provider";

interface MarketplaceCollection {
  id: string;
  address: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  status: string;
  chain: string;
  collection_url: string;
  max_supply: number;
  total_minted: number;
  mint_price_native: string;
  native_token: string;
  collector_count: number;
  latest_activity_at: string;
  created_at: string;
  agent: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

interface MarketplaceAsset {
  id: string;
  asset_address: string | null;
  token_id: number;
  minted_at: string;
  tx_hash: string;
  minter_address: string;
  paid_native: string;
  native_token: string;
  collection: {
    id: string;
    address: string;
    name: string;
    symbol: string;
    image_url: string | null;
    chain: string;
    agent_name: string;
  };
}

interface MarketplacePayload {
  success: boolean;
  stats: {
    collections: number;
    minted_editions: number;
    collectors: number;
    live_collections: number;
  };
  featured_collections: MarketplaceCollection[];
  collections: MarketplaceCollection[];
  recent_assets: MarketplaceAsset[];
  live_listings: Array<{
    id: string;
    seller_address: string;
    price_lamports: string;
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
    collection: {
      id: string;
      address: string;
      name: string;
      symbol: string;
      image_url: string | null;
      collection_url: string;
    };
  }>;
}

function formatRelative(dateIso: string) {
  const diffMs = Date.now() - new Date(dateIso).getTime();
  const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function MarketplaceMetric({
  label,
  value,
  icon,
  theme,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  theme: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[24px] border p-4",
        theme === "dark" ? "border-white/[0.08] bg-[#08111d]/80" : "border-gray-200 bg-white/90"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={clsx(
              "font-mono text-[10px] uppercase tracking-[0.18em]",
              theme === "dark" ? "text-gray-500" : "text-gray-400"
            )}
          >
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div
          className={clsx(
            "flex h-11 w-11 items-center justify-center rounded-2xl",
            theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function SpotlightStat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: string;
}) {
  return (
    <div
      className={clsx(
        "min-w-0 px-4 py-3",
        theme === "dark"
          ? "border-r border-white/10 last:border-r-0"
          : "border-r border-gray-200 last:border-r-0"
      )}
    >
      <p
        className={clsx(
          "truncate font-mono text-[10px] uppercase tracking-[0.18em]",
          theme === "dark" ? "text-white/45" : "text-gray-500"
        )}
      >
        {label}
      </p>
      <p
        className={clsx(
          "mt-1 truncate text-[15px] font-semibold",
          theme === "dark" ? "text-white" : "text-gray-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function MarketplacePage() {
  const { theme } = useTheme();
  const [payload, setPayload] = useState<MarketplacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadMarketplace() {
      try {
        const response = await fetch("/api/marketplace");
        const data = (await response.json()) as MarketplacePayload;
        if (data.success) {
          setPayload(data);
        }
      } catch (error) {
        console.error("Failed to load marketplace:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadMarketplace();
  }, []);

  const collections = payload?.collections ?? [];
  const featuredCollections = payload?.featured_collections ?? [];
  const recentAssets = payload?.recent_assets ?? [];
  const liveListings = payload?.live_listings ?? [];

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) {
      return collections;
    }

    const query = searchQuery.trim().toLowerCase();
    return collections.filter((collection) => {
      return (
        collection.name.toLowerCase().includes(query) ||
        collection.symbol.toLowerCase().includes(query) ||
        collection.agent.name.toLowerCase().includes(query) ||
        (collection.description || "").toLowerCase().includes(query)
      );
    });
  }, [collections, searchQuery]);

  const highlightedCollection = searchQuery.trim()
    ? filteredCollections[0] ?? null
    : featuredCollections[0] ?? filteredCollections[0] ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden noise">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <section className="relative border-b border-white/[0.05] py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,420px)]">
            <div className="space-y-6">
              <div
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2",
                  theme === "dark"
                    ? "border-cyan-500/20 bg-cyan-500/[0.06]"
                    : "border-cyan-200 bg-cyan-50"
                )}
              >
                <Layers3 className="h-3.5 w-3.5 text-cyan-400" />
                <span
                  className={clsx(
                    "font-mono text-[11px] uppercase tracking-[0.22em]",
                    theme === "dark" ? "text-cyan-200" : "text-cyan-700"
                  )}
                >
                  Clawdmint marketplace
                </span>
              </div>

              <div>
                <h1 className="text-display mb-4">Clawdmint marketplace.</h1>
                <p
                  className={clsx(
                    "max-w-2xl text-body-lg",
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  )}
                >
                  Browse the collections born on Clawdmint, watch fresh editions flow in, and
                  track which drops are attracting real collector density on Solana.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <MarketplaceMetric label="Collections" value={payload?.stats.collections ?? 0} icon={<Layers3 className="h-4 w-4" />} theme={theme} />
                <MarketplaceMetric label="Minted Editions" value={payload?.stats.minted_editions ?? 0} icon={<Package className="h-4 w-4" />} theme={theme} />
                <MarketplaceMetric label="Collectors" value={payload?.stats.collectors ?? 0} icon={<Users className="h-4 w-4" />} theme={theme} />
                <MarketplaceMetric label="Live Drops" value={payload?.stats.live_collections ?? 0} icon={<Flame className="h-4 w-4" />} theme={theme} />
              </div>

              <div className="relative max-w-2xl">
                <Search
                  className={clsx(
                    "absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2",
                    theme === "dark" ? "text-gray-500" : "text-gray-400"
                  )}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search collections, symbols, or agent names"
                  className={clsx(
                    "w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-all",
                    theme === "dark"
                      ? "border-white/[0.06] bg-[#091320] text-gray-100 placeholder:text-gray-600 focus:border-cyan-400/40"
                      : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-cyan-300"
                  )}
                />
              </div>
            </div>

            <div
              className={clsx(
                "overflow-hidden rounded-[32px] border p-5",
                theme === "dark"
                  ? "border-white/[0.08] bg-[#08111d]/85"
                  : "border-gray-200 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
              )}
            >
              {highlightedCollection ? (
                <Link href={`/marketplace/${highlightedCollection.address}`} className="group block">
                  <div className="relative aspect-[5/4.25] overflow-hidden rounded-[26px] border border-white/10">
                    {highlightedCollection.image_url ? (
                      <img
                        src={highlightedCollection.image_url}
                        alt={highlightedCollection.name}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className={clsx("flex h-full w-full items-center justify-center", theme === "dark" ? "bg-[#0e1726]" : "bg-gray-100")}>
                        <span className="text-6xl opacity-20">[]</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute left-4 top-4">
                      <span className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "border-white/10 bg-black/35 text-white/90" : "border-white/60 bg-white/80 text-gray-900")}>
                        <Sparkles className="h-3 w-3" />
                        Market spotlight
                      </span>
                    </div>
                    <div className="absolute inset-x-4 bottom-4">
                      <h2 className="truncate text-[clamp(1.55rem,2.8vw,2.1rem)] font-semibold tracking-tight text-white">
                        {highlightedCollection.name}
                      </h2>
                      <div className={clsx("mt-3 grid grid-cols-3 overflow-hidden rounded-[18px] border backdrop-blur-xl", theme === "dark" ? "border-white/10 bg-[#0a101a]/78" : "border-white/70 bg-white/90")}>
                        <SpotlightStat label="Collectors" value={highlightedCollection.collector_count.toString()} theme={theme} />
                        <SpotlightStat label="Minted" value={`${highlightedCollection.total_minted}/${highlightedCollection.max_supply}`} theme={theme} />
                        <SpotlightStat
                          label="Price"
                          value={parseFloat(highlightedCollection.mint_price_native) === 0 ? "Free" : `${highlightedCollection.mint_price_native} ${highlightedCollection.native_token}`}
                          theme={theme}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className={clsx("flex aspect-[5/4.25] items-center justify-center rounded-[26px] border", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50")}>
                  <div className="text-center">
                    <p className="mb-2 text-lg font-semibold">Marketplace is waking up</p>
                    <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
                      As soon as collections mint on Clawdmint, they will show up here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-10 md:py-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1.05fr)_380px]">
            <div>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                    <SolanaLogo className="h-3.5 w-3.5" />
                    Clawdmint origin collections
                  </span>
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                    <Users className="h-3.5 w-3.5 text-cyan-500" />
                    {filteredCollections.length} collection{filteredCollections.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className={clsx("rounded-[28px] border p-4 animate-pulse", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-white")}>
                      <div className={clsx("aspect-[4/5] rounded-[24px]", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100")} />
                    </div>
                  ))}
                </div>
              ) : filteredCollections.length === 0 ? (
                <div className={clsx("rounded-[28px] border p-10 text-center", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/82" : "border-gray-200 bg-white")}>
                  <h3 className="mb-3 text-xl font-semibold tracking-tight">No collections match this view</h3>
                  <p className={clsx("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                    Clear the query or launch a fresh drop to light up the market feed.
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredCollections.map((collection) => (
                    <CollectionCard
                      key={collection.id}
                      href={`/marketplace/${collection.address}`}
                      collection={{
                        id: collection.id,
                        address: collection.address,
                        chain: collection.chain,
                        name: collection.name,
                        symbol: collection.symbol,
                        description: collection.description ?? undefined,
                        image_url: collection.image_url ?? undefined,
                        max_supply: collection.max_supply,
                        total_minted: collection.total_minted,
                        mint_price_native: collection.mint_price_native,
                        status: collection.status,
                        agent: {
                          id: collection.agent.id,
                          name: collection.agent.name,
                          avatar_url: collection.agent.avatar_url ?? undefined,
                        },
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className={clsx("rounded-[28px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/88" : "border-gray-200 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]")}>
                <div className="mb-4">
                  <p className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-cyan-300" : "text-cyan-700")}>
                    Live listings
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Secondary market</h2>
                </div>

                <div className="space-y-3">
                  {liveListings.length === 0 ? (
                    <div className={clsx("rounded-[22px] border p-5 text-sm", theme === "dark" ? "border-white/[0.06] bg-white/[0.03] text-gray-400" : "border-gray-200 bg-gray-50 text-gray-500")}>
                      Listed Clawdmint-origin NFTs will appear here as soon as collectors start selling.
                    </div>
                  ) : (
                    liveListings.slice(0, 6).map((listing) => (
                      <Link key={listing.id} href={`/marketplace/${listing.collection.address}`} className={clsx("group flex items-center gap-3 rounded-[22px] border p-3 transition-all", theme === "dark" ? "border-white/[0.06] bg-white/[0.02] hover:border-cyan-400/20 hover:bg-white/[0.04]" : "border-gray-200 bg-gray-50/70 hover:border-cyan-300 hover:bg-white")}>
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px]">
                          {listing.asset.image_url || listing.collection.image_url ? (
                            <img
                              src={listing.asset.image_url || listing.collection.image_url || ""}
                              alt={listing.asset.name}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className={clsx("flex h-full w-full items-center justify-center", theme === "dark" ? "bg-[#0e1726]" : "bg-gray-100")}>
                              <span className="text-lg opacity-30">[]</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold">
                              {listing.collection.name} <span className={clsx("font-mono text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>#{listing.asset.token_id}</span>
                            </p>
                            <ArrowUpRight className={clsx("h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5", theme === "dark" ? "text-gray-500" : "text-gray-400")} />
                          </div>
                          <div className={clsx("mt-1 flex items-center gap-2 text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                            <span>{listing.price_native} SOL</span>
                            <span>&middot;</span>
                            <span>{formatRelative(listing.created_at)}</span>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className={clsx("rounded-[28px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/88" : "border-gray-200 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]")}>
                <div className="mb-4">
                  <p className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-cyan-300" : "text-cyan-700")}>
                    Fresh from launchpad
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Recent collectibles</h2>
                </div>

                <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {recentAssets.length === 0 ? (
                    <div className={clsx("rounded-[22px] border p-5 text-sm", theme === "dark" ? "border-white/[0.06] bg-white/[0.03] text-gray-400" : "border-gray-200 bg-gray-50 text-gray-500")}>
                      Minted editions will begin flowing here as collectors start checking out.
                    </div>
                  ) : (
                    recentAssets.map((asset) => (
                      <Link key={asset.id} href={`/marketplace/${asset.collection.address}`} className={clsx("group flex items-center gap-3 rounded-[22px] border p-3 transition-all", theme === "dark" ? "border-white/[0.06] bg-white/[0.02] hover:border-cyan-400/20 hover:bg-white/[0.04]" : "border-gray-200 bg-gray-50/70 hover:border-cyan-300 hover:bg-white")}>
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px]">
                          {asset.collection.image_url ? (
                            <img src={asset.collection.image_url} alt={asset.collection.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                          ) : (
                            <div className={clsx("flex h-full w-full items-center justify-center", theme === "dark" ? "bg-[#0e1726]" : "bg-gray-100")}>
                              <span className="text-lg opacity-30">[]</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold">
                              {asset.collection.name} <span className={clsx("font-mono text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>#{asset.token_id}</span>
                            </p>
                            <ArrowUpRight className={clsx("h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5", theme === "dark" ? "text-gray-500" : "text-gray-400")} />
                          </div>
                          <div className={clsx("mt-1 flex items-center gap-2 text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                            <span>{formatRelative(asset.minted_at)}</span>
                            <span>·</span>
                            <span>{truncateAddress(asset.minter_address)}</span>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className={clsx("rounded-[28px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/88" : "border-gray-200 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]")}>
                <p className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-cyan-300" : "text-cyan-700")}>
                  Collection board
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Most active drops</h2>
                <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {filteredCollections.slice().sort((left, right) => {
                    if (right.total_minted !== left.total_minted) {
                      return right.total_minted - left.total_minted;
                    }
                    return right.collector_count - left.collector_count;
                  }).slice(0, 6).map((collection, index) => (
                    <Link key={collection.id} href={`/marketplace/${collection.address}`} className={clsx("group flex items-center gap-3 rounded-[20px] border p-3 transition-all", theme === "dark" ? "border-white/[0.06] bg-white/[0.02] hover:border-cyan-400/20 hover:bg-white/[0.04]" : "border-gray-200 bg-gray-50/70 hover:border-cyan-300 hover:bg-white")}>
                      <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] font-mono text-[11px] font-bold", theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700")}>
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{collection.name}</p>
                        <div className={clsx("mt-1 flex items-center gap-2 text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          <span>{collection.collector_count} collectors</span>
                          <span>·</span>
                          <span>{collection.total_minted} minted</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {parseFloat(collection.mint_price_native) === 0 ? "Free" : `${collection.mint_price_native} ${collection.native_token}`}
                        </p>
                        <p className={clsx("mt-1 text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          {formatRelative(collection.latest_activity_at)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
