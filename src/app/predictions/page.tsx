"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { BankrGate } from "@/components/bankr-gate";
import Link from "next/link";
import {
  Search, RefreshCw, ExternalLink, X, TrendingUp, TrendingDown,
  Activity, Zap, Clock, Star, BarChart3, ChevronDown,
  Shield, Key, Eye, EyeOff, Trash2, AlertTriangle,
  DollarSign, Check, ArrowRight, Flame, Globe, Award,
  Hash, Target, Wallet,
} from "lucide-react";
import type { PredictionMarket } from "@/app/api/predictions/route";

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function fmtCompact(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtTimeLeft(endDate: string): string {
  if (!endDate) return "—";
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86_400_000);
  if (days > 365) return `${Math.floor(days / 365)}y`;
  if (days > 30) return `${Math.floor(days / 30)}mo`;
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diff / 60_000)}m`;
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const KEY_STORAGE = "bankr_api_key";

interface Category {
  id: string;
  label: string;
  icon: React.ElementType;
}

const CATEGORIES: Category[] = [
  { id: "", label: "All", icon: Globe },
  { id: "politics", label: "Politics", icon: Award },
  { id: "crypto", label: "Crypto", icon: DollarSign },
  { id: "sports", label: "Sports", icon: Target },
  { id: "science", label: "Science", icon: Zap },
  { id: "culture", label: "Culture", icon: Star },
];

const SORT_OPTIONS = [
  { id: "volume", label: "Volume" },
  { id: "liquidity", label: "Liquidity" },
  { id: "newest", label: "Newest" },
  { id: "ending", label: "Ending Soon" },
];

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
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PROBABILITY BAR
// ═══════════════════════════════════════════════════════════════════════

function ProbabilityBar({ outcomes, prices }: { outcomes: string[]; prices: number[] }) {
  if (outcomes.length < 2 || prices.length < 2) return null;
  const yesPrice = prices[0];
  const noPrice = prices[1];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-medium text-emerald-400">{outcomes[0]}</span>
          <span className="font-mono text-xs font-bold text-emerald-400">{fmtPct(yesPrice)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-red-400">{fmtPct(noPrice)}</span>
          <span className="font-mono text-[11px] font-medium text-red-400">{outcomes[1]}</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden flex">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full transition-all duration-500"
          style={{ width: `${yesPrice * 100}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-r-full transition-all duration-500"
          style={{ width: `${noPrice * 100}%` }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MARKET CARD
// ═══════════════════════════════════════════════════════════════════════

function MarketCard({
  market,
  onClick,
}: {
  market: PredictionMarket;
  onClick: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-cyan-500/15 transition-all p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {market.image && !imgErr ? (
          <img
            src={market.image}
            alt=""
            className="w-10 h-10 rounded-lg object-cover border border-white/[0.06] shrink-0"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Hash className="w-4 h-4 text-cyan-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-xs font-medium text-white leading-relaxed line-clamp-2 group-hover:text-cyan-400 transition-colors">
            {market.question}
          </h3>
        </div>
      </div>

      {/* Probability Bar */}
      <ProbabilityBar outcomes={market.outcomes} prices={market.outcomePrices} />

      {/* Stats */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-gray-600 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> ${fmtCompact(market.volume)}
          </span>
          <span className="font-mono text-[10px] text-gray-600 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {fmtTimeLeft(market.endDate)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {market.isNew && (
            <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 font-mono text-[9px] text-cyan-400">
              NEW
            </span>
          )}
          {market.featured && (
            <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 font-mono text-[9px] text-yellow-400">
              HOT
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MARKET DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════

function MarketDetailModal({
  market,
  onClose,
  onBet,
  betting,
  betResult,
  betError,
  connected,
}: {
  market: PredictionMarket;
  onClose: () => void;
  onBet: (outcome: string, amount: string) => void;
  betting: boolean;
  betResult: string | null;
  betError: string | null;
  connected: boolean;
}) {
  const [betOutcome, setBetOutcome] = useState<string>(market.outcomes[0] || "Yes");
  const [betAmount, setBetAmount] = useState("");
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-cyan-500/20 bg-[#0a0d14]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 bg-[#0a0d14]">
          <span className="font-mono text-[10px] text-cyan-500/60 uppercase">Market Detail</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Question */}
          <div className="flex items-start gap-3">
            {market.image && !imgErr ? (
              <img
                src={market.image}
                alt=""
                className="w-12 h-12 rounded-xl object-cover border border-white/[0.06] shrink-0"
                onError={() => setImgErr(true)}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <Hash className="w-5 h-5 text-cyan-400" />
              </div>
            )}
            <div>
              <h2 className="font-mono text-sm font-bold text-white leading-relaxed">
                {market.question}
              </h2>
              {market.category && (
                <span className="font-mono text-[10px] text-gray-500 uppercase">{market.category}</span>
              )}
            </div>
          </div>

          {/* Probability */}
          <ProbabilityBar outcomes={market.outcomes} prices={market.outcomePrices} />

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ["Total Volume", `$${fmtCompact(market.volume)}`],
              ["24H Volume", `$${fmtCompact(market.volume24h)}`],
              ["Liquidity", `$${fmtCompact(market.liquidity)}`],
              ["Ends In", fmtTimeLeft(market.endDate)],
            ] as [string, string][]).map(([label, val]) => (
              <div key={label} className="flex justify-between items-center p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="font-mono text-[10px] text-gray-500">{label}</span>
                <span className="font-mono text-xs text-gray-200">{val}</span>
              </div>
            ))}
          </div>

          {/* Description */}
          {market.description && (
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="font-mono text-[10px] text-gray-500 uppercase mb-1.5">Description</div>
              <p className="font-mono text-[11px] text-gray-400 leading-relaxed line-clamp-4">
                {market.description}
              </p>
            </div>
          )}

          {/* Bet Section */}
          {connected ? (
            <div className="space-y-3">
              <div className="font-mono text-[10px] text-gray-500 uppercase">Place a Bet</div>

              {/* Outcome selector */}
              <div className="flex gap-2">
                {market.outcomes.map((outcome, idx) => (
                  <button
                    key={outcome}
                    onClick={() => setBetOutcome(outcome)}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg font-mono text-xs font-medium border transition-all",
                      betOutcome === outcome
                        ? idx === 0
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                          : "bg-red-500/15 border-red-500/30 text-red-400"
                        : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.1]"
                    )}
                  >
                    {outcome} ({fmtPct(market.outcomePrices[idx] ?? 0.5)})
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="number"
                  placeholder="Amount (USDC)"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                />
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {["5", "10", "25", "50", "100"].map((a) => (
                  <button
                    key={a}
                    onClick={() => setBetAmount(a)}
                    className={clsx(
                      "flex-1 py-1.5 rounded-lg font-mono text-[10px] border transition-all",
                      betAmount === a
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                        : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.1]"
                    )}
                  >
                    ${a}
                  </button>
                ))}
              </div>

              {/* Potential payout */}
              {betAmount && parseFloat(betAmount) > 0 && (
                <div className="p-3 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/10">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[11px] text-gray-400">Potential Payout</span>
                    <span className="font-mono text-sm font-bold text-cyan-400">
                      ${(parseFloat(betAmount) / (market.outcomePrices[market.outcomes.indexOf(betOutcome)] || 0.5)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="font-mono text-[10px] text-gray-500">Potential Profit</span>
                    <span className="font-mono text-xs text-emerald-400">
                      +${((parseFloat(betAmount) / (market.outcomePrices[market.outcomes.indexOf(betOutcome)] || 0.5)) - parseFloat(betAmount)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Bet button */}
              <button
                onClick={() => onBet(betOutcome, betAmount)}
                disabled={betting || !betAmount || parseFloat(betAmount) <= 0}
                className={clsx(
                  "w-full py-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2",
                  !betting && betAmount && parseFloat(betAmount) > 0
                    ? "bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400 hover:from-cyan-500/30 hover:to-emerald-500/30"
                    : "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                )}
              >
                {betting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Placing bet...</>
                ) : (
                  <><Target className="w-4 h-4" /> Bet ${betAmount || "0"} on {betOutcome}</>
                )}
              </button>

              {/* Bet result */}
              {betResult && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="font-mono text-xs text-emerald-400 whitespace-pre-wrap">{betResult}</div>
                </div>
              )}
              {betError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="font-mono text-xs text-red-400">{betError}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
              <p className="font-mono text-xs text-gray-400">
                Connect your Bankr API key to place bets
              </p>
            </div>
          )}

          {/* External link */}
          <a
            href={market.polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            View on Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function PredictionsPage() {
  const { theme } = useTheme();

  // Data
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("volume");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal
  const [selectedMarket, setSelectedMarket] = useState<PredictionMarket | null>(null);

  // Bankr connection
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  // Betting
  const [betting, setBetting] = useState(false);
  const [betResult, setBetResult] = useState<string | null>(null);
  const [betError, setBetError] = useState<string | null>(null);

  // Positions
  const [positions, setPositions] = useState<string | null>(null);
  const [loadingPositions, setLoadingPositions] = useState(false);

  // Load API key
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(KEY_STORAGE) || "";
      if (saved) {
        setApiKey(saved);
        setConnected(true);
      }
    }
  }, []);

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort, limit: "50" });
      if (category) params.set("category", category);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/predictions?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setMarkets(json.markets);
      } else {
        setError(json.error || "Failed to fetch markets");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [category, sort, searchQuery]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Connect
  const handleConnect = () => {
    if (!apiKey.startsWith("bk_")) {
      setBetError("Invalid API key. Keys start with bk_");
      return;
    }
    localStorage.setItem(KEY_STORAGE, apiKey);
    setConnected(true);
    setShowConnect(false);
    setBetError(null);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey("");
    setConnected(false);
    setPositions(null);
  };

  // Place bet
  const handleBet = useCallback(async (outcome: string, amount: string) => {
    if (!apiKey || !selectedMarket) return;
    setBetting(true);
    setBetResult(null);
    setBetError(null);

    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          action: "bet",
          market: selectedMarket.question,
          outcome,
          amount,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setBetResult(json.response);
      } else {
        setBetError(json.error || "Bet failed");
      }
    } catch {
      setBetError("Network error");
    } finally {
      setBetting(false);
    }
  }, [apiKey, selectedMarket]);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    if (!apiKey) return;
    setLoadingPositions(true);
    setPositions(null);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, action: "positions" }),
      });
      const json = await res.json();
      if (json.success) {
        setPositions(json.response);
      } else {
        setPositions(`Error: ${json.error}`);
      }
    } catch {
      setPositions("Network error");
    } finally {
      setLoadingPositions(false);
    }
  }, [apiKey]);

  // Stats
  const totalVolume = markets.reduce((s, m) => s + m.volume, 0);
  const activeCount = markets.filter((m) => m.active).length;

  return (
    <BankrGate>
    <div className={clsx("min-h-screen transition-colors duration-300", theme === "dark" ? "bg-[#050810]" : "bg-gray-50")}>
      {/* Scanline */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)",
        }}
      />

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-6xl">
        {/* ─── HEADER ─── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-cyan-400" />
              <h1 className="font-mono text-xl font-bold text-white">
                Predict<span className="text-cyan-400">Markets</span>
              </h1>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">
                <span className="font-mono text-[10px] text-purple-400 font-medium">Powered by Polymarket</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchPositions}
                    disabled={loadingPositions}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all"
                  >
                    {loadingPositions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
                    Positions
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-mono text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConnect(!showConnect)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-[11px] text-cyan-400 hover:bg-cyan-500/20 transition-all"
                >
                  <Key className="w-3.5 h-3.5" /> Connect to Bet
                </button>
              )}
            </div>
          </div>
          <p className="font-mono text-xs text-gray-500">
            Prediction markets — bet on politics, crypto, sports & more via Polymarket
          </p>
        </div>

        {/* ─── API KEY CONNECT (inline) ─── */}
        {showConnect && !connected && (
          <div className="mb-4">
            <TerminalWindow title="bankr-connect">
              <div className="p-4">
                <div className="flex gap-2 max-w-md">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="bk_your_api_key_here"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                      className="w-full pl-9 pr-10 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={!apiKey.trim()}
                    className="px-4 py-2.5 rounded-lg font-mono text-xs bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all"
                  >
                    Connect
                  </button>
                </div>
                {betError && (
                  <p className="mt-2 font-mono text-xs text-red-400">{betError}</p>
                )}
              </div>
            </TerminalWindow>
          </div>
        )}

        {/* ─── POSITIONS ─── */}
        {positions && (
          <div className="mb-4">
            <TerminalWindow title="polymarket-positions">
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-gray-500 uppercase">Your Positions</span>
                  <button onClick={() => setPositions(null)} className="text-gray-600 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {positions}
                </div>
              </div>
            </TerminalWindow>
          </div>
        )}

        {/* ─── STATS BAR ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {([
            [Flame, "Active Markets", String(activeCount), "text-cyan-400"],
            [BarChart3, "Total Volume", `$${fmtCompact(totalVolume)}`, "text-emerald-400"],
            [Activity, "Markets Loaded", String(markets.length), "text-purple-400"],
            [TrendingUp, "Categories", String(CATEGORIES.length - 1), "text-yellow-400"],
          ] as [React.ElementType, string, string, string][]).map(([Icon, label, val, color]) => (
            <div
              key={label}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]"
            >
              <Icon className={clsx("w-4 h-4", color)} />
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
                <div className="text-sm font-mono text-white font-medium">{val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── FILTERS ─── */}
        <TerminalWindow title="market-filter — search & sort">
          <div className="p-4 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input
                type="text"
                placeholder='Search markets... "Bitcoin", "Trump", "Super Bowl"'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all"
              />
            </div>

            {/* Categories */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] border transition-all",
                      category === cat.id
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                        : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.1]"
                    )}
                  >
                    <Icon className="w-3 h-3" /> {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Sort + Refresh */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSort(opt.id)}
                    className={clsx(
                      "px-2.5 py-1 rounded-md font-mono text-[10px] border transition-all",
                      sort === opt.id
                        ? "bg-white/[0.06] border-white/[0.1] text-white"
                        : "bg-transparent border-transparent text-gray-600 hover:text-gray-400"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchMarkets}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] text-gray-500 hover:text-cyan-400 transition-all"
              >
                <RefreshCw className={clsx("w-3 h-3", loading && "animate-spin")} /> Refresh
              </button>
            </div>
          </div>
        </TerminalWindow>

        {/* ─── MARKETS GRID ─── */}
        <div className="mt-6">
          {loading && markets.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mr-3" />
              <span className="font-mono text-sm text-gray-400">Loading prediction markets...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400/60 mx-auto mb-3" />
              <p className="font-mono text-sm text-red-400">{error}</p>
              <button
                onClick={fetchMarkets}
                className="mt-3 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-xs text-cyan-400 hover:bg-cyan-500/20 transition-all"
              >
                Retry
              </button>
            </div>
          ) : markets.length === 0 ? (
            <div className="p-12 text-center">
              <Hash className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="font-mono text-sm text-gray-500">No markets found</p>
              <p className="font-mono text-[11px] text-gray-600 mt-1">Try a different search or category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {markets.map((m) => (
                <MarketCard
                  key={m.id}
                  market={m}
                  onClick={() => {
                    setSelectedMarket(m);
                    setBetResult(null);
                    setBetError(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ─── FOOTER INFO ─── */}
        <div className="mt-8 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
          <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" /> About Prediction Markets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "What are they?", desc: "Markets where you bet on future events. Price = probability." },
              { label: "How to bet?", desc: "Connect Bankr API key, choose an outcome, set amount, confirm." },
              { label: "Settlement", desc: "When event resolves, winning shares pay $1 each. Powered by Polymarket (Polygon)." },
            ].map((f) => (
              <div key={f.label} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                <div className="font-mono text-[11px] text-gray-300 font-medium">{f.label}</div>
                <div className="font-mono text-[10px] text-gray-600 mt-1 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── MARKET DETAIL MODAL ─── */}
      {selectedMarket && (
        <MarketDetailModal
          market={selectedMarket}
          onClose={() => setSelectedMarket(null)}
          onBet={handleBet}
          betting={betting}
          betResult={betResult}
          betError={betError}
          connected={connected}
        />
      )}
    </div>
    </BankrGate>
  );
}

