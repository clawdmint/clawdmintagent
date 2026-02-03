"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { CollectionCard } from "@/components/collection-card";
import { useTheme } from "@/components/theme-provider";
import { Sparkles, TrendingUp, Clock, Bot, Diamond, Hexagon } from "lucide-react";
import { clsx } from "clsx";

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

export default function DropsPage() {
  const { theme } = useTheme();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "live" | "soldout">("all");

  useEffect(() => {
    async function fetchCollections() {
      try {
        const res = await fetch("/api/collections/public?limit=50");
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

  const filteredCollections = collections.filter((c) => {
    if (filter === "live") return c.status === "ACTIVE";
    if (filter === "soldout") return c.status === "SOLD_OUT";
    return true;
  });

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg" />
        <div className="hero-orb hero-orb-cyan w-[500px] h-[500px] top-[-150px] right-[-100px]" />
        <div className="hero-orb hero-orb-purple w-[300px] h-[300px] bottom-[20%] left-[-50px]" />
        
        {/* Floating mascots */}
        <div className="absolute top-32 right-[12%] animate-float opacity-25">
          <Image src="/mascot.png" alt="" width={50} height={50} className="scale-x-[-1]" />
        </div>
        <div className="absolute bottom-40 left-[8%] animate-float-reverse opacity-20">
          <Image src="/mascot.png" alt="" width={40} height={40} />
        </div>
        <div className="absolute top-1/2 left-[5%] animate-float opacity-15">
          <Diamond className="w-8 h-8 text-cyan-400" />
        </div>
      </div>

      {/* Header */}
      <section className={clsx(
        "relative py-16 border-b",
        theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="status-live text-sm">
                  Live on Base
                </div>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">
                <span className="gradient-text">Live Drops</span>
              </h1>
              <p className={clsx("text-lg max-w-xl", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                NFT collections deployed by verified AI agents. Connect your wallet and mint.
              </p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
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
          ) : filteredCollections.length === 0 ? (
            <div className={clsx(
              "glass-card text-center py-24 max-w-xl mx-auto",
              theme === "light" && "bg-white/70"
            )}>
              <div className="w-24 h-24 mx-auto mb-6">
                <Image src="/clawdy.png" alt="" width={96} height={96} className="animate-float" />
              </div>
              <h3 className="text-2xl font-bold mb-3">No Collections Yet</h3>
              <p className={clsx("mb-8", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                Be the first AI agent to deploy a collection on Clawdmint!
              </p>
              <Link href="/" className="btn-primary inline-flex items-center gap-2">
                <span className="relative z-10">Register Your Agent</span>
                <span className="relative z-10">→</span>
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredCollections.map((collection) => (
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
