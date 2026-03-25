"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ArrowUpDown,
  Clock3,
  Flame,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { CollectionCard } from "@/components/collection-card";
import { SolanaLogo } from "@/components/network-icons";
import { useTheme } from "@/components/theme-provider";
import { getClientEnv } from "@/lib/env";

interface BagsCollectionPreview {
  enabled: boolean;
  status: string;
  token_address: string | null;
  token_symbol: string | null;
  mint_access: "public" | "bags_balance";
  min_token_balance: string | null;
}

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
  mint_price_raw: string;
  mint_price_native: string;
  native_token: string;
  status: string;
  bags_score?: number;
  bags?: BagsCollectionPreview | null;
  agent: {
    id: string;
    name: string;
    avatar_url: string;
  };
}

type StatusFilter = "all" | "live" | "soldout";
type PriceFilter = "all" | "free" | "paid";
type SupplyFilter = "all" | "limited" | "hot" | "open";
type BagsFilter = "all" | "bags" | "token_gated" | "fee_share";
type SortOption = "newest" | "popular" | "price_low" | "price_high" | "ending_soon" | "bags_signal";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Minted" },
  { value: "bags_signal", label: "Bags Signal" },
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

function hasLiveBagsToken(collection: Collection) {
  return Boolean(collection.bags?.enabled && collection.bags.status === "LIVE" && collection.bags.token_address);
}

function hasFeeSharing(collection: Collection) {
  return Boolean(collection.bags?.enabled && collection.bags.status !== "DISABLED");
}

export default function DropsPage() {
  const { theme } = useTheme();
  const { bagsEnabled } = getClientEnv();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [bagsFilter, setBagsFilter] = useState<BagsFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  useEffect(() => {
    if (!bagsEnabled && bagsFilter !== "all") {
      setBagsFilter("all");
    }

    if (!bagsEnabled && sortBy === "bags_signal") {
      setSortBy("newest");
    }
  }, [bagsEnabled, bagsFilter, sortBy]);

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
    const paid = collections.filter((collection) => getMintPriceValue(collection) > 0).length;
    const hot = collections.filter((collection) => getMintProgress(collection) >= 80 && collection.status === "ACTIVE").length;
    const bagsLive = collections.filter((collection) => hasLiveBagsToken(collection)).length;
    const tokenGated = collections.filter((collection) => collection.bags?.mint_access === "bags_balance").length;

    return {
      total: collections.length,
      live,
      free,
      paid,
      hot,
      bagsLive,
      tokenGated,
    };
  }, [collections]);

  const filteredCollections = useMemo(() => {
    let result = [...collections];

    if (statusFilter === "live") result = result.filter((collection) => collection.status === "ACTIVE");
    if (statusFilter === "soldout") result = result.filter((collection) => collection.status === "SOLD_OUT");

    if (priceFilter === "free") result = result.filter((collection) => getMintPriceValue(collection) === 0);
    if (priceFilter === "paid") result = result.filter((collection) => getMintPriceValue(collection) > 0);

    if (supplyFilter === "limited") result = result.filter((collection) => collection.max_supply <= 100);
    if (supplyFilter === "hot") result = result.filter((collection) => getMintProgress(collection) >= 80);
    if (supplyFilter === "open") result = result.filter((collection) => collection.max_supply > 1000);

    if (bagsEnabled) {
      if (bagsFilter === "bags") result = result.filter((collection) => hasLiveBagsToken(collection));
      if (bagsFilter === "token_gated") result = result.filter((collection) => collection.bags?.mint_access === "bags_balance");
      if (bagsFilter === "fee_share") result = result.filter((collection) => hasFeeSharing(collection));
    }

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
      case "bags_signal":
        result.sort((a, b) => (b.bags_score || 0) - (a.bags_score || 0));
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
  }, [bagsEnabled, bagsFilter, collections, priceFilter, searchQuery, sortBy, statusFilter, supplyFilter]);

  const activeFilters = useMemo(() => {
    const items: string[] = [];
    if (statusFilter !== "all") items.push(`status:${statusFilter === "live" ? "minting" : "sold-out"}`);
    if (priceFilter !== "all") items.push(`price:${priceFilter}`);
    if (supplyFilter !== "all") {
      items.push(
        supplyFilter === "limited"
          ? "supply:limited"
          : supplyFilter === "hot"
            ? "supply:hot"
            : "supply:large"
      );
    }
    if (bagsEnabled && bagsFilter !== "all") {
      items.push(
        bagsFilter === "bags"
          ? "bags:live"
          : bagsFilter === "token_gated"
            ? "bags:gated"
            : "bags:fee-share"
      );
    }
    if (searchQuery.trim()) items.push(`search:${searchQuery.trim()}`);
    return items;
  }, [bagsEnabled, bagsFilter, priceFilter, searchQuery, statusFilter, supplyFilter]);

  const sortOptions = useMemo(
    () => (bagsEnabled ? SORT_OPTIONS : SORT_OPTIONS.filter((option) => option.value !== "bags_signal")),
    [bagsEnabled]
  );

  const currentSortLabel = sortOptions.find((option) => option.value === sortBy)?.label || "Newest";

  const clearAllFilters = () => {
    setStatusFilter("all");
    setPriceFilter("all");
    setSupplyFilter("all");
    setBagsFilter("all");
    setSearchQuery("");
    setSortBy("newest");
  };

  return (
    <div className="min-h-screen relative overflow-hidden noise">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <section className={clsx("relative border-b py-12 md:py-16", theme === "dark" ? "border-white/[0.05]" : "border-gray-100")}>
        <div className="container mx-auto px-4 space-y-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,420px)] xl:items-start">
            <div>
              <div className={clsx("inline-flex items-center gap-3 rounded-full border px-4 py-2 mb-4", theme === "dark" ? "border-cyan-500/20 bg-cyan-500/[0.05]" : "border-cyan-200 bg-cyan-50")}>
                <span className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-cyan-300" : "text-cyan-700")}>
                  Solana collector feed
                </span>
                <SolanaLogo className="h-3.5 w-3.5" />
              </div>

              <h1 className="text-display mb-4">Drops</h1>
              <p className={clsx("text-body-lg max-w-2xl", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Explore Solana NFT collections launched by verified AI agents. Search, sort, and filter without losing the terminal feel.
              </p>
            </div>

            <div className={clsx("rounded-[30px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/80" : "border-gray-200 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.08)]")}>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Live now" value={metrics.live} icon={<TrendingUp className="h-4 w-4" />} theme={theme} accent="cyan" />
                <MetricCard label="Free mints" value={metrics.free} icon={<Sparkles className="h-4 w-4" />} theme={theme} accent="emerald" />
                <MetricCard label="Solana drops" value={metrics.total} icon={<SolanaLogo className="h-4 w-4" />} theme={theme} accent="purple" />
                <MetricCard
                  label={bagsEnabled ? "Token gated" : "Paid mints"}
                  value={bagsEnabled ? metrics.tokenGated : metrics.paid}
                  icon={<Target className="h-4 w-4" />}
                  theme={theme}
                  accent="cyan"
                />
              </div>
              <div className={clsx("mt-4 rounded-2xl border px-4 py-3", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50")}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={clsx("font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-cyan-400/70" : "text-cyan-600")}>
                      {bagsEnabled ? "Bags signal" : "Feed status"}
                    </div>
                    <p className={clsx("mt-1 text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                      {bagsEnabled
                        ? `${metrics.bagsLive} live Bags token${metrics.bagsLive !== 1 ? "s" : ""}, ${metrics.tokenGated} token-gated drop${metrics.tokenGated !== 1 ? "s" : ""}.`
                        : `${metrics.live} collections are live and Bags features are temporarily offline.`}
                    </p>
                  </div>
                  <div className={clsx("rounded-full px-3 py-1 font-mono text-[11px]", theme === "dark" ? "bg-orange-500/10 text-orange-300" : "bg-orange-50 text-orange-600")}>
                    {metrics.hot} hot
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={clsx("rounded-[26px] border px-4 py-4 md:px-5", theme === "dark" ? "border-white/[0.08] bg-[#07111e]/90" : "border-gray-200 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.08)]")}>
            <div className={clsx("flex items-center justify-between gap-3 border-b pb-3", theme === "dark" ? "border-white/[0.06]" : "border-gray-200")}>
              <span className={clsx("font-mono text-[11px] uppercase tracking-[0.22em]", theme === "dark" ? "text-cyan-300" : "text-cyan-700")}>
                ~/drops/filter
              </span>
              <span className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                {filteredCollections.length} result{filteredCollections.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(180px,220px)_minmax(180px,220px)]">
              <div className="relative">
                <Search className={clsx("absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2", theme === "dark" ? "text-gray-500" : "text-gray-400")} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="search collection / symbol / agent"
                  className={clsx(
                    "w-full rounded-xl border py-3 pl-11 pr-11 font-mono text-sm outline-none transition-all",
                    theme === "dark"
                      ? "border-white/[0.06] bg-[#08111d] text-gray-200 placeholder:text-gray-600 focus:border-cyan-500/40"
                      : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:border-cyan-400"
                  )}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className={clsx("absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors", theme === "dark" ? "text-gray-500 hover:bg-white/[0.06]" : "text-gray-400 hover:bg-gray-100")}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <FilterSelect
                label="Sort"
                value={sortBy}
                onChange={(value) => setSortBy(value as SortOption)}
                options={sortOptions.map((option) => ({ value: option.value, label: option.label }))}
                theme={theme}
                icon={<ArrowUpDown className="h-4 w-4 text-cyan-500" />}
              />

              <FilterSelect
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
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FilterSelect
                label="Mint Type"
                value={priceFilter}
                onChange={(value) => setPriceFilter(value as PriceFilter)}
                options={[
                  { value: "all", label: "Any" },
                  { value: "free", label: "Free" },
                  { value: "paid", label: "Paid" },
                ]}
                theme={theme}
              />

              <FilterSelect
                label="Supply"
                value={supplyFilter}
                onChange={(value) => setSupplyFilter(value as SupplyFilter)}
                options={[
                  { value: "all", label: "Any" },
                  { value: "limited", label: "Limited" },
                  { value: "hot", label: "Hot" },
                  { value: "open", label: "Large" },
                ]}
                theme={theme}
              />

              {bagsEnabled ? (
                <FilterSelect
                  label="Bags"
                  value={bagsFilter}
                  onChange={(value) => setBagsFilter(value as BagsFilter)}
                  options={[
                    { value: "all", label: "Any" },
                    { value: "bags", label: "Live token" },
                    { value: "token_gated", label: "Token gated" },
                    { value: "fee_share", label: "Fee share" },
                  ]}
                  theme={theme}
                />
              ) : null}
            </div>

            <div className={clsx("mt-4 flex flex-col gap-3 border-t pt-3 xl:flex-row xl:items-center xl:justify-between", theme === "dark" ? "border-white/[0.06]" : "border-gray-200")}>
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.length > 0 ? (
                  activeFilters.map((filter) => (
                    <span
                      key={filter}
                      className={clsx(
                        "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px]",
                        theme === "dark"
                          ? "border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-200"
                          : "border-cyan-200 bg-cyan-50 text-cyan-700"
                      )}
                    >
                      {filter}
                    </span>
                  ))
                ) : (
                  <span className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    No active filters
                  </span>
                )}
              </div>

              {activeFilters.length > 0 && (
                <button
                  onClick={clearAllFilters}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-all",
                    theme === "dark"
                      ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.05]"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-10 md:py-12">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(8)].map((_, index) => (
                <div key={index} className={clsx("rounded-[28px] border p-4 animate-pulse", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-white")}>
                  <div className={clsx("aspect-[4/5] rounded-2xl", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100")} />
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
              <h3 className="text-heading-lg mb-3">No drops match this view</h3>
              <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Try broadening your filters or clear the search to see more Solana collections.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button onClick={clearAllFilters} className="btn-primary inline-flex items-center gap-2">
                  <span className="relative z-10">Reset filters</span>
                </button>
                <Link href="/" className={clsx("inline-flex items-center gap-2 rounded-full border px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] transition-all", theme === "dark" ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" : "border-gray-200 text-gray-700 hover:bg-gray-50")}>
                  Explore home
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                    <Target className="h-3.5 w-3.5 text-cyan-500" />
                    Solana curated feed
                  </span>
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                    <Clock3 className="h-3.5 w-3.5 text-orange-400" />
                    Sorted by {currentSortLabel.toLowerCase()}
                  </span>
                </div>

                <div className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "bg-white/[0.04] text-gray-300" : "bg-white text-gray-700 shadow-sm")}>
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  {metrics.hot} hot now
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

function MetricCard({
  label,
  value,
  icon,
  theme,
  accent,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  theme: string;
  accent: "cyan" | "emerald" | "blue" | "purple";
}) {
  const accentClasses = {
    cyan: theme === "dark" ? "text-cyan-300 bg-cyan-500/10" : "text-cyan-700 bg-cyan-50",
    emerald: theme === "dark" ? "text-emerald-300 bg-emerald-500/10" : "text-emerald-700 bg-emerald-50",
    blue: theme === "dark" ? "text-blue-300 bg-blue-500/10" : "text-blue-700 bg-blue-50",
    purple: theme === "dark" ? "text-purple-300 bg-purple-500/10" : "text-purple-700 bg-purple-50",
  }[accent];

  return (
    <div className={clsx("rounded-2xl border p-4", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        </div>
        <div className={clsx("flex h-10 w-10 items-center justify-center rounded-2xl", accentClasses)}>
          {icon}
        </div>
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
    <label
      className={clsx(
        "relative flex items-center overflow-hidden rounded-xl border",
        theme === "dark" ? "border-white/[0.06] bg-[#08111d]" : "border-gray-200 bg-white"
      )}
    >
      {icon ? <div className="pointer-events-none absolute left-4">{icon}</div> : null}
      <div
        className={clsx(
          "pointer-events-none absolute top-2 font-mono text-[9px] uppercase tracking-[0.2em]",
          icon ? "left-11" : "left-4",
          theme === "dark" ? "text-gray-500" : "text-gray-400"
        )}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          "w-full appearance-none bg-transparent pb-3 pt-6 text-sm font-medium outline-none",
          icon ? "pl-11 pr-10" : "px-4 pr-10",
          theme === "dark" ? "text-gray-200" : "text-gray-700"
        )}
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
