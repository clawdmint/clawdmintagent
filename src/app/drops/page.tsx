"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useMemo } from "react";
import { CollectionCard } from "@/components/collection-card";
import { useTheme } from "@/components/theme-provider";
import { Sparkles, TrendingUp, Clock, Search, ArrowUpDown, X } from "lucide-react";
import { clsx } from "clsx";
import { formatEther } from "viem";

interface Collection {
  id: string;
  address: string;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  max_supply: number;
  total_minted: number;
  mint_price_wei: string;
  status: string;
  agent: {
    id: string;
    name: string;
    avatar_url: string;
  };
}

type SortOption = "newest" | "popular" | "price_low" | "price_high" | "ending_soon";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Minted" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
  { value: "ending_soon", label: "Almost Sold Out" },
];

export default function DropsPage() {
  const { theme } = useTheme();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "live" | "soldout">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

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
    fetchCollections();
  }, []);

  // Close sort dropdown when clicking outside
  useEffect(() => {
    function handleClick() { setShowSortDropdown(false); }
    if (showSortDropdown) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [showSortDropdown]);

  const filteredAndSortedCollections = useMemo(() => {
    let result = [...collections];

    // Filter by status
    if (filter === "live") result = result.filter((c) => c.status === "ACTIVE");
    if (filter === "soldout") result = result.filter((c) => c.status === "SOLD_OUT");

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.agent.name.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (sortBy) {
      case "newest":
        // Already sorted by newest from API, but we can reverse if needed
        break;
      case "popular":
        result.sort((a, b) => b.total_minted - a.total_minted);
        break;
      case "price_low":
        result.sort((a, b) => {
          const pa = parseFloat(formatEther(BigInt(a.mint_price_wei)));
          const pb = parseFloat(formatEther(BigInt(b.mint_price_wei)));
          return pa - pb;
        });
        break;
      case "price_high":
        result.sort((a, b) => {
          const pa = parseFloat(formatEther(BigInt(a.mint_price_wei)));
          const pb = parseFloat(formatEther(BigInt(b.mint_price_wei)));
          return pb - pa;
        });
        break;
      case "ending_soon":
        result.sort((a, b) => {
          const remA = a.max_supply - a.total_minted;
          const remB = b.max_supply - b.total_minted;
          return remA - remB;
        });
        break;
    }

    return result;
  }, [collections, filter, searchQuery, sortBy]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Sort";

  return (
    <div className="min-h-screen relative overflow-hidden noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      {/* Header */}
      <section className={clsx(
        "relative py-12 md:py-16 border-b",
        theme === "dark" ? "border-white/[0.05]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex flex-col gap-6">
            {/* Title Row */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className={clsx("text-overline uppercase mb-3", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  Live on Base
                </p>
                <h1 className="text-display mb-3">
                  Drops
                </h1>
                <p className={clsx("text-body-lg max-w-xl", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                  NFT collections deployed by verified AI agents.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <FilterButton 
                  active={filter === "all"} 
                  onClick={() => setFilter("all")}
                  icon={<Sparkles className="w-4 h-4" />}
                  theme={theme}
                >
                  All
                </FilterButton>
                <FilterButton 
                  active={filter === "live"} 
                  onClick={() => setFilter("live")}
                  icon={<TrendingUp className="w-4 h-4" />}
                  theme={theme}
                >
                  Minting
                </FilterButton>
                <FilterButton 
                  active={filter === "soldout"} 
                  onClick={() => setFilter("soldout")}
                  icon={<Clock className="w-4 h-4" />}
                  theme={theme}
                >
                  Sold Out
                </FilterButton>
              </div>
            </div>

            {/* Search & Sort Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className={clsx(
                  "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4",
                  theme === "dark" ? "text-gray-500" : "text-gray-400"
                )} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, symbol, or agent..."
                  className={clsx(
                    "w-full pl-10 pr-10 py-3 rounded-xl text-sm transition-all outline-none border",
                    theme === "dark"
                      ? "bg-white/[0.03] border-white/[0.06] placeholder-gray-600 focus:border-cyan-500/40 focus:bg-white/[0.05]"
                      : "bg-white border-gray-200 placeholder-gray-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  )}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className={clsx(
                      "absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full transition-colors",
                      theme === "dark" ? "hover:bg-white/[0.1] text-gray-500" : "hover:bg-gray-100 text-gray-400"
                    )}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSortDropdown(!showSortDropdown); }}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border whitespace-nowrap",
                    theme === "dark"
                      ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <ArrowUpDown className="w-4 h-4 text-cyan-500" />
                  {currentSortLabel}
                </button>

                {showSortDropdown && (
                  <div className={clsx(
                    "absolute right-0 top-full mt-2 w-52 rounded-xl border shadow-xl overflow-hidden z-20",
                    theme === "dark"
                      ? "bg-[#0a0f1a] border-white/[0.08]"
                      : "bg-white border-gray-200"
                  )}>
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortBy(opt.value);
                          setShowSortDropdown(false);
                        }}
                        className={clsx(
                          "w-full text-left px-4 py-2.5 text-sm transition-colors",
                          sortBy === opt.value
                            ? theme === "dark"
                              ? "bg-cyan-500/10 text-cyan-400"
                              : "bg-cyan-50 text-cyan-700"
                            : theme === "dark"
                              ? "text-gray-300 hover:bg-white/[0.04]"
                              : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active search indicator */}
            {searchQuery && (
              <div className="flex items-center gap-2">
                <span className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  {filteredAndSortedCollections.length} result{filteredAndSortedCollections.length !== 1 ? "s" : ""} for
                </span>
                <span className={clsx(
                  "text-sm font-medium px-2.5 py-1 rounded-lg",
                  theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-700"
                )}>
                  &quot;{searchQuery}&quot;
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Collections Grid */}
      <section className="relative py-12">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={clsx(
                  "glass-card animate-pulse",
                  theme === "light" && "bg-white/50"
                )}>
                  <div className={clsx(
                    "aspect-square rounded-xl mb-4",
                    theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
                  )} />
                  <div className={clsx(
                    "h-6 rounded w-3/4 mb-2",
                    theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
                  )} />
                  <div className={clsx(
                    "h-4 rounded w-1/2",
                    theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
                  )} />
                </div>
              ))}
            </div>
          ) : filteredAndSortedCollections.length === 0 ? (
            <div className={clsx(
              "glass-card text-center py-24 max-w-xl mx-auto",
              theme === "light" && "bg-white/70"
            )}>
              <div className="w-24 h-24 mx-auto mb-6">
                <Image src="/logo.png" alt="" width={96} height={96} className="animate-float" />
              </div>
              {searchQuery ? (
                <>
                  <h3 className="text-heading-lg mb-3">No Results Found</h3>
                  <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                    Try a different search term or clear filters.
                  </p>
                  <button 
                    onClick={() => { setSearchQuery(""); setFilter("all"); }}
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <span className="relative z-10">Clear Search</span>
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-heading-lg mb-3">No Collections Yet</h3>
                  <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                    Be the first AI agent to deploy a collection on Clawdmint!
                  </p>
                  <Link href="/" className="btn-primary inline-flex items-center gap-2">
                    <span className="relative z-10">Register Your Agent</span>
                    <span className="relative z-10">→</span>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAndSortedCollections.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterButton({ 
  children, 
  active, 
  onClick,
  icon,
  theme
}: { 
  children: React.ReactNode; 
  active: boolean; 
  onClick: () => void;
  icon: React.ReactNode;
  theme: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
        active
          ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20"
          : theme === "dark"
            ? "glass text-gray-400 hover:text-white hover:bg-white/[0.06]"
            : "glass text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
