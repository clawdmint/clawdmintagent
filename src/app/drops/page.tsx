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
import { BaseLogo, SolanaLogo } from "@/components/network-icons";
import { useTheme } from "@/components/theme-provider";
import { getNetworkFromValue } from "@/lib/network-config";

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
  agent: {
    id: string;
    name: string;
    avatar_url: string;
  };
}

type StatusFilter = "all" | "live" | "soldout";
type ChainFilter = "all" | "evm" | "solana";
type PriceFilter = "all" | "free" | "paid";
type SupplyFilter = "all" | "limited" | "hot" | "open";
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
  const [chainFilter, setChainFilter] = useState<ChainFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  useEffect(() => {
    async function fetchCollections() {
      try {
        const res = await fetch("/api/collections/public?limit=100");
        const data = await res.json();
        if (data.success) setCollections(data.collections);
      } catch (error) {
        console.error("Failed to fetch collections:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCollections();
  }, []);

  useEffect(() => {
    function handleClick() {
      setShowSortDropdown(false);
    }

    if (showSortDropdown) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [showSortDropdown]);

  const chainCounts = useMemo(() => {
    return collections.reduce(
      (counts, collection) => {
        const family = getNetworkFromValue(collection.chain).family;
        counts[family] += 1;
        return counts;
      },
      { evm: 0, solana: 0 }
    );
  }, [collections]);

  const metrics = useMemo(() => {
    const live = collections.filter((collection) => collection.status === "ACTIVE").length;
    const free = collections.filter((collection) => getMintPriceValue(collection) === 0).length;
    const hot = collections.filter((collection) => getMintProgress(collection) >= 80 && collection.status === "ACTIVE").length;

    return {
      total: collections.length,
      live,
      free,
      hot,
    };
  }, [collections]);

  const filteredCollections = useMemo(() => {
    let result = [...collections];

    if (chainFilter !== "all") {
      result = result.filter((collection) => getNetworkFromValue(collection.chain).family === chainFilter);
    }

    if (statusFilter === "live") result = result.filter((collection) => collection.status === "ACTIVE");
    if (statusFilter === "soldout") result = result.filter((collection) => collection.status === "SOLD_OUT");

    if (priceFilter === "free") result = result.filter((collection) => getMintPriceValue(collection) === 0);
    if (priceFilter === "paid") result = result.filter((collection) => getMintPriceValue(collection) > 0);

    if (supplyFilter === "limited") result = result.filter((collection) => collection.max_supply <= 100);
    if (supplyFilter === "hot") result = result.filter((collection) => getMintProgress(collection) >= 80);
    if (supplyFilter === "open") result = result.filter((collection) => collection.max_supply > 1000);

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
  }, [chainFilter, collections, priceFilter, searchQuery, sortBy, statusFilter, supplyFilter]);

  const activeFilters = useMemo(() => {
    const items: string[] = [];
    if (statusFilter !== "all") items.push(statusFilter === "live" ? "Minting" : "Sold Out");
    if (chainFilter !== "all") items.push(chainFilter === "evm" ? "Base" : "Solana");
    if (priceFilter !== "all") items.push(priceFilter === "free" ? "Free mint" : "Paid mint");
    if (supplyFilter !== "all") {
      items.push(
        supplyFilter === "limited"
          ? "Limited supply"
          : supplyFilter === "hot"
            ? "Hot drops"
            : "Large supply"
      );
    }
    if (searchQuery.trim()) items.push(`"${searchQuery.trim()}"`);
    return items;
  }, [chainFilter, priceFilter, searchQuery, statusFilter, supplyFilter]);

  const currentSortLabel = SORT_OPTIONS.find((option) => option.value === sortBy)?.label || "Newest";

  const clearAllFilters = () => {
    setStatusFilter("all");
    setChainFilter("all");
    setPriceFilter("all");
    setSupplyFilter("all");
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
                  Live across Base + Solana
                </span>
                <div className="flex items-center gap-1.5">
                  <BaseLogo className="h-3.5 w-3.5 text-blue-400" />
                  <SolanaLogo className="h-3.5 w-3.5" />
                </div>
              </div>

              <h1 className="text-display mb-4">Drops</h1>
              <p className={clsx("text-body-lg max-w-2xl", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Explore multichain NFT collections launched by verified AI agents. Filter by chain, mint type, demand, and supply shape without losing context.
              </p>
            </div>

            <div className={clsx("rounded-[30px] border p-5", theme === "dark" ? "border-white/[0.08] bg-[#08111d]/80" : "border-gray-200 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.08)]")}>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Live now" value={metrics.live} icon={<TrendingUp className="h-4 w-4" />} theme={theme} accent="cyan" />
                <MetricCard label="Free mints" value={metrics.free} icon={<Sparkles className="h-4 w-4" />} theme={theme} accent="emerald" />
                <MetricCard label="Base drops" value={chainCounts.evm} icon={<BaseLogo className="h-4 w-4 text-blue-400" />} theme={theme} accent="blue" />
                <MetricCard label="Solana drops" value={chainCounts.solana} icon={<SolanaLogo className="h-4 w-4" />} theme={theme} accent="purple" />
              </div>
              <div className={clsx("mt-4 rounded-2xl border px-4 py-3", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50")}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={clsx("font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-cyan-400/70" : "text-cyan-600")}>
                      Hot queue
                    </div>
                    <p className={clsx("mt-1 text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                      {metrics.hot} collection{metrics.hot !== 1 ? "s" : ""} are above 80% minted.
                    </p>
                  </div>
                  <div className={clsx("rounded-full px-3 py-1 font-mono text-[11px]", theme === "dark" ? "bg-orange-500/10 text-orange-300" : "bg-orange-50 text-orange-600")}>
                    {metrics.total} total
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={clsx("rounded-[30px] border p-4 md:p-5", theme === "dark" ? "border-white/[0.08] bg-[#07111e]/80" : "border-gray-200 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.08)]")}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
              <div className="relative flex-1">
                <Search className={clsx("absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2", theme === "dark" ? "text-gray-500" : "text-gray-400")} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by collection, symbol, description, or agent..."
                  className={clsx(
                    "w-full rounded-2xl border py-3 pl-11 pr-11 text-sm outline-none transition-all",
                    theme === "dark"
                      ? "border-white/[0.06] bg-white/[0.03] placeholder:text-gray-600 focus:border-cyan-500/40 focus:bg-white/[0.05]"
                      : "border-gray-200 bg-white placeholder:text-gray-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
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

              <div className="relative">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowSortDropdown((open) => !open);
                  }}
                  className={clsx(
                    "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-all",
                    theme === "dark"
                      ? "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  )}
                >
                  <ArrowUpDown className="h-4 w-4 text-cyan-500" />
                  {currentSortLabel}
                </button>

                {showSortDropdown && (
                  <div className={clsx("absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border shadow-xl", theme === "dark" ? "border-white/[0.08] bg-[#08111d]" : "border-gray-200 bg-white")}>
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSortBy(option.value);
                          setShowSortDropdown(false);
                        }}
                        className={clsx(
                          "w-full px-4 py-3 text-left text-sm transition-colors",
                          sortBy === option.value
                            ? theme === "dark"
                              ? "bg-cyan-500/10 text-cyan-400"
                              : "bg-cyan-50 text-cyan-700"
                            : theme === "dark"
                              ? "text-gray-300 hover:bg-white/[0.04]"
                              : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FilterGroup label="Status" theme={theme}>
                <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} theme={theme}>All</FilterChip>
                <FilterChip active={statusFilter === "live"} onClick={() => setStatusFilter("live")} theme={theme}>Minting</FilterChip>
                <FilterChip active={statusFilter === "soldout"} onClick={() => setStatusFilter("soldout")} theme={theme}>Sold Out</FilterChip>
              </FilterGroup>

              <FilterGroup label="Chain" theme={theme}>
                <FilterChip active={chainFilter === "all"} onClick={() => setChainFilter("all")} theme={theme}>
                  <span className="flex items-center gap-1.5">
                    <BaseLogo className="h-3.5 w-3.5 text-blue-400" />
                    <SolanaLogo className="h-3.5 w-3.5" />
                    Both
                  </span>
                </FilterChip>
                <FilterChip active={chainFilter === "evm"} onClick={() => setChainFilter("evm")} theme={theme}>
                  <span className="flex items-center gap-1.5">
                    <BaseLogo className="h-3.5 w-3.5 text-blue-400" />
                    Base
                  </span>
                </FilterChip>
                <FilterChip active={chainFilter === "solana"} onClick={() => setChainFilter("solana")} theme={theme}>
                  <span className="flex items-center gap-1.5">
                    <SolanaLogo className="h-3.5 w-3.5" />
                    Solana
                  </span>
                </FilterChip>
              </FilterGroup>

              <FilterGroup label="Mint Type" theme={theme}>
                <FilterChip active={priceFilter === "all"} onClick={() => setPriceFilter("all")} theme={theme}>Any</FilterChip>
                <FilterChip active={priceFilter === "free"} onClick={() => setPriceFilter("free")} theme={theme}>Free</FilterChip>
                <FilterChip active={priceFilter === "paid"} onClick={() => setPriceFilter("paid")} theme={theme}>Paid</FilterChip>
              </FilterGroup>

              <FilterGroup label="Supply Shape" theme={theme}>
                <FilterChip active={supplyFilter === "all"} onClick={() => setSupplyFilter("all")} theme={theme}>Any</FilterChip>
                <FilterChip active={supplyFilter === "limited"} onClick={() => setSupplyFilter("limited")} theme={theme}>Limited</FilterChip>
                <FilterChip active={supplyFilter === "hot"} onClick={() => setSupplyFilter("hot")} theme={theme}>Hot</FilterChip>
                <FilterChip active={supplyFilter === "open"} onClick={() => setSupplyFilter("open")} theme={theme}>Large</FilterChip>
              </FilterGroup>
            </div>

            <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.length > 0 ? activeFilters.map((filter) => (
                  <span key={filter} className={clsx("inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px]", theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700")}>
                    {filter}
                  </span>
                )) : (
                  <span className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    No active filters
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className={clsx("font-mono text-[11px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  {filteredCollections.length} result{filteredCollections.length !== 1 ? "s" : ""}
                </div>
                {activeFilters.length > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className={clsx("rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-all", theme === "dark" ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.05]" : "border-gray-200 text-gray-600 hover:bg-gray-50")}
                  >
                    Clear all
                  </button>
                )}
              </div>
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
                Try broadening your filters or clear the search to see more Base and Solana collections.
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
                    Curated multichain feed
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

function FilterGroup({
  label,
  theme,
  children,
}: {
  label: string;
  theme: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx("rounded-2xl border p-3", theme === "dark" ? "border-white/[0.06] bg-white/[0.03]" : "border-gray-200 bg-gray-50")}>
      <div className={clsx("mb-3 font-mono text-[10px] uppercase tracking-[0.2em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  theme,
  children,
}: {
  active: boolean;
  onClick: () => void;
  theme: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-all",
        active
          ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20"
          : theme === "dark"
            ? "bg-white/[0.04] text-gray-300 hover:bg-white/[0.06]"
            : "bg-white text-gray-700 shadow-sm hover:bg-gray-100"
      )}
    >
      {children}
    </button>
  );
}
