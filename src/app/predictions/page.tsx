"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { fetchWithRetry, getErrorMessage } from "@/lib/fetch-retry";
import {
  Search, RefreshCw, ExternalLink, X, TrendingUp, TrendingDown,
  Activity, Zap, Clock, Star, BarChart3, ChevronDown,
  Shield, Key, Eye, EyeOff, Trash2, AlertTriangle,
  DollarSign, Check, Target, Wallet, Hash, Globe,
  Award, Flame, ArrowRight, Loader2, Copy, CheckCircle,
  ArrowUpRight, ArrowDownRight, Minus, Filter,
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

function getTimeColor(endDate: string): string {
  if (!endDate) return "text-gray-500";
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return "text-red-500";
  if (diff < 86_400_000) return "text-red-400";
  if (diff < 86_400_000 * 7) return "text-yellow-400";
  return "text-gray-500";
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
  { id: "competitive", label: "Most Competitive" },
  { id: "newest", label: "Newest" },
  { id: "ending", label: "Ending Soon" },
];

// ═══════════════════════════════════════════════════════════════════════
// TERMINAL WINDOW
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

function ProbabilityBar({ outcomes, prices, size = "sm" }: { outcomes: string[]; prices: number[]; size?: "sm" | "lg" }) {
  if (outcomes.length < 2 || prices.length < 2) return null;
  const yesPrice = prices[0];
  const noPrice = prices[1];
  const barH = size === "lg" ? "h-3" : "h-2";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={clsx("font-mono font-medium text-emerald-400", size === "lg" ? "text-xs" : "text-[11px]")}>{outcomes[0]}</span>
          <span className={clsx("font-mono font-bold text-emerald-400", size === "lg" ? "text-sm" : "text-xs")}>{fmtPct(yesPrice)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={clsx("font-mono font-bold text-red-400", size === "lg" ? "text-sm" : "text-xs")}>{fmtPct(noPrice)}</span>
          <span className={clsx("font-mono font-medium text-red-400", size === "lg" ? "text-xs" : "text-[11px]")}>{outcomes[1]}</span>
        </div>
      </div>
      <div className={clsx(barH, "rounded-full bg-white/[0.05] overflow-hidden flex")}>
        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full transition-all duration-700" style={{ width: `${yesPrice * 100}%` }} />
        <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-r-full transition-all duration-700" style={{ width: `${noPrice * 100}%` }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TREND INDICATOR
// ═══════════════════════════════════════════════════════════════════════

function TrendIndicator({ change }: { change: number }) {
  if (Math.abs(change) < 0.001) return <Minus className="w-3 h-3 text-gray-600" />;
  if (change > 0) return <ArrowUpRight className="w-3 h-3 text-emerald-400" />;
  return <ArrowDownRight className="w-3 h-3 text-red-400" />;
}

// ═══════════════════════════════════════════════════════════════════════
// MARKET CARD
// ═══════════════════════════════════════════════════════════════════════

function MarketCard({ market, onClick }: { market: PredictionMarket; onClick: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const timeColor = getTimeColor(market.endDate);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-cyan-500/15 transition-all p-4 space-y-3 relative overflow-hidden"
    >
      {market.featured && (
        <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
          <div className="absolute top-2 right-[-20px] w-[80px] bg-gradient-to-r from-yellow-500/80 to-amber-500/80 text-center text-[8px] font-bold text-black rotate-45 py-0.5">HOT</div>
        </div>
      )}
      <div className="flex items-start gap-3">
        {market.image && !imgErr ? (
          <img src={market.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/[0.06] shrink-0" onError={() => setImgErr(true)} />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Hash className="w-4 h-4 text-cyan-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-xs font-medium text-white leading-relaxed line-clamp-2 group-hover:text-cyan-400 transition-colors">
            {market.question}
          </h3>
          {market.category && (
            <span className="font-mono text-[9px] text-gray-600 uppercase mt-0.5">{market.category}</span>
          )}
        </div>
      </div>

      <ProbabilityBar outcomes={market.outcomes} prices={market.outcomePrices} />

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-gray-600 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> ${fmtCompact(market.volume)}
          </span>
          <span className={clsx("font-mono text-[10px] flex items-center gap-1", timeColor)}>
            <Clock className="w-3 h-3" /> {fmtTimeLeft(market.endDate)}
          </span>
          {market.oneDayPriceChange !== 0 && (
            <span className="flex items-center">
              <TrendIndicator change={market.oneDayPriceChange} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {market.isNew && (
            <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 font-mono text-[9px] text-cyan-400">NEW</span>
          )}
          {market.liquidity > 100000 && (
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 font-mono text-[9px] text-emerald-400">DEEP</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// JOB POLLING HOOK
// ═══════════════════════════════════════════════════════════════════════

function useJobPoll() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startPoll = useCallback((apiKey: string, jobId: string) => {
    setPolling(true);
    setResult(null);
    setError(null);
    let attempts = 0;

    intervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setPolling(false);
        setError("Request timed out. Please try again.");
        return;
      }

      try {
        const res = await fetch("/api/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "poll", apiKey, jobId }),
        });
        const data = await res.json();

        if (data.status === "completed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPolling(false);
          setResult(data.response);
        } else if (data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPolling(false);
          setError(data.error || "Request failed");
        }
      } catch {
        // Network error — keep polling
      }
    }, 2500);
  }, []);

  const cancel = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPolling(false);
  }, []);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return { polling, result, error, startPoll, cancel, setResult, setError };
}

// ═══════════════════════════════════════════════════════════════════════
// MARKET DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════

function MarketDetailModal({
  market,
  onClose,
  connected,
  apiKey,
}: {
  market: PredictionMarket;
  onClose: () => void;
  connected: boolean;
  apiKey: string;
}) {
  const [betOutcome, setBetOutcome] = useState<string>(market.outcomes[0] || "Yes");
  const [betAmount, setBetAmount] = useState("");
  const [imgErr, setImgErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const bet = useJobPoll();

  const handleBet = async () => {
    if (!apiKey || !betAmount || parseFloat(betAmount) <= 0) return;
    bet.setResult(null);
    bet.setError(null);

    try {
      const res = await fetchWithRetry("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey, action: "bet",
          market: market.question, outcome: betOutcome, amount: betAmount,
        }),
      }, { retries: 1, timeoutMs: 20000 });
      const data = await res.json();
      if (data.success && data.jobId) {
        bet.startPoll(apiKey, data.jobId);
      } else {
        bet.setError(data.error || "Failed to submit bet");
      }
    } catch (e: unknown) {
      bet.setError(getErrorMessage(e));
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(market.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedIdx = market.outcomes.indexOf(betOutcome);
  const selectedPrice = market.outcomePrices[selectedIdx] || 0.5;
  const amt = parseFloat(betAmount) || 0;
  const payout = amt > 0 ? amt / selectedPrice : 0;
  const profit = payout - amt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-cyan-500/20 bg-[#0a0d14]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 bg-[#0a0d14]">
          <span className="font-mono text-[10px] text-cyan-500/60 uppercase">Market Detail</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Question */}
          <div className="flex items-start gap-3">
            {market.image && !imgErr ? (
              <img src={market.image} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/[0.06] shrink-0" onError={() => setImgErr(true)} />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <Hash className="w-5 h-5 text-cyan-400" />
              </div>
            )}
            <div>
              <h2 className="font-mono text-sm font-bold text-white leading-relaxed">{market.question}</h2>
              <div className="flex items-center gap-2 mt-1">
                {market.category && <span className="font-mono text-[10px] text-gray-500 uppercase">{market.category}</span>}
                <button onClick={handleCopyId} className="font-mono text-[9px] text-gray-600 hover:text-gray-400 flex items-center gap-0.5 transition-colors">
                  {copied ? <CheckCircle className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                  ID
                </button>
              </div>
            </div>
          </div>

          <ProbabilityBar outcomes={market.outcomes} prices={market.outcomePrices} size="lg" />

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

          {/* 24h Trend */}
          {market.oneDayPriceChange !== 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <TrendIndicator change={market.oneDayPriceChange} />
              <span className="font-mono text-[10px] text-gray-500">24H Change</span>
              <span className={clsx("font-mono text-xs font-medium ml-auto", market.oneDayPriceChange > 0 ? "text-emerald-400" : "text-red-400")}>
                {market.oneDayPriceChange > 0 ? "+" : ""}{(market.oneDayPriceChange * 100).toFixed(2)}%
              </span>
            </div>
          )}

          {/* Description */}
          {market.description && (
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="font-mono text-[10px] text-gray-500 uppercase mb-1.5">Description</div>
              <p className="font-mono text-[11px] text-gray-400 leading-relaxed line-clamp-6">{market.description}</p>
            </div>
          )}

          {/* Bet Section */}
          {connected ? (
            <div className="space-y-3">
              <div className="font-mono text-[10px] text-gray-500 uppercase">Place a Bet</div>

              <div className="flex gap-2">
                {market.outcomes.map((outcome, idx) => (
                  <button
                    key={outcome}
                    onClick={() => setBetOutcome(outcome)}
                    className={clsx(
                      "flex-1 py-2.5 rounded-lg font-mono text-xs font-medium border transition-all",
                      betOutcome === outcome
                        ? idx === 0 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-red-500/15 border-red-500/30 text-red-400"
                        : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.1]"
                    )}
                  >
                    {outcome} ({fmtPct(market.outcomePrices[idx] ?? 0.5)})
                  </button>
                ))}
              </div>

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

              <div className="flex gap-2">
                {["5", "10", "25", "50", "100"].map((a) => (
                  <button
                    key={a}
                    onClick={() => setBetAmount(a)}
                    className={clsx(
                      "flex-1 py-1.5 rounded-lg font-mono text-[10px] border transition-all",
                      betAmount === a ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.1]"
                    )}
                  >
                    ${a}
                  </button>
                ))}
              </div>

              {amt > 0 && (
                <div className="p-3 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/10 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[11px] text-gray-400">Potential Payout</span>
                    <span className="font-mono text-sm font-bold text-cyan-400">${payout.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] text-gray-500">Potential Profit</span>
                    <span className="font-mono text-xs text-emerald-400">+${profit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] text-gray-500">Return</span>
                    <span className="font-mono text-xs text-purple-400">{amt > 0 ? ((profit / amt) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleBet}
                disabled={bet.polling || !betAmount || amt <= 0}
                className={clsx(
                  "w-full py-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2",
                  !bet.polling && amt > 0
                    ? "bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400 hover:from-cyan-500/30 hover:to-emerald-500/30"
                    : "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                )}
              >
                {bet.polling ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing bet...</>
                ) : (
                  <><Target className="w-4 h-4" /> Bet ${betAmount || "0"} on {betOutcome}</>
                )}
              </button>

              {bet.polling && (
                <div className="p-3 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/10">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span className="font-mono text-[11px] text-cyan-400">Processing on Polymarket via Bankr...</span>
                  </div>
                  <button onClick={bet.cancel} className="mt-2 font-mono text-[10px] text-gray-500 hover:text-red-400 transition-colors">
                    Cancel
                  </button>
                </div>
              )}

              {bet.result && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono text-[10px] text-emerald-400 uppercase font-bold">Success</span>
                  </div>
                  <div className="font-mono text-xs text-emerald-300 whitespace-pre-wrap">{bet.result}</div>
                </div>
              )}
              {bet.error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="font-mono text-[10px] text-red-400 uppercase font-bold">Error</span>
                  </div>
                  <div className="font-mono text-xs text-red-300">{bet.error}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05] text-center">
              <Key className="w-5 h-5 text-gray-600 mx-auto mb-2" />
              <p className="font-mono text-xs text-gray-400">Connect your Bankr API key to place bets</p>
            </div>
          )}

          <a href={market.polymarketUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all">
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

  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("volume");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedMarket, setSelectedMarket] = useState<PredictionMarket | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const positions = useJobPoll();
  const balance = useJobPoll();

  // Load API key
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(KEY_STORAGE) || "";
      if (saved) { setApiKey(saved); setConnected(true); }
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort, limit: "100" });
      if (category) params.set("category", category);
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());

      const res = await fetchWithRetry(`/api/predictions?${params}`, {}, { retries: 2, timeoutMs: 25000 });
      const json = await res.json();

      if (json.success) {
        setMarkets(json.markets);
      } else {
        setError(json.error || "Failed to fetch markets");
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [category, sort, debouncedSearch]);

  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  // Auto-refresh every 90s
  useEffect(() => {
    const iv = setInterval(fetchMarkets, 90_000);
    return () => clearInterval(iv);
  }, [fetchMarkets]);

  // Connect
  const handleConnect = () => {
    if (!apiKey.startsWith("bk_")) {
      setKeyError("Invalid API key. Keys start with bk_");
      return;
    }
    localStorage.setItem(KEY_STORAGE, apiKey);
    setConnected(true);
    setShowConnect(false);
    setKeyError(null);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey("");
    setConnected(false);
    positions.setResult(null);
    balance.setResult(null);
  };

  // Fetch positions / balance
  const submitAction = useCallback(async (action: string, hook: ReturnType<typeof useJobPoll>) => {
    if (!apiKey) return;
    hook.setResult(null);
    hook.setError(null);

    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, action }),
      });
      const data = await res.json();
      if (data.success && data.jobId) {
        hook.startPoll(apiKey, data.jobId);
      } else {
        hook.setError(data.error || "Request failed");
      }
    } catch (e: unknown) {
      hook.setError(getErrorMessage(e));
    }
  }, [apiKey]);

  // Stats
  const totalVolume = markets.reduce((s, m) => s + m.volume, 0);
  const activeCount = markets.filter((m) => m.active).length;
  const avgLiquidity = markets.length > 0 ? markets.reduce((s, m) => s + m.liquidity, 0) / markets.length : 0;

  return (
    <div className={clsx("min-h-screen transition-colors duration-300", theme === "dark" ? "bg-[#050810]" : "bg-gray-50")}>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)" }} />

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-6xl">
        {/* ─── HEADER ─── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-cyan-400" />
              <h1 className="font-mono text-xl font-bold text-white">Predict<span className="text-cyan-400">Markets</span></h1>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">
                <span className="font-mono text-[10px] text-purple-400 font-medium">Powered by Polymarket</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => submitAction("balance", balance)} disabled={balance.polling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
                    {balance.polling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />} Balance
                  </button>
                  <button onClick={() => submitAction("positions", positions)} disabled={positions.polling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
                    {positions.polling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />} Positions
                  </button>
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                    <span className="font-mono text-[10px] text-emerald-400">Connected</span>
                  </div>
                  <button onClick={handleDisconnect}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-mono text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowConnect(!showConnect)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-[11px] text-cyan-400 hover:bg-cyan-500/20 transition-all">
                  <Key className="w-3.5 h-3.5" /> Connect to Bet
                </button>
              )}
            </div>
          </div>
          <p className="font-mono text-xs text-gray-500">Real-time prediction markets — bet on politics, crypto, sports & more via Polymarket</p>
        </div>

        {/* ─── API KEY CONNECT ─── */}
        {showConnect && !connected && (
          <div className="mb-4">
            <TerminalWindow title="bankr-connect">
              <div className="p-4 space-y-3">
                <div className="flex gap-2 max-w-md">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type={showKey ? "text" : "password"} placeholder="bk_your_api_key_here" value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                      className="w-full pl-9 pr-10 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all" />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button onClick={handleConnect} disabled={!apiKey.trim()}
                    className="px-4 py-2.5 rounded-lg font-mono text-xs bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all">
                    Connect
                  </button>
                </div>
                <p className="font-mono text-[10px] text-gray-600">Get your API key at <a href="https://bankr.bot/api" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-400">bankr.bot/api</a></p>
                {keyError && <p className="font-mono text-xs text-red-400">{keyError}</p>}
              </div>
            </TerminalWindow>
          </div>
        )}

        {/* ─── BALANCE ─── */}
        {(balance.result || balance.error || balance.polling) && (
          <div className="mb-4">
            <TerminalWindow title="wallet-balance">
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-gray-500 uppercase">Wallet Balance</span>
                  <button onClick={() => { balance.setResult(null); balance.setError(null); balance.cancel(); }} className="text-gray-600 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {balance.polling && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span className="font-mono text-xs text-gray-400">Fetching balance...</span>
                  </div>
                )}
                {balance.result && <div className="font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{balance.result}</div>}
                {balance.error && <div className="font-mono text-xs text-red-400">{balance.error}</div>}
              </div>
            </TerminalWindow>
          </div>
        )}

        {/* ─── POSITIONS ─── */}
        {(positions.result || positions.error || positions.polling) && (
          <div className="mb-4">
            <TerminalWindow title="polymarket-positions">
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-gray-500 uppercase">Your Positions</span>
                  <button onClick={() => { positions.setResult(null); positions.setError(null); positions.cancel(); }} className="text-gray-600 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {positions.polling && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span className="font-mono text-xs text-gray-400">Fetching positions...</span>
                  </div>
                )}
                {positions.result && <div className="font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{positions.result}</div>}
                {positions.error && <div className="font-mono text-xs text-red-400">{positions.error}</div>}
              </div>
            </TerminalWindow>
          </div>
        )}

        {/* ─── STATS BAR ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {([
            [Flame, "Active Markets", String(activeCount), "text-cyan-400"],
            [BarChart3, "Total Volume", `$${fmtCompact(totalVolume)}`, "text-emerald-400"],
            [Activity, "Avg Liquidity", `$${fmtCompact(avgLiquidity)}`, "text-purple-400"],
            [TrendingUp, "Categories", String(CATEGORIES.length - 1), "text-yellow-400"],
          ] as [React.ElementType, string, string, string][]).map(([Icon, label, val, color]) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <input type="text" placeholder='Search markets... "Bitcoin", "Trump", "Super Bowl"' value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button key={cat.id} onClick={() => setCategory(cat.id)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] border transition-all",
                      category === cat.id ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.1]"
                    )}>
                    <Icon className="w-3 h-3" /> {cat.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {SORT_OPTIONS.map((opt) => (
                  <button key={opt.id} onClick={() => setSort(opt.id)}
                    className={clsx(
                      "px-2.5 py-1 rounded-md font-mono text-[10px] border transition-all whitespace-nowrap",
                      sort === opt.id ? "bg-white/[0.06] border-white/[0.1] text-white" : "bg-transparent border-transparent text-gray-600 hover:text-gray-400"
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <button onClick={fetchMarkets} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] text-gray-500 hover:text-cyan-400 transition-all shrink-0">
                <RefreshCw className={clsx("w-3 h-3", loading && "animate-spin")} /> Refresh
              </button>
            </div>
          </div>
        </TerminalWindow>

        {/* ─── MARKETS GRID ─── */}
        <div className="mt-6">
          {loading && markets.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin mr-3" />
              <span className="font-mono text-sm text-gray-400">Loading prediction markets...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-red-400/60 mx-auto mb-3" />
              <p className="font-mono text-sm text-red-400">{error}</p>
              <button onClick={fetchMarkets}
                className="mt-3 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-xs text-cyan-400 hover:bg-cyan-500/20 transition-all">
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
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] text-gray-600">{markets.length} markets</span>
                {loading && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {markets.map((m) => (
                  <MarketCard key={m.id} market={m} onClick={() => setSelectedMarket(m)} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ─── FOOTER INFO ─── */}
        <div className="mt-8 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
          <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" /> About Prediction Markets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "What are they?", desc: "Markets where you bet on future events. Price = probability. If you buy 'Yes' at $0.40 and it resolves 'Yes', you get $1 per share." },
              { label: "How to bet?", desc: "Connect your Bankr API key, select a market, choose an outcome, set your amount, and confirm. Bets are placed on Polymarket via Bankr." },
              { label: "Settlement", desc: "When an event resolves, winning shares pay $1 each. Powered by Polymarket on Polygon. Claim winnings anytime after resolution." },
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
          connected={connected}
          apiKey={apiKey}
        />
      )}
    </div>
  );
}
