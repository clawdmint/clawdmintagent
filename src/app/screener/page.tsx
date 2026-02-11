"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import {
  Search, RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  ArrowUpDown, Zap, Activity, Timer, Star, X, Copy, Check,
  BarChart3, DollarSign, Droplets, Users, AlertTriangle,
  Flame, Clock, ArrowUp, ArrowDown, Wallet, Globe,
  MessageCircle, Send, Crown, Rocket, LayoutGrid, LayoutList,
  ArrowRight, Sparkles, ShoppingCart, Eye,
} from "lucide-react";
import Link from "next/link";
import { BankrGate } from "@/components/bankr-gate";
import type { ScreenerToken } from "@/app/api/screener/tokens/route";

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function fmtPrice(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${fmtCompact(n)}`;
}

function fmtCompact(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (abs >= 1) return n.toFixed(0);
  return n.toFixed(2);
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function truncAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getAgeMins(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 60_000;
}

// ═══════════════════════════════════════════════════════════════════════
// TYPES & TABS
// ═══════════════════════════════════════════════════════════════════════

type TabId = "trending" | "new" | "gainers" | "losers" | "watchlist";
type ViewMode = "table" | "grid";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  sortBy: string;
  sort: string;
}

const TABS: TabDef[] = [
  { id: "trending", label: "Trending", icon: Flame, sortBy: "market-cap", sort: "desc" },
  { id: "new", label: "New Pairs", icon: Clock, sortBy: "deployed-at", sort: "desc" },
  { id: "gainers", label: "Gainers", icon: ArrowUp, sortBy: "price-percent-h24", sort: "desc" },
  { id: "losers", label: "Losers", icon: ArrowDown, sortBy: "price-percent-h24", sort: "asc" },
  { id: "watchlist", label: "Watchlist", icon: Star, sortBy: "market-cap", sort: "desc" },
];

// ═══════════════════════════════════════════════════════════════════════
// CORE / VERIFIED BADGES
// ═══════════════════════════════════════════════════════════════════════

function CoreBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/25" title="Core Bankr Token">
      <Zap className="w-2.5 h-2.5 text-cyan-400" />
      <span className="font-mono text-[7px] text-cyan-400 font-bold">CORE</span>
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25" title="Verified Token">
      <Check className="w-2.5 h-2.5 text-emerald-400" />
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WATCHLIST HELPERS (localStorage)
// ═══════════════════════════════════════════════════════════════════════

const WL_KEY = "bankr_screener_watchlist";

function getWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WL_KEY) || "[]");
  } catch { return []; }
}

function toggleWatchlist(addr: string): string[] {
  const list = getWatchlist();
  const lower = addr.toLowerCase();
  const idx = list.indexOf(lower);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(lower);
  localStorage.setItem(WL_KEY, JSON.stringify(list));
  return [...list];
}

function isWatchlisted(addr: string, list: string[]): boolean {
  return list.includes(addr.toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════
// TERMINAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function TerminalWindow({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-cyan-500/20 bg-[#0a0d14] overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-cyan-500/10 bg-cyan-500/[0.02]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-500/50" />
        </div>
        <span className="font-mono text-[10px] text-cyan-500/60 ml-2">{title}</span>
      </div>
      <div className="font-mono text-sm">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function PriceChangeCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-gray-600">—</span>;
  const isPositive = value >= 0;
  return (
    <span className={clsx("font-mono text-xs tabular-nums", isPositive ? "text-emerald-400" : "text-red-400")}>
      {fmtPct(value)}
    </span>
  );
}

function TokenImage({ src, symbol, size = 8 }: { src: string | null; symbol: string; size?: number }) {
  const [error, setError] = useState(false);
  const px = size * 4;
  if (!src || error) {
    return (
      <div className="rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center"
        style={{ width: px, height: px }}>
        <span className="text-cyan-400 font-bold" style={{ fontSize: px * 0.3 }}>{symbol.slice(0, 2)}</span>
      </div>
    );
  }
  return (
    <img src={src} alt={symbol} className="rounded-full object-cover border border-white/10"
      style={{ width: px, height: px }} onError={() => setError(true)} />
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <Icon className={clsx("w-4 h-4", color)} />
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
        <div className="text-sm font-mono text-white font-medium">{value}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MARKET CAP MILESTONE BADGES
// ═══════════════════════════════════════════════════════════════════════

function McapBadge({ marketCap }: { marketCap: number | null }) {
  if (!marketCap) return null;
  if (marketCap >= 1_000_000) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30" title="$1M+ Market Cap">
        <Crown className="w-2.5 h-2.5 text-yellow-400" />
        <span className="font-mono text-[8px] text-yellow-400 font-bold">1M</span>
      </span>
    );
  }
  if (marketCap >= 100_000) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-500/15 border border-orange-500/25" title="$100K+ Market Cap">
        <Flame className="w-2.5 h-2.5 text-orange-400" />
        <span className="font-mono text-[8px] text-orange-400 font-bold">100K</span>
      </span>
    );
  }
  if (marketCap >= 10_000) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/25" title="$10K+ Market Cap">
        <Rocket className="w-2.5 h-2.5 text-cyan-400" />
        <span className="font-mono text-[8px] text-cyan-400 font-bold">10K</span>
      </span>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// TOKEN AGE BADGE
// ═══════════════════════════════════════════════════════════════════════

function AgeBadge({ deployedAt }: { deployedAt: string }) {
  const mins = getAgeMins(deployedAt);
  if (mins < 10) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-400/30 border border-emerald-400/50 badge-just-launched">
        <Sparkles className="w-2.5 h-2.5 text-emerald-300" />
        <span className="font-mono text-[8px] text-emerald-300 font-black uppercase tracking-wider">JUST LAUNCHED</span>
      </span>
    );
  }
  if (mins < 30) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 animate-pulse">
        <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
        <span className="font-mono text-[8px] text-emerald-400 font-bold uppercase">NEW</span>
      </span>
    );
  }
  if (mins < 60) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <span className="font-mono text-[8px] text-emerald-400/80 font-bold uppercase">&lt;1H</span>
      </span>
    );
  }
  if (mins < 1440) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
        <span className="font-mono text-[8px] text-blue-400/80 font-bold uppercase">FRESH</span>
      </span>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// BUY/SELL RATIO BAR
// ═══════════════════════════════════════════════════════════════════════

function BuySellBar({ buys, sells, size = "sm" }: { buys: number | null; sells: number | null; size?: "sm" | "md" }) {
  if (buys === null || sells === null) return <span className="text-gray-600 font-mono text-[10px]">—</span>;
  const total = buys + sells;
  if (total === 0) return <span className="text-gray-600 font-mono text-[10px]">0</span>;
  const buyPct = (buys / total) * 100;
  const h = size === "md" ? "h-2" : "h-1.5";
  return (
    <div className="flex flex-col gap-0.5">
      <div className={clsx("w-full rounded-full overflow-hidden flex", h)} style={{ minWidth: 60 }}>
        <div className="bg-emerald-500/70 transition-all duration-500" style={{ width: `${buyPct}%` }} />
        <div className="bg-red-500/70 transition-all duration-500" style={{ width: `${100 - buyPct}%` }} />
      </div>
      <div className="flex justify-between">
        <span className="font-mono text-[8px] text-emerald-400">{buys}B</span>
        <span className="font-mono text-[8px] text-red-400">{sells}S</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SOCIAL HELPERS
// ═══════════════════════════════════════════════════════════════════════

function XTwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function getSocialIcon(platform: string): React.ReactNode {
  const p = platform.toLowerCase();
  if (p === "twitter" || p === "x") return <XTwitterIcon className="w-3.5 h-3.5" />;
  if (p === "telegram" || p === "tg") return <Send className="w-3.5 h-3.5" />;
  if (p === "discord") return <MessageCircle className="w-3.5 h-3.5" />;
  if (p === "website" || p === "web") return <Globe className="w-3.5 h-3.5" />;
  return <Globe className="w-3.5 h-3.5" />;
}

function getSocialLabel(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "twitter" || p === "x") return "Twitter";
  if (p === "telegram" || p === "tg") return "Telegram";
  if (p === "discord") return "Discord";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function getSocialColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "twitter" || p === "x") return "text-gray-300 hover:text-white";
  if (p === "telegram" || p === "tg") return "text-blue-400 hover:text-blue-300";
  if (p === "discord") return "text-indigo-400 hover:text-indigo-300";
  return "text-gray-400 hover:text-gray-300";
}

// ═══════════════════════════════════════════════════════════════════════
// KING OF THE HILL
// ═══════════════════════════════════════════════════════════════════════

function KingOfTheHill({ token, onSelect }: { token: ScreenerToken; onSelect: (t: ScreenerToken) => void }) {
  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer group mb-6"
      onClick={() => onSelect(token)}
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-xl p-[1px] bg-gradient-to-r from-yellow-500/50 via-amber-500/50 to-orange-500/50 animate-pulse" />
      <div className="relative rounded-xl bg-[#0a0d14] p-0.5">
        <div className="rounded-lg bg-gradient-to-br from-yellow-500/[0.05] via-transparent to-orange-500/[0.05] p-5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-yellow-400" />
            <span className="font-mono text-xs font-bold text-yellow-400 uppercase tracking-wider">
              King of the Hill
            </span>
            <span className="font-mono text-[9px] text-gray-600 ml-auto">
              Highest volume token
            </span>
          </div>

          <div className="flex items-center gap-5">
            {/* Token Image */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full bg-yellow-400/20 blur-xl" />
              <TokenImage src={token.imageUrl} symbol={token.symbol} size={16} />
            </div>

            {/* Token Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-lg font-bold text-white">{token.symbol}</span>
                <span className="font-mono text-xs text-gray-500">/{token.pair}</span>
                <McapBadge marketCap={token.marketCap} />
                <AgeBadge deployedAt={token.deployedAt} />
              </div>
              <div className="font-mono text-xs text-gray-500 mb-3 truncate">{token.name}</div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Price */}
                <div>
                  <div className="font-mono text-[9px] text-gray-600 uppercase">Price</div>
                  <div className="font-mono text-lg font-bold text-white">{fmtPrice(token.priceUsd)}</div>
                </div>
                {/* 24h change */}
                <div>
                  <div className="font-mono text-[9px] text-gray-600 uppercase">24H</div>
                  <div className="text-lg"><PriceChangeCell value={token.priceChange24h} /></div>
                </div>
                {/* Market Cap */}
                <div className="hidden sm:block">
                  <div className="font-mono text-[9px] text-gray-600 uppercase">MCap</div>
                  <div className="font-mono text-sm text-gray-200">{token.marketCap ? `$${fmtCompact(token.marketCap)}` : "—"}</div>
                </div>
                {/* Volume */}
                <div className="hidden sm:block">
                  <div className="font-mono text-[9px] text-gray-600 uppercase">24H Vol</div>
                  <div className="font-mono text-sm text-gray-200">{token.volume24h ? `$${fmtCompact(token.volume24h)}` : "—"}</div>
                </div>
                {/* Buy/Sell */}
                <div className="hidden md:block">
                  <div className="font-mono text-[9px] text-gray-600 uppercase mb-0.5">Buy/Sell (24H)</div>
                  <BuySellBar buys={token.buys24h} sells={token.sells24h} size="md" />
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="hidden lg:flex flex-col gap-2 shrink-0">
              <Link href={`/trade?token=${token.symbol}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/20 transition-all">
                <ShoppingCart className="w-3.5 h-3.5" /> Quick Trade
              </Link>
              <a href={token.dexScreenerUrl || "#"} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 transition-all">
                <BarChart3 className="w-3.5 h-3.5" /> Chart
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LIVE ACTIVITY TICKER
// ═══════════════════════════════════════════════════════════════════════

function LiveTicker({ tokens }: { tokens: ScreenerToken[] }) {
  // Pick recent movers for the ticker
  const tickerItems = useMemo(() => {
    if (tokens.length === 0) return [];
    const items: { symbol: string; action: string; color: string; value: string }[] = [];

    // Biggest gainers in 5m
    const sorted5m = [...tokens]
      .filter((t) => t.priceChange5m !== null)
      .sort((a, b) => (b.priceChange5m || 0) - (a.priceChange5m || 0));

    for (const t of sorted5m.slice(0, 3)) {
      if (t.priceChange5m && t.priceChange5m > 1) {
        items.push({ symbol: t.symbol, action: "pumping", color: "text-emerald-400", value: fmtPct(t.priceChange5m) });
      }
    }

    // Biggest losers in 5m
    for (const t of sorted5m.slice(-3).reverse()) {
      if (t.priceChange5m && t.priceChange5m < -1) {
        items.push({ symbol: t.symbol, action: "dumping", color: "text-red-400", value: fmtPct(t.priceChange5m) });
      }
    }

    // Newly launched
    for (const t of tokens.slice(0, 20)) {
      if (getAgeMins(t.deployedAt) < 60) {
        items.push({ symbol: t.symbol, action: "just launched", color: "text-cyan-400", value: fmtAge(t.deployedAt) + " ago" });
      }
    }

    // High volume tokens
    const sortedVol = [...tokens].filter((t) => t.volumeM5 !== null && (t.volumeM5 || 0) > 1000).sort((a, b) => (b.volumeM5 || 0) - (a.volumeM5 || 0));
    for (const t of sortedVol.slice(0, 3)) {
      items.push({ symbol: t.symbol, action: "high volume", color: "text-amber-400", value: `$${fmtCompact(t.volumeM5)}` });
    }

    return items.length > 0 ? items : tokens.slice(0, 6).map((t) => ({
      symbol: t.symbol,
      action: "trading at",
      color: "text-gray-400",
      value: fmtPrice(t.priceUsd),
    }));
  }, [tokens]);

  if (tickerItems.length === 0) return null;

  // Duplicate for infinite scroll
  const doubled = [...tickerItems, ...tickerItems];

  return (
    <div className="relative overflow-hidden rounded-lg border border-cyan-500/10 bg-[#0a0d14] mb-6">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0d14] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0d14] to-transparent z-10" />
      <div className="flex items-center gap-1 px-3 py-0.5">
        <div className="shrink-0 flex items-center gap-1 pr-3 border-r border-cyan-500/10">
          <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
          <span className="font-mono text-[9px] text-cyan-400 uppercase font-bold">LIVE</span>
        </div>
        <div className="overflow-hidden flex-1">
          <div className="flex gap-6 animate-ticker whitespace-nowrap py-2">
            {doubled.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono text-[10px] text-white font-bold">${item.symbol}</span>
                <span className="font-mono text-[10px] text-gray-600">{item.action}</span>
                <span className={clsx("font-mono text-[10px] font-bold", item.color)}>{item.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* Ticker animation styles injected via <style> */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes bankr-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: bankr-ticker 30s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
        /* pump.fun style grid card glow for new tokens */
        @keyframes newpair-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(16,185,129,0.15), inset 0 0 4px rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.2); }
          50% { box-shadow: 0 0 20px rgba(16,185,129,0.5), inset 0 0 10px rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.6); }
        }
        .newpair-flash {
          animation: newpair-glow 1.5s ease-in-out infinite;
        }
        /* pump.fun style table row blink for freshest tokens (<10 min) */
        @keyframes newpair-row-blink {
          0%   { background-color: rgba(16,185,129,0.01); }
          15%  { background-color: rgba(16,185,129,0.12); }
          30%  { background-color: rgba(16,185,129,0.02); }
          50%  { background-color: rgba(16,185,129,0.08); }
          70%  { background-color: rgba(16,185,129,0.01); }
          85%  { background-color: rgba(16,185,129,0.10); }
          100% { background-color: rgba(16,185,129,0.01); }
        }
        /* softer pulse for tokens 10-30min old */
        @keyframes newpair-row-pulse {
          0%, 100% { background-color: rgba(16,185,129,0.02); }
          50% { background-color: rgba(16,185,129,0.06); }
        }
        .newpair-row-blink {
          animation: newpair-row-blink 1.8s ease-in-out infinite;
          position: relative;
        }
        .newpair-row-blink::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: rgb(16,185,129);
          animation: newpair-bar-pulse 1.8s ease-in-out infinite;
          border-radius: 0 2px 2px 0;
        }
        @keyframes newpair-bar-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .newpair-row-flash {
          animation: newpair-row-pulse 2.5s ease-in-out infinite;
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .newpair-slide {
          animation: slide-in 0.3s ease-out;
        }
        /* "JUST LAUNCHED" badge pulse */
        @keyframes just-launched {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
        .badge-just-launched {
          animation: just-launched 1s ease-in-out infinite;
        }
      ` }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GRID CARD VIEW
// ═══════════════════════════════════════════════════════════════════════

function TokenGridCard({ token, idx, watchlist, onToggleWatchlist, onSelect }: {
  token: ScreenerToken;
  idx: number;
  watchlist: string[];
  onToggleWatchlist: (addr: string) => void;
  onSelect: (t: ScreenerToken) => void;
}) {
  const starred = isWatchlisted(token.contractAddress, watchlist);
  const isPositive = (token.priceChange24h || 0) >= 0;

  const ageMins = getAgeMins(token.deployedAt);
  const isJustLaunched = ageMins < 10;
  const isVeryNew = ageMins < 30;

  return (
    <div
      className={clsx(
        "relative rounded-xl border bg-[#0a0d14] overflow-hidden cursor-pointer group transition-all hover:scale-[1.02]",
        isJustLaunched ? "newpair-flash newpair-slide border-emerald-400/40" : isVeryNew ? "newpair-flash newpair-slide" : isPositive ? "border-emerald-500/10 hover:border-emerald-500/30" : "border-red-500/10 hover:border-red-500/30"
      )}
      onClick={() => onSelect(token)}
    >
      {/* Top gradient line */}
      <div className={clsx("h-0.5 w-full", isJustLaunched ? "bg-gradient-to-r from-emerald-300/80 via-emerald-400/60 to-emerald-300/80 animate-pulse" : isVeryNew ? "bg-gradient-to-r from-emerald-400/70 via-emerald-500/50 to-emerald-400/70 animate-pulse" : isPositive ? "bg-gradient-to-r from-emerald-500/50 to-emerald-500/10" : "bg-gradient-to-r from-red-500/50 to-red-500/10")} />

      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <TokenImage src={token.imageUrl} symbol={token.symbol} size={10} />
              {/* Rank badge */}
              <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[#0a0d14] border border-cyan-500/30 flex items-center justify-center">
                <span className="font-mono text-[7px] text-cyan-400 font-bold">{idx + 1}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-sm font-bold text-white">{token.symbol}</span>
                <span className="font-mono text-[10px] text-gray-600">/{token.pair}</span>
                {token.isCore && <CoreBadge />}
                {token.isVerified && <VerifiedBadge />}
              </div>
              <div className="font-mono text-[10px] text-gray-600 truncate max-w-[120px]">{token.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <AgeBadge deployedAt={token.deployedAt} />
            <button
              onClick={(e) => { e.stopPropagation(); onToggleWatchlist(token.contractAddress); }}
              className={clsx("p-1 transition-colors", starred ? "text-yellow-400" : "text-gray-700 hover:text-yellow-400/60")}
            >
              <Star className="w-3.5 h-3.5" fill={starred ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* Price & Change */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="font-mono text-lg font-bold text-white">{fmtPrice(token.priceUsd)}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <McapBadge marketCap={token.marketCap} />
            </div>
          </div>
          <div className={clsx(
            "px-2 py-1 rounded-lg font-mono text-xs font-bold",
            isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          )}>
            {fmtPct(token.priceChange24h)}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-gray-600">MCap</span>
            <span className="font-mono text-[10px] text-gray-300">{token.marketCap ? `$${fmtCompact(token.marketCap)}` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-gray-600">Vol 24H</span>
            <span className="font-mono text-[10px] text-gray-300">{token.volume24h ? `$${fmtCompact(token.volume24h)}` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-gray-600">Liq</span>
            <span className="font-mono text-[10px] text-gray-300">{token.liquidity ? `$${fmtCompact(token.liquidity)}` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-gray-600">Txns</span>
            <span className="font-mono text-[10px] text-gray-300">{token.txns24h !== null ? fmtCompact(token.txns24h) : "—"}</span>
          </div>
        </div>

        {/* Buy/Sell Bar */}
        <BuySellBar buys={token.buys24h} sells={token.sells24h} size="md" />

        {/* Price changes row */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.04]">
          {([
            ["5M", token.priceChange5m],
            ["1H", token.priceChange1h],
            ["6H", token.priceChange6h],
          ] as [string, number | null][]).map(([label, val]) => (
            <div key={label} className="flex-1 text-center">
              <div className="font-mono text-[8px] text-gray-600">{label}</div>
              <PriceChangeCell value={val} />
            </div>
          ))}
        </div>

        {/* Quick Trade */}
        <Link
          href={`/trade?token=${token.symbol}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-[10px] text-cyan-400 hover:bg-cyan-500/20 transition-all opacity-0 group-hover:opacity-100"
        >
          <ShoppingCart className="w-3 h-3" /> Quick Trade <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TOKEN DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════

function TokenDetailModal({ token, onClose, watchlist, onToggleWatchlist }: {
  token: ScreenerToken;
  onClose: () => void;
  watchlist: string[];
  onToggleWatchlist: (addr: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyAddr = () => {
    navigator.clipboard.writeText(token.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const starred = isWatchlisted(token.contractAddress, watchlist);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-cyan-500/20 bg-[#0a0d14]"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 bg-[#0a0d14]/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <TokenImage src={token.imageUrl} symbol={token.symbol} size={10} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-white">{token.symbol}</span>
                <span className="font-mono text-[10px] text-gray-500">/{token.pair}</span>
                {token.isCore && <CoreBadge />}
                {token.isVerified && <VerifiedBadge />}
                <McapBadge marketCap={token.marketCap} />
                <AgeBadge deployedAt={token.deployedAt} />
              </div>
              <div className="font-mono text-xs text-gray-500">{token.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onToggleWatchlist(token.contractAddress)}
              className={clsx("p-1.5 rounded-lg transition-all", starred ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400")}>
              <Star className="w-4 h-4" fill={starred ? "currentColor" : "none"} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Price Hero */}
        <div className="px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-end gap-3">
            <span className="font-mono text-2xl font-bold text-white">{fmtPrice(token.priceUsd)}</span>
            <PriceChangeCell value={token.priceChange24h} />
          </div>
        </div>

        {/* Buy/Sell Ratio */}
        <div className="px-5 py-3 border-b border-white/[0.04]">
          <div className="font-mono text-[10px] text-gray-500 uppercase mb-2">Buy / Sell Pressure (24H)</div>
          <BuySellBar buys={token.buys24h} sells={token.sells24h} size="md" />
          <div className="flex gap-4 mt-2">
            <div className="text-center flex-1">
              <div className="font-mono text-[9px] text-gray-600 mb-0.5">5M</div>
              <BuySellBar buys={token.buysM5} sells={token.sellsM5} />
            </div>
            <div className="text-center flex-1">
              <div className="font-mono text-[9px] text-gray-600 mb-0.5">1H</div>
              <BuySellBar buys={token.buysH1} sells={token.sellsH1} />
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-white/[0.04]">
          {([
            ["Market Cap", token.marketCap !== null ? `$${fmtCompact(token.marketCap)}` : "—"],
            ["FDV", token.fdv !== null ? `$${fmtCompact(token.fdv)}` : "—"],
            ["Liquidity", token.liquidity !== null ? `$${fmtCompact(token.liquidity)}` : "—"],
            ["24H Volume", token.volume24h !== null ? `$${fmtCompact(token.volume24h)}` : "—"],
            ["1H Volume", token.volumeH1 !== null ? `$${fmtCompact(token.volumeH1)}` : "—"],
            ["5M Volume", token.volumeM5 !== null ? `$${fmtCompact(token.volumeM5)}` : "—"],
            ["24H Txns", token.txns24h !== null ? fmtCompact(token.txns24h) : "—"],
            ["1H Txns", token.txnsH1 !== null ? fmtCompact(token.txnsH1) : "—"],
            ["Age", fmtAge(token.deployedAt)],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="font-mono text-[11px] text-gray-500">{label}</span>
              <span className="font-mono text-xs text-gray-200">{val}</span>
            </div>
          ))}
        </div>

        {/* Price Changes */}
        <div className="px-5 py-3 border-b border-white/[0.04]">
          <div className="font-mono text-[10px] text-gray-500 uppercase mb-2">Price Change</div>
          <div className="flex gap-4">
            {([
              ["5M", token.priceChange5m],
              ["1H", token.priceChange1h],
              ["6H", token.priceChange6h],
              ["24H", token.priceChange24h],
            ] as [string, number | null][]).map(([label, val]) => (
              <div key={label} className="text-center">
                <div className="font-mono text-[10px] text-gray-600 mb-0.5">{label}</div>
                <PriceChangeCell value={val} />
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-2.5">
          {/* Contract */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-gray-500">Contract</span>
            <button onClick={copyAddr}
              className="flex items-center gap-1.5 font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              {truncAddr(token.contractAddress)}
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          {/* Deployer */}
          {token.deployer && (
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-gray-500">Deployer</span>
              <span className="font-mono text-xs text-gray-300">
                {token.deployerName || truncAddr(token.deployer)}
              </span>
            </div>
          )}
          {/* Chain */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-gray-500">Chain</span>
            <span className="font-mono text-xs text-gray-300">Base</span>
          </div>
        </div>

        {/* Social Links */}
        {(token.socials.length > 0 || token.website) && (
          <div className="px-5 py-3 border-t border-white/[0.04]">
            <div className="font-mono text-[10px] text-gray-500 uppercase mb-2">Social Links</div>
            <div className="flex flex-wrap gap-2">
              {token.website && (
                <a href={token.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors">
                  <Globe className="w-3.5 h-3.5" /> Website <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </a>
              )}
              {token.socials.map((s) => (
                <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer"
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] transition-colors",
                    getSocialColor(s.platform)
                  )}>
                  {getSocialIcon(s.platform)} {getSocialLabel(s.platform)} <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 border-t border-white/[0.04] flex gap-2">
          <Link href={`/trade?token=${token.symbol}`}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors">
            <ShoppingCart className="w-3.5 h-3.5" /> Trade <ArrowRight className="w-3 h-3" />
          </Link>
          <a href={token.dexScreenerUrl || "#"} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-xs text-cyan-400 hover:bg-cyan-500/20 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> DexScreener <ExternalLink className="w-3 h-3" />
          </a>
          <a href={`https://basescan.org/token/${token.contractAddress}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-xs text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors">
            <Eye className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function BankrScreenerPage() {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState<ScreenerToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("trending");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ScreenerToken | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [tokenLimit, setTokenLimit] = useState(() => activeTab === "new" ? 120 : 60);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load watchlist on mount
  useEffect(() => { setWatchlist(getWatchlist()); }, []);

  const handleToggleWatchlist = (addr: string) => {
    const updated = toggleWatchlist(addr);
    setWatchlist(updated);
  };

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  const fetchTokens = useCallback(async (isAutoRefresh = false) => {
    if (activeTab === "watchlist") return;
    try {
      if (!isAutoRefresh) setLoading(true);
      setRefreshing(true);
      setError(null);

      const params = new URLSearchParams({
        sortBy: currentTab.sortBy,
        sort: currentTab.sort,
        limit: String(tokenLimit),
        noCache: "true",
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/screener/tokens?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setTokens(json.tokens);
        setLastUpdated(new Date());
        setHasMore(json.tokens.length >= tokenLimit);
      } else {
        setError(json.error || "Failed to fetch tokens");
      }
    } catch (e) {
      setError("Network error - please try again");
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, currentTab.sortBy, currentTab.sort, searchQuery, tokenLimit]);

  // Fetch watchlist tokens
  const fetchWatchlistTokens = useCallback(async () => {
    if (watchlist.length === 0) { setTokens([]); setLoading(false); return; }
    try {
      setLoading(true);
      setRefreshing(true);
      const results: ScreenerToken[] = [];
      await Promise.all(
        watchlist.slice(0, 10).map(async (addr) => {
          try {
            const res = await fetch(`/api/screener/tokens?q=${addr}&limit=1&noCache=true`);
            const json = await res.json();
            if (json.success && json.tokens.length > 0) {
              results.push(json.tokens[0]);
            }
          } catch { /* skip */ }
        }),
      );
      setTokens(results);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to fetch watchlist");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [watchlist]);

  // Fetch on tab/search change
  useEffect(() => {
    if (activeTab === "watchlist") {
      fetchWatchlistTokens();
    } else {
      fetchTokens();
    }
  }, [activeTab, fetchTokens, fetchWatchlistTokens]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        if (activeTab === "watchlist") fetchWatchlistTokens();
        else fetchTokens(true);
      }, 30_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchTokens, fetchWatchlistTokens, activeTab]);

  // King of the Hill (highest 24h volume token)
  const kingToken = useMemo(() => {
    if (tokens.length === 0) return null;
    return [...tokens].sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))[0];
  }, [tokens]);

  // Aggregate stats
  const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24h || 0), 0);
  const totalTxns = tokens.reduce((sum, t) => sum + (t.txns24h || 0), 0);
  const totalMcap = tokens.reduce((sum, t) => sum + (t.marketCap || 0), 0);
  const newTokens = tokens.filter((t) => getAgeMins(t.deployedAt) < 60).length;

  return (
    <BankrGate>
    <div className={clsx("min-h-screen transition-colors duration-300", theme === "dark" ? "bg-[#050810]" : "bg-gray-50")}>
      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)" }} />

      <div className="relative z-10 container mx-auto px-4 py-6">
        {/* ─── HEADER ─── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <h1 className="font-mono text-xl font-bold text-white">
                  Bankr<span className="text-cyan-400">Screener</span>
                </h1>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="font-mono text-[10px] text-cyan-400 font-medium">LIVE</span>
              </div>
              <span className="hidden sm:block font-mono text-[11px] text-gray-600">
                powered by Bankr + Clanker
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/trade"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/20 transition-all">
                <ShoppingCart className="w-3.5 h-3.5" /> Trade
              </Link>
              <Link href="/portfolio"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
                <Wallet className="w-3.5 h-3.5" /> Portfolio
              </Link>
            </div>
          </div>
          <p className="font-mono text-xs text-gray-500">
            Track tokens launched through Bankr on Base — real-time prices, volume, and market data
          </p>
        </div>

        {/* ─── LIVE TICKER ─── */}
        {!loading && tokens.length > 0 && <LiveTicker tokens={tokens} />}

        {/* ─── STATS ─── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard icon={BarChart3} label="Tokens" value={String(tokens.length)} color="text-cyan-400" />
          <StatCard icon={DollarSign} label="24H Volume" value={`$${fmtCompact(totalVolume)}`} color="text-emerald-400" />
          <StatCard icon={Users} label="24H Txns" value={fmtCompact(totalTxns)} color="text-purple-400" />
          <StatCard icon={Droplets} label="Total MCap" value={`$${fmtCompact(totalMcap)}`} color="text-amber-400" />
          <StatCard icon={Sparkles} label="New (<1H)" value={String(newTokens)} color="text-emerald-400" />
        </div>

        {/* ─── KING OF THE HILL ─── */}
        {!loading && kingToken && activeTab === "trending" && !searchQuery && (
          <KingOfTheHill token={kingToken} onSelect={setSelectedToken} />
        )}

        {/* ─── MAIN TERMINAL ─── */}
        <TerminalWindow title="bankr-screener — token explorer">
          {/* ─── TAB BAR ─── */}
          <div className="flex items-center justify-between px-4 pt-3 pb-0">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setTokenLimit(tab.id === "new" ? 120 : 60); }}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-2 rounded-t-lg font-mono text-[11px] transition-all whitespace-nowrap border-b-2",
                      isActive
                        ? "bg-white/[0.04] text-cyan-400 border-cyan-400"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.02] border-transparent"
                    )}>
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.id === "watchlist" && watchlist.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[9px]">
                        {watchlist.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center gap-1 ml-2">
              <button
                onClick={() => setViewMode("table")}
                className={clsx("p-1.5 rounded-lg transition-all", viewMode === "table" ? "text-cyan-400 bg-cyan-500/10" : "text-gray-600 hover:text-gray-400")}
                title="Table view"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={clsx("p-1.5 rounded-lg transition-all", viewMode === "grid" ? "text-cyan-400 bg-cyan-500/10" : "text-gray-600 hover:text-gray-400")}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ─── CONTROLS ─── */}
          <div className="p-4 border-b border-cyan-500/10">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input type="text" placeholder="Search token name or symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (activeTab === "watchlist") fetchWatchlistTokens();
                      else fetchTokens();
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 rounded-lg font-mono text-xs transition-all bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.05]" />
              </div>

              {/* Refresh controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => activeTab === "watchlist" ? fetchWatchlistTokens() : fetchTokens()}
                  disabled={refreshing}
                  className={clsx("p-2 rounded-lg transition-all border bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20", refreshing && "animate-spin")}
                  title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setAutoRefresh(!autoRefresh)}
                  className={clsx("px-2.5 py-1.5 rounded-lg font-mono text-[10px] transition-all border flex items-center gap-1.5",
                    autoRefresh ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-white/[0.03] border-white/[0.06] text-gray-500")}
                  title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}>
                  <Timer className="w-3 h-3" /> {autoRefresh ? "AUTO" : "OFF"}
                </button>
              </div>
            </div>

            {lastUpdated && (
              <div className="mt-2 font-mono text-[10px] text-gray-600">
                last_update: {lastUpdated.toLocaleTimeString()} {autoRefresh && "• refreshing every 30s"}
              </div>
            )}
          </div>

          {/* ─── CONTENT ─── */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                  <span className="font-mono text-sm text-gray-400">
                    fetching bankr tokens<span className="animate-pulse">...</span>
                  </span>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                  <p className="font-mono text-sm text-red-400 mb-2">{error}</p>
                  <button onClick={() => fetchTokens()} className="font-mono text-xs text-cyan-400 hover:underline">retry</button>
                </div>
              </div>
            ) : tokens.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  {activeTab === "watchlist" ? (
                    <>
                      <Star className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                      <p className="font-mono text-sm text-gray-400">Your watchlist is empty</p>
                      <p className="font-mono text-[11px] text-gray-600 mt-1">
                        Click the star icon on any token to add it here
                      </p>
                    </>
                  ) : (
                    <>
                      <Activity className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                      <p className="font-mono text-sm text-gray-400">No tokens found</p>
                      <p className="font-mono text-[11px] text-gray-600 mt-1">
                        {searchQuery ? "Try a different search term" : "Bankr tokens will appear here"}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : viewMode === "grid" ? (
              /* ─── GRID VIEW ─── */
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {tokens.map((token, idx) => (
                  <TokenGridCard
                    key={token.contractAddress || idx}
                    token={token}
                    idx={idx}
                    watchlist={watchlist}
                    onToggleWatchlist={handleToggleWatchlist}
                    onSelect={setSelectedToken}
                  />
                ))}
              </div>
            ) : (
              /* ─── TABLE VIEW ─── */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cyan-500/10 text-[10px] text-gray-500 uppercase tracking-wider">
                      <th className="text-left pl-4 pr-1 py-3 font-medium w-6"></th>
                      <th className="text-left pr-2 py-3 font-medium w-6">#</th>
                      <th className="text-left px-2 py-3 font-medium">Token</th>
                      <th className="text-right px-2 py-3 font-medium">Price</th>
                      <th className="text-center px-2 py-3 font-medium hidden sm:table-cell">Age</th>
                      <th className="text-center px-2 py-3 font-medium hidden lg:table-cell">Buy/Sell</th>
                      <th className="text-right px-2 py-3 font-medium hidden md:table-cell">Txns</th>
                      <th className="text-right px-2 py-3 font-medium hidden lg:table-cell">Volume</th>
                      <th className="text-right px-2 py-3 font-medium hidden sm:table-cell">5M</th>
                      <th className="text-right px-2 py-3 font-medium">1H</th>
                      <th className="text-right px-2 py-3 font-medium hidden md:table-cell">6H</th>
                      <th className="text-right px-2 py-3 font-medium">24H</th>
                      <th className="text-right px-2 py-3 font-medium hidden lg:table-cell">Liq</th>
                      <th className="text-right px-2 pr-4 py-3 font-medium hidden md:table-cell">MCap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token, idx) => {
                      const starred = isWatchlisted(token.contractAddress, watchlist);
                      const isKing = kingToken && token.contractAddress === kingToken.contractAddress && activeTab === "trending";
                      const ageMins = getAgeMins(token.deployedAt);
                      const isNewPairVeryFresh = activeTab === "new" && ageMins < 10;
                      const isNewPairFresh = activeTab === "new" && ageMins < 30;
                      const isNewPairRecent = activeTab === "new" && ageMins < 120;
                      return (
                        <tr key={token.contractAddress || idx}
                          className={clsx(
                            "border-b border-white/[0.03] hover:bg-cyan-500/[0.03] transition-colors group cursor-pointer",
                            isKing && "bg-yellow-500/[0.03] hover:bg-yellow-500/[0.05]",
                            isNewPairVeryFresh && "newpair-row-blink newpair-slide",
                            isNewPairFresh && !isNewPairVeryFresh && "newpair-row-flash newpair-slide",
                            isNewPairRecent && !isNewPairFresh && "bg-emerald-500/[0.02]"
                          )}
                          onClick={() => setSelectedToken(token)}>
                          {/* Star */}
                          <td className="pl-4 pr-1 py-3">
                            <button onClick={(e) => { e.stopPropagation(); handleToggleWatchlist(token.contractAddress); }}
                              className={clsx("transition-colors", starred ? "text-yellow-400" : "text-gray-700 hover:text-yellow-400/60")}>
                              <Star className="w-3.5 h-3.5" fill={starred ? "currentColor" : "none"} />
                            </button>
                          </td>
                          {/* # */}
                          <td className="pr-2 py-3">
                            <div className="flex items-center gap-1">
                              {isKing && <Crown className="w-3 h-3 text-yellow-400" />}
                              <span className={clsx("font-mono text-[11px]", isKing ? "text-yellow-400 font-bold" : "text-gray-600")}>{idx + 1}</span>
                            </div>
                          </td>
                          {/* Token */}
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-2.5">
                              <TokenImage src={token.imageUrl} symbol={token.symbol} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="font-mono text-xs font-semibold text-white truncate max-w-[100px]">{token.symbol}</span>
                                  <span className="font-mono text-[10px] text-gray-600">/{token.pair}</span>
                                  {token.isCore && <CoreBadge />}
                                  {token.isVerified && <VerifiedBadge />}
                                  <McapBadge marketCap={token.marketCap} />
                                  <AgeBadge deployedAt={token.deployedAt} />
                                  {token.warnings.length > 0 && <AlertTriangle className="w-3 h-3 text-yellow-500/60 shrink-0" />}
                                  {!token.hasLiquidity && !token.isCore && <span className="font-mono text-[7px] text-red-400/60 px-1 py-0.5 rounded bg-red-500/10 border border-red-500/20">LOW LIQ</span>}
                                  {/* Inline social icons */}
                                  {(token.socials?.length > 0 || token.website) && (
                                    <span className="flex items-center gap-0.5 ml-0.5">
                                      {token.website && (
                                        <a href={token.website} target="_blank" rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-gray-600 hover:text-cyan-400 transition-colors" title="Website">
                                          <Globe className="w-3 h-3" />
                                        </a>
                                      )}
                                      {token.socials?.slice(0, 3).map((s) => (
                                        <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className={clsx("transition-colors", getSocialColor(s.platform))}
                                          title={getSocialLabel(s.platform)}>
                                          {getSocialIcon(s.platform)}
                                        </a>
                                      ))}
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[10px] text-gray-600 truncate max-w-[140px]">{token.name}</div>
                              </div>
                            </div>
                          </td>
                          {/* Price */}
                          <td className="px-2 py-3 text-right">
                            <span className="font-mono text-xs text-white tabular-nums">{fmtPrice(token.priceUsd)}</span>
                          </td>
                          {/* Age */}
                          <td className="px-2 py-3 text-center hidden sm:table-cell">
                            <span className="font-mono text-[11px] text-gray-400 tabular-nums">{fmtAge(token.deployedAt)}</span>
                          </td>
                          {/* Buy/Sell */}
                          <td className="px-2 py-3 hidden lg:table-cell">
                            <BuySellBar buys={token.buysH1} sells={token.sellsH1} />
                          </td>
                          {/* Txns */}
                          <td className="px-2 py-3 text-right hidden md:table-cell">
                            <span className="font-mono text-xs text-gray-300 tabular-nums">
                              {token.txns24h !== null ? fmtCompact(token.txns24h) : "—"}
                            </span>
                          </td>
                          {/* Volume */}
                          <td className="px-2 py-3 text-right hidden lg:table-cell">
                            <span className="font-mono text-xs text-gray-300 tabular-nums">
                              {token.volume24h !== null ? `$${fmtCompact(token.volume24h)}` : "—"}
                            </span>
                          </td>
                          {/* 5M */}
                          <td className="px-2 py-3 text-right hidden sm:table-cell"><PriceChangeCell value={token.priceChange5m} /></td>
                          {/* 1H */}
                          <td className="px-2 py-3 text-right"><PriceChangeCell value={token.priceChange1h} /></td>
                          {/* 6H */}
                          <td className="px-2 py-3 text-right hidden md:table-cell"><PriceChangeCell value={token.priceChange6h} /></td>
                          {/* 24H */}
                          <td className="px-2 py-3 text-right"><PriceChangeCell value={token.priceChange24h} /></td>
                          {/* Liquidity */}
                          <td className="px-2 py-3 text-right hidden lg:table-cell">
                            <span className="font-mono text-xs text-gray-300 tabular-nums">
                              {token.liquidity !== null ? `$${fmtCompact(token.liquidity)}` : "—"}
                            </span>
                          </td>
                          {/* MCap */}
                          <td className="px-2 pr-4 py-3 text-right hidden md:table-cell">
                            <span className="font-mono text-xs text-gray-300 tabular-nums">
                              {token.marketCap !== null ? `$${fmtCompact(token.marketCap)}` : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Load More */}
          {tokens.length > 0 && hasMore && activeTab !== "watchlist" && (
            <div className="px-4 py-3 border-t border-cyan-500/10 flex justify-center">
              <button
                onClick={() => {
                  setTokenLimit((prev) => Math.min(prev + 40, activeTab === "new" ? 200 : 150));
                }}
                disabled={loadingMore || tokenLimit >= (activeTab === "new" ? 200 : 150)}
                className={clsx(
                  "px-6 py-2 rounded-lg font-mono text-[11px] transition-all flex items-center gap-2",
                  tokenLimit >= 150
                    ? "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                    : "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20"
                )}>
                {tokenLimit >= 150 ? "max reached (150)" : `load more tokens (${tokenLimit} → ${Math.min(tokenLimit + 40, 150)})`}
              </button>
            </div>
          )}

          {/* Footer */}
          {tokens.length > 0 && (
            <div className="px-4 py-3 border-t border-cyan-500/10 flex items-center justify-between">
              <span className="font-mono text-[10px] text-gray-600">
                {activeTab === "watchlist" ? `${tokens.length} watchlisted tokens` : `showing ${tokens.length} bankr tokens on Base`}
              </span>
              <div className="flex items-center gap-2">
                <a href="https://bankr.bot" target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] text-cyan-500/50 hover:text-cyan-400 transition-colors flex items-center gap-1">
                  bankr.bot <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-gray-700">|</span>
                <a href="https://dexscreener.com" target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] text-cyan-500/50 hover:text-cyan-400 transition-colors flex items-center gap-1">
                  dexscreener <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          )}
        </TerminalWindow>

        {/* ─── INFO ─── */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
            <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" /> What is BankrScreener?
            </h3>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              BankrScreener tracks tokens launched through the Bankr platform on Base.
              Bankr enables AI agents to deploy tokens where trading fees fund compute costs.
              This screener aggregates real-time price data, volume, and market metrics
              from DexScreener and the Clanker protocol.
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
            <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-400" /> Market Cap Badges
            </h3>
            <div className="space-y-2 font-mono text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <McapBadge marketCap={1_500_000} />
                <span>$1M+ Market Cap — Established Token</span>
              </div>
              <div className="flex items-center gap-2">
                <McapBadge marketCap={150_000} />
                <span>$100K+ Market Cap — Growing Token</span>
              </div>
              <div className="flex items-center gap-2">
                <McapBadge marketCap={15_000} />
                <span>$10K+ Market Cap — Early Stage</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
            <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Data Sources
            </h3>
            <ul className="space-y-2 font-mono text-xs text-gray-400">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Clanker API — Token deployment data (Bankr filter)</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> DexScreener — Real-time price, volume, liquidity</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Base Chain (8453) — On-chain Uniswap V3 pools</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ─── TOKEN DETAIL MODAL ─── */}
      {selectedToken && (
        <TokenDetailModal token={selectedToken} onClose={() => setSelectedToken(null)}
          watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
      )}
    </div>
    </BankrGate>
  );
}
