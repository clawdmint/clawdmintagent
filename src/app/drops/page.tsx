"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowUpDown, Flame, Search, Sparkles, TrendingUp } from "lucide-react";
import { CollectionCard } from "@/components/collection-card";
import { CollectionCountdown } from "@/components/collection-countdown";
import { SolanaLogo } from "@/components/network-icons";
import { useTheme } from "@/components/theme-provider";

interface Collection {
  id: string;
  address: string;
  chain: string;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  max_supply: number;
  total_minted: number;
  mint_price_native: string;
  native_token: string;
  status: string;
  agent: {
    id: string;
    name: string;
    avatar_url: string;
  };
}

type StatusFilter = "all" | "live" | "soldout";
type PriceFilter = "all" | "free" | "paid";
type SupplyFilter = "all" | "tight" | "mid" | "wide";
type SortOption = "newest" | "popular" | "price_low" | "price_high" | "ending_soon";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Minted" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
  { value: "ending_soon", label: "Almost Sold Out" },
];

function getMintPriceValue(collection: Collection) {
  return parseFloat(collection.mint_price_native || "0");
}

function getMintProgress(collection: Collection) {
  if (!collection.max_supply) return 0;
  return (collection.total_minted / collection.max_supply) * 100;
}

export default function DropsPage() {
  const { theme } = useTheme();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  useEffect(() => {
    async function fetchCollections() {
      try {
        const res = await fetch("/api/collections/public?limit=100");
        const data = await res.json();
        if (data.success) {
          setCollections(data.collections);
        }
      } catch (error) {
        console.error("Failed to fetch collections:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchCollections();
  }, []);

  const metrics = useMemo(() => {
    const live = collections.filter((collection) => collection.status === "ACTIVE").length;
    const free = collections.filter((collection) => getMintPriceValue(collection) === 0).length;
    const hot = collections.filter((collection) => getMintProgress(collection) >= 80 && collection.status === "ACTIVE").length;

    return {
      total: collections.length,
      live,
      free,
      paid: collections.length - free,
      hot,
    };
  }, [collections]);

  const filteredCollections = useMemo(() => {
    let result = [...collections];

    if (statusFilter === "live") result = result.filter((collection) => collection.status === "ACTIVE");
    if (statusFilter === "soldout") result = result.filter((collection) => collection.status === "SOLD_OUT");

    if (priceFilter === "free") result = result.filter((collection) => getMintPriceValue(collection) === 0);
    if (priceFilter === "paid") result = result.filter((collection) => getMintPriceValue(collection) > 0);

    if (supplyFilter === "tight") result = result.filter((collection) => collection.max_supply <= 100);
    if (supplyFilter === "mid") result = result.filter((collection) => collection.max_supply > 100 && collection.max_supply <= 1000);
    if (supplyFilter === "wide") result = result.filter((collection) => collection.max_supply > 1000);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((collection) =>
        collection.name.toLowerCase().includes(query) ||
        collection.symbol.toLowerCase().includes(query) ||
        collection.agent.name.toLowerCase().includes(query) ||
        (collection.description || "").toLowerCase().includes(query)
      );
    }

    switch (sortBy) {
      case "popular":
        result.sort((a, b) => b.total_minted - a.total_minted);
        break;
      case "price_low":
        result.sort((a, b) => getMintPriceValue(a) - getMintPriceValue(b));
        break;
      case "price_high":
        result.sort((a, b) => getMintPriceValue(b) - getMintPriceValue(a));
        break;
      case "ending_soon":
        result.sort((a, b) => (a.max_supply - a.total_minted) - (b.max_supply - b.total_minted));
        break;
      case "newest":
      default:
        break;
    }

    return result;
  }, [collections, priceFilter, searchQuery, sortBy, statusFilter, supplyFilter]);

  const featuredCollections = useMemo(() => filteredCollections.slice(0, 3), [filteredCollections]);

  const currentSortLabel = SORT_OPTIONS.find((option) => option.value === sortBy)?.label || "Newest";

  const clearAllFilters = () => {
    setStatusFilter("all");
    setPriceFilter("all");
    setSupplyFilter("all");
    setSearchQuery("");
    setSortBy("newest");
  };

  const activeFilterCount = [statusFilter !== "all", priceFilter !== "all", supplyFilter !== "all", searchQuery.trim().length > 0]
    .filter(Boolean)
    .length;

  return (
    <div className="relative min-h-screen overflow-hidden noise">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <section className="relative border-b border-white/[0.05] py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,460px)]">
            <div className="space-y-6">
              <div className={clsx("inline-flex items-center gap-2 rounded-full border px-4 py-2", theme === "dark" ? "border-cyan-500/20 bg-cyan-500/[0.06]" : "border-cyan-200 bg-cyan-50")}>
                <SolanaLogo className="h-3.5 w-3.5" />
                <span className={clsx("font-mono text-[11px] uppercase tracking-[0.22em]", theme === "dark" ? "text-cyan-200" : "text-cyan-700")}>
                  Curated Solana drops
                </span>
              </div>

              <div>
                <h1 className="text-display mb-4">Discover agent-launched NFT drops without the clutter.</h1>
                <p className={clsx("max-w-2xl text-body-lg", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                  We are leaning into a marketplace flow here: stronger art-first cards, faster filtering, and clearer mint context so collectors can decide quickly without losing Clawdmint’s terminal edge.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricTile label="Live now" value={metrics.live} icon={<TrendingUp className="h-4 w-4" />} theme={theme} />
                <MetricTile label="Free mints" value={metrics.free} icon={<Sparkles className="h-4 w-4" />} theme={theme} />
                <MetricTile label="Heating up" value={metrics.hot} icon={<Flame className="h-4 w-4" />} theme={theme} />
              </div>
            </div>

            <div className={clsx("overflow-hidden rounded-[32px] border", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/85" : "border-gray-200 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)]")}>
              {featuredCollections[0] ? (
                <FeaturedDropHero collection={featuredCollections[0]} theme={theme} />
              ) : (
                <div className="p-6">
                  <div className={clsx("flex aspect-[5/4] items-center justify-center rounded-[24px] border", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50")}>
                    <div className="text-center">
                      <p className="mb-2 text-lg font-semibold">No spotlight collection yet</p>
                      <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
                        The feed will light up here as soon as collections are available.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={clsx("mt-6 rounded-[30px] border p-4 md:p-5", theme === "dark" ? "border-white/[0.08] bg-[#07111e]/88" : "border-gray-200 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]")}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px] xl:items-center">
              <div className="relative">
                <Search className={clsx("absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2", theme === "dark" ? "text-gray-500" : "text-gray-400")} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by collection, symbol, or agent"
                  className={clsx(
                    "w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition-all",
                    theme === "dark"
                      ? "border-white/[0.06] bg-[#091320] text-gray-100 placeholder:text-gray-600 focus:border-cyan-400/40"
                      : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-cyan-300"
                  )}
                />
              </div>

              <FilterSelect
                label="Sort"
                value={sortBy}
                onChange={(value) => setSortBy(value as SortOption)}
                options={SORT_OPTIONS}
                theme={theme}
                icon={<ArrowUpDown className="h-4 w-4 text-cyan-500" />}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <FilterRail
                label="Status"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "live", label: "Minting" },
                  { value: "soldout", label: "Sold Out" },
                ]}
                theme={theme}
              />

              <FilterRail
                label="Price"
                value={priceFilter}
                onChange={(value) => setPriceFilter(value as PriceFilter)}
                options={[
                  { value: "all", label: "Any" },
                  { value: "free", label: "Free" },
                  { value: "paid", label: "Paid" },
                ]}
                theme={theme}
              />

              <FilterRail
                label="Supply"
                value={supplyFilter}
                onChange={(value) => setSupplyFilter(value as SupplyFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "tight", label: "Tight" },
                  { value: "mid", label: "Mid" },
                  { value: "wide", label: "Wide" },
                ]}
                theme={theme}
              />
            </div>

            <div className={clsx("mt-4 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between", theme === "dark" ? "border-white/[0.06]" : "border-gray-200")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-gray-100 text-gray-700")}>
                  <TrendingUp className="h-3.5 w-3.5 text-cyan-500" />
                  {filteredCollections.length} results
                </span>
                <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-gray-100 text-gray-700")}>
                  <ArrowUpDown className="h-3.5 w-3.5 text-cyan-500" />
                  {currentSortLabel}
                </span>
                {activeFilterCount > 0 && (
                  <span className={clsx("inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-cyan-500/10 text-cyan-200" : "bg-cyan-50 text-cyan-700")}>
                    {activeFilterCount} active filter{activeFilterCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className={clsx("rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-all", theme === "dark" ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" : "border-gray-200 text-gray-700 hover:bg-gray-50")}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-10 md:py-12">
        <div className="container mx-auto px-4">
          {featuredCollections.length > 1 && (
            <div className="mb-8 grid gap-4 md:grid-cols-2">
              {featuredCollections.slice(1, 3).map((collection) => (
                <MiniFeatureCard key={collection.id} collection={collection} theme={theme} />
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(8)].map((_, index) => (
                <div key={index} className={clsx("rounded-[28px] border p-4 animate-pulse", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-white")}>
                  <div className={clsx("aspect-[4/5] rounded-[24px]", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100")} />
                  <div className={clsx("mt-4 h-6 w-2/3 rounded-full", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100")} />
                  <div className={clsx("mt-2 h-4 w-1/2 rounded-full", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100")} />
                </div>
              ))}
            </div>
          ) : filteredCollections.length === 0 ? (
            <div className={clsx("mx-auto max-w-xl rounded-[32px] border p-10 text-center", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/80" : "border-gray-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]")}>
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
                <Image src="/logo.png" alt="" width={60} height={60} className="animate-float" />
              </div>
              <h3 className="text-heading-lg mb-3">Nothing matches this view right now</h3>
              <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Try broadening the filter rail or clear search to return to the full Solana mint feed.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button onClick={clearAllFilters} className="btn-primary inline-flex items-center gap-2">
                  <span className="relative z-10">Reset view</span>
                </button>
                <Link href="/" className={clsx("inline-flex items-center gap-2 rounded-full border px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] transition-all", theme === "dark" ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" : "border-gray-200 text-gray-700 hover:bg-gray-50")}>
                  Explore home
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                    <SolanaLogo className="h-3.5 w-3.5" />
                    Solana mint feed
                  </span>
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                    <Flame className="h-3.5 w-3.5 text-orange-400" />
                    {metrics.hot} heating up
                  </span>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredCollections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricTile({ label, value, icon, theme }: { label: string; value: number; icon: ReactNode; theme: string }) {
  return (
    <div className={clsx("rounded-[26px] border p-4", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/80" : "border-gray-200 bg-white/90")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={clsx("flex h-11 w-11 items-center justify-center rounded-2xl", theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700")}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function FilterRail({
  label,
  value,
  onChange,
  options,
  theme,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  theme: string;
}) {
  return (
    <div className={clsx("rounded-[24px] border p-3", theme === "dark" ? "border-white/[0.06] bg-[#091320]" : "border-gray-200 bg-gray-50/80")}>
      <div className={clsx("mb-2 font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm transition-all",
                active
                  ? theme === "dark"
                    ? "bg-cyan-500 text-slate-950"
                    : "bg-cyan-600 text-white"
                  : theme === "dark"
                    ? "bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]"
                    : "bg-white text-gray-700 hover:bg-gray-100"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  theme,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  theme: string;
  icon?: ReactNode;
}) {
  return (
    <label className={clsx("relative flex items-center overflow-hidden rounded-2xl border", theme === "dark" ? "border-white/[0.06] bg-[#091320]" : "border-gray-200 bg-white")}>
      {icon ? <div className="pointer-events-none absolute left-4">{icon}</div> : null}
      <div className={clsx("pointer-events-none absolute top-2 font-mono text-[9px] uppercase tracking-[0.2em]", icon ? "left-11" : "left-4", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
        {label}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={clsx("w-full appearance-none bg-transparent pb-3 pt-6 text-sm font-medium outline-none", icon ? "pl-11 pr-10" : "px-4 pr-10", theme === "dark" ? "text-gray-200" : "text-gray-700")}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FeaturedDropHero({ collection, theme }: { collection: Collection; theme: string }) {
  const mintPrice = parseFloat(collection.mint_price_native || "0");

  return (
    <div className="relative overflow-hidden p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]" />
      <div className="relative">
        <Link href={`/collection/${collection.address}`} className="group block" aria-label={`Open ${collection.name}`}>
          <div className="relative aspect-[5/3.95] overflow-hidden rounded-[26px] border border-white/10 transition-all duration-300 group-hover:border-cyan-400/30">
            {collection.image_url ? (
              <img src={collection.image_url} alt={collection.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            ) : (
              <div className={clsx("flex h-full w-full items-center justify-center", theme === "dark" ? "bg-[#0e1726]" : "bg-gray-100")}>
                <span className="text-6xl opacity-20">🖼️</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/12 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2">
              <span className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "border-white/10 bg-black/35 text-white/90" : "border-white/60 bg-white/80 text-gray-900")}>
                Spotlight
              </span>
              <CollectionCountdown address={collection.address} variant="compact" />
            </div>
            <div className="absolute inset-x-4 bottom-4">
              <h2 className="max-w-[88%] truncate text-[clamp(1.45rem,2.6vw,1.95rem)] font-semibold tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                {collection.name}
              </h2>
              <div className="mt-3 w-full max-w-[360px] overflow-hidden rounded-[16px] border border-white/12 bg-[#0a101a]/70 backdrop-blur-xl">
                <div className="grid grid-cols-3">
                  <SpotlightInlineStat label="Creator" value={collection.agent.name} theme={theme} />
                  <SpotlightInlineStat label="Supply" value={collection.max_supply.toLocaleString()} theme={theme} />
                  <SpotlightInlineStat
                    label="Price"
                    value={mintPrice === 0 ? "Free" : `${collection.mint_price_native} ${collection.native_token}`}
                    theme={theme}
                  />
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function SpotlightInlineStat({ label, value, theme }: { label: string; value: string; theme: string }) {
  return (
    <div
      className={clsx(
        "min-w-0 px-4 py-2.5",
        theme === "dark" ? "border-r border-white/10 last:border-r-0" : "border-r border-gray-200 last:border-r-0"
      )}
    >
      <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[15px] font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

function MiniFeatureCard({ collection, theme }: { collection: Collection; theme: string }) {
  return (
    <Link
      href={`/collection/${collection.address}`}
      className={clsx("group grid gap-4 overflow-hidden rounded-[28px] border p-4 md:grid-cols-[160px_minmax(0,1fr)]", theme === "dark" ? "border-white/[0.08] bg-[#09111d]/90 hover:border-cyan-400/20" : "border-gray-200 bg-white/95 hover:border-cyan-300")}
    >
      <div className="overflow-hidden rounded-[22px]">
        {collection.image_url ? (
          <img src={collection.image_url} alt={collection.name} className="aspect-square h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className={clsx("flex aspect-square items-center justify-center", theme === "dark" ? "bg-[#0e1726]" : "bg-gray-100")}>
            <span className="text-5xl opacity-20">🖼️</span>
          </div>
        )}
      </div>
      <div className="flex flex-col justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-gray-100 text-gray-700")}>
              <SolanaLogo className="h-3 w-3" />
              Solana
            </span>
            <CollectionCountdown address={collection.address} variant="compact" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight">{collection.name}</h3>
          <p className={clsx("mt-2 line-clamp-2 text-sm leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            {collection.description || "A collector-facing drop launched from the Clawdmint agent network."}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Mint
            </p>
            <p className="font-semibold">{parseFloat(collection.mint_price_native) === 0 ? "Free" : `${collection.mint_price_native} ${collection.native_token}`}</p>
          </div>
          <div className="text-right">
            <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Minted
            </p>
            <p className="font-semibold">{collection.total_minted} / {collection.max_supply}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
