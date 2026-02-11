"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { BankrGate } from "@/components/bankr-gate";
import Link from "next/link";
import {
  ArrowDownUp, RefreshCw, Settings, ChevronDown, X, ExternalLink,
  Shield, Key, Eye, EyeOff, Zap, Activity, AlertTriangle,
  ArrowRight, Wallet, Check, Clock, TrendingUp, Trash2,
  Search, ChevronRight,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS & TYPES
// ═══════════════════════════════════════════════════════════════════════

const KEY_STORAGE = "bankr_api_key";
const TRADE_HISTORY_KEY = "bankr_trade_history";

interface Token {
  symbol: string;
  name: string;
  popular?: boolean;
}

interface TradeRecord {
  id: string;
  from: string;
  to: string;
  amount: string;
  chain: string;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  response?: string;
}

// Popular tokens on Base
const POPULAR_TOKENS: Token[] = [
  { symbol: "ETH", name: "Ethereum", popular: true },
  { symbol: "USDC", name: "USD Coin", popular: true },
  { symbol: "USDT", name: "Tether", popular: true },
  { symbol: "DAI", name: "Dai", popular: true },
  { symbol: "WETH", name: "Wrapped Ether", popular: true },
  { symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", popular: true },
  { symbol: "BNKR", name: "Bankr", popular: true },
  { symbol: "DEGEN", name: "Degen", popular: true },
  { symbol: "BRETT", name: "Brett", popular: true },
  { symbol: "TOSHI", name: "Toshi", popular: true },
  { symbol: "AERO", name: "Aerodrome", popular: true },
  { symbol: "HIGHER", name: "Higher", popular: true },
  { symbol: "CLAWDMINT", name: "Clawdmint", popular: true },
];

const CHAINS = [
  { id: "Base", label: "Base", color: "text-blue-400" },
  { id: "Ethereum", label: "Ethereum", color: "text-gray-300" },
  { id: "Polygon", label: "Polygon", color: "text-purple-400" },
  { id: "Solana", label: "Solana", color: "text-green-400" },
];

const SLIPPAGE_PRESETS = [0.5, 1, 2, 5];

// ═══════════════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════

function getSavedKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_STORAGE) || "";
}

function saveKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key);
}

function clearKey() {
  localStorage.removeItem(KEY_STORAGE);
}

function getTradeHistory(): TradeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TRADE_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function addTradeRecord(record: TradeRecord) {
  const history = getTradeHistory();
  history.unshift(record);
  // Keep last 50
  if (history.length > 50) history.length = 50;
  localStorage.setItem(TRADE_HISTORY_KEY, JSON.stringify(history));
}

function updateTradeRecord(id: string, update: Partial<TradeRecord>) {
  const history = getTradeHistory();
  const idx = history.findIndex((r) => r.id === id);
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...update };
    localStorage.setItem(TRADE_HISTORY_KEY, JSON.stringify(history));
  }
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
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TOKEN SELECTOR MODAL
// ═══════════════════════════════════════════════════════════════════════

function TokenSelector({
  open,
  onClose,
  onSelect,
  selectedSymbol,
  excludeSymbol,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  selectedSymbol: string;
  excludeSymbol: string;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const filtered = search.trim()
    ? POPULAR_TOKENS.filter(
        (t) =>
          t.symbol !== excludeSymbol &&
          (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
            t.name.toLowerCase().includes(search.toLowerCase()))
      )
    : POPULAR_TOKENS.filter((t) => t.symbol !== excludeSymbol);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-xl border border-cyan-500/20 bg-[#0a0d14] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/10">
          <span className="font-mono text-sm text-white font-medium">Select Token</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by name or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all"
            />
          </div>
        </div>

        {/* Popular quick select */}
        {!search.trim() && (
          <div className="px-4 py-3 border-b border-white/[0.04]">
            <div className="font-mono text-[10px] text-gray-600 uppercase mb-2">Popular</div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_TOKENS.filter((t) => t.popular && t.symbol !== excludeSymbol)
                .slice(0, 8)
                .map((t) => (
                  <button
                    key={t.symbol}
                    onClick={() => { onSelect(t); onClose(); }}
                    className={clsx(
                      "px-2.5 py-1.5 rounded-lg font-mono text-[11px] border transition-all",
                      t.symbol === selectedSymbol
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                        : "bg-white/[0.02] border-white/[0.06] text-gray-400 hover:text-white hover:border-white/[0.1]"
                    )}
                  >
                    {t.symbol}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Token list */}
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <span className="font-mono text-xs text-gray-600">
                {search.trim() ? (
                  <>No token found. You can type <span className="text-cyan-400">{search.toUpperCase()}</span> directly.</>
                ) : (
                  "No tokens available"
                )}
              </span>
              {search.trim() && (
                <button
                  onClick={() => {
                    onSelect({ symbol: search.toUpperCase().trim(), name: search.toUpperCase().trim() });
                    onClose();
                  }}
                  className="mt-3 block mx-auto px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-xs text-cyan-400 hover:bg-cyan-500/20 transition-all"
                >
                  Use &quot;{search.toUpperCase().trim()}&quot;
                </button>
              )}
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.symbol}
                onClick={() => { onSelect(t); onClose(); }}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-3 transition-all text-left",
                  t.symbol === selectedSymbol
                    ? "bg-cyan-500/[0.06]"
                    : "hover:bg-white/[0.03]"
                )}
              >
                {/* Token icon placeholder */}
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                  <span className="font-mono text-[10px] text-cyan-400 font-bold">
                    {t.symbol.slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-medium text-white">{t.symbol}</div>
                  <div className="font-mono text-[10px] text-gray-600 truncate">{t.name}</div>
                </div>
                {t.symbol === selectedSymbol && (
                  <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════════════

function SettingsPanel({
  slippage,
  setSlippage,
  chain,
  setChain,
  onClose,
}: {
  slippage: number;
  setSlippage: (v: number) => void;
  chain: string;
  setChain: (v: string) => void;
  onClose: () => void;
}) {
  const [customSlippage, setCustomSlippage] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-xl border border-cyan-500/20 bg-[#0a0d14] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/10">
          <span className="font-mono text-sm text-white font-medium flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" /> Trade Settings
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Slippage */}
          <div>
            <div className="font-mono text-[11px] text-gray-400 uppercase tracking-wider mb-3">
              Max Slippage Tolerance
            </div>
            <div className="flex gap-2 mb-3">
              {SLIPPAGE_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => { setSlippage(v); setCustomSlippage(""); }}
                  className={clsx(
                    "flex-1 py-2 rounded-lg font-mono text-xs border transition-all",
                    slippage === v && !customSlippage
                      ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                      : "bg-white/[0.02] border-white/[0.06] text-gray-400 hover:border-white/[0.1]"
                  )}
                >
                  {v}%
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                placeholder="Custom"
                value={customSlippage}
                onChange={(e) => {
                  setCustomSlippage(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0 && val <= 50) setSlippage(val);
                }}
                className="w-full px-4 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-gray-600">%</span>
            </div>
            {slippage > 5 && (
              <div className="mt-2 flex items-center gap-1.5 text-yellow-500/80">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-mono text-[10px]">High slippage — you may receive significantly less</span>
              </div>
            )}
          </div>

          {/* Chain */}
          <div>
            <div className="font-mono text-[11px] text-gray-400 uppercase tracking-wider mb-3">
              Network
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CHAINS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setChain(c.id)}
                  className={clsx(
                    "py-2.5 rounded-lg font-mono text-xs border transition-all",
                    chain === c.id
                      ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                      : "bg-white/[0.02] border-white/[0.06] text-gray-400 hover:border-white/[0.1]"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TRADE HISTORY
// ═══════════════════════════════════════════════════════════════════════

function TradeHistory({ history }: { history: TradeRecord[] }) {
  if (history.length === 0) return null;

  return (
    <TerminalWindow title="trade-history — recent swaps">
      <div className="divide-y divide-white/[0.04]">
        {history.slice(0, 10).map((trade) => (
          <div key={trade.id} className="flex items-center gap-3 px-4 py-3">
            <div className={clsx(
              "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
              trade.status === "completed" ? "bg-emerald-500/10" : trade.status === "failed" ? "bg-red-500/10" : "bg-yellow-500/10"
            )}>
              {trade.status === "completed" ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : trade.status === "failed" ? (
                <X className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-white">
                {trade.amount} <span className="text-cyan-400">{trade.from}</span>
                <ArrowRight className="w-3 h-3 inline mx-1 text-gray-600" />
                <span className="text-emerald-400">{trade.to}</span>
              </div>
              <div className="font-mono text-[10px] text-gray-600">
                {new Date(trade.timestamp).toLocaleString()} · {trade.chain}
              </div>
            </div>
            <span className={clsx(
              "font-mono text-[10px] px-2 py-0.5 rounded-md border",
              trade.status === "completed"
                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                : trade.status === "failed"
                  ? "text-red-400 border-red-500/20 bg-red-500/10"
                  : "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
            )}>
              {trade.status}
            </span>
          </div>
        ))}
      </div>
    </TerminalWindow>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function TradePage() {
  const { theme } = useTheme();

  // API Key
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);

  // Swap state
  const [fromToken, setFromToken] = useState<Token>({ symbol: "ETH", name: "Ethereum" });
  const [toToken, setToToken] = useState<Token>({ symbol: "USDC", name: "USD Coin" });
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(1);
  const [chain, setChain] = useState("Base");

  // UI state
  const [selectingSide, setSelectingSide] = useState<"from" | "to" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [confirmSwap, setConfirmSwap] = useState(false);

  // Load saved state
  useEffect(() => {
    const saved = getSavedKey();
    if (saved) {
      setApiKey(saved);
      setConnected(true);
    }
    setTradeHistory(getTradeHistory());
  }, []);

  const handleConnect = () => {
    if (!apiKey.startsWith("bk_")) {
      setError("Invalid API key. Bankr keys start with bk_");
      return;
    }
    saveKey(apiKey);
    setConnected(true);
    setError(null);
  };

  const handleDisconnect = () => {
    clearKey();
    setApiKey("");
    setConnected(false);
    setResponse(null);
    setError(null);
  };

  const flipTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setResponse(null);
    setError(null);
  };

  const handleQuote = useCallback(async () => {
    if (!apiKey || !amount || !fromToken.symbol || !toToken.symbol) return;
    setQuoting(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          action: "quote",
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amount,
          chain,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResponse(json.response);
      } else {
        setError(json.error || "Failed to get quote");
      }
    } catch {
      setError("Network error");
    } finally {
      setQuoting(false);
    }
  }, [apiKey, amount, fromToken.symbol, toToken.symbol, chain]);

  const handleSwap = useCallback(async () => {
    if (!apiKey || !amount || !fromToken.symbol || !toToken.symbol) return;

    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: TradeRecord = {
      id: tradeId,
      from: fromToken.symbol,
      to: toToken.symbol,
      amount,
      chain,
      timestamp: Date.now(),
      status: "pending",
    };

    addTradeRecord(record);
    setTradeHistory(getTradeHistory());
    setLoading(true);
    setError(null);
    setResponse(null);
    setConfirmSwap(false);

    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          action: "swap",
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amount,
          chain,
          slippage,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResponse(json.response);
        updateTradeRecord(tradeId, { status: "completed", response: json.response });
      } else {
        setError(json.error || "Swap failed");
        updateTradeRecord(tradeId, { status: "failed", response: json.error });
      }
    } catch {
      setError("Network error");
      updateTradeRecord(tradeId, { status: "failed", response: "Network error" });
    } finally {
      setLoading(false);
      setTradeHistory(getTradeHistory());
    }
  }, [apiKey, amount, fromToken.symbol, toToken.symbol, chain, slippage]);

  const canTrade = connected && amount && parseFloat(amount) > 0 && fromToken.symbol !== toToken.symbol;

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

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-lg">
        {/* ─── HEADER ─── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <ArrowDownUp className="w-5 h-5 text-cyan-400" />
              <h1 className="font-mono text-xl font-bold text-white">
                Trade<span className="text-cyan-400">Terminal</span>
              </h1>
              {connected && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-emerald-400 font-medium">CONNECTED</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/screener"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all"
              >
                <Activity className="w-3.5 h-3.5" /> Screener
              </Link>
            </div>
          </div>
          <p className="font-mono text-xs text-gray-500">
            Swap tokens on Base, Ethereum, Polygon & Solana via Bankr Agent
          </p>
        </div>

        {/* ─── API KEY CONNECTION ─── */}
        {!connected ? (
          <TerminalWindow title="bankr-connect — api key setup">
            <div className="p-6">
              <div className="max-w-md mx-auto">
                <div className="mb-6 p-4 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/10">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-mono text-xs text-cyan-400 font-medium mb-1">Secure Connection</p>
                      <p className="font-mono text-[11px] text-gray-400 leading-relaxed">
                        Your API key is stored locally and never sent to our servers.
                        Trades are executed directly through the Bankr Agent API.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block font-mono text-[11px] text-gray-500 uppercase tracking-wider mb-2">
                      Bankr API Key
                    </label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input
                        type={showKey ? "text" : "password"}
                        placeholder="bk_your_api_key_here"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                        className="w-full pl-10 pr-12 py-3 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.05] transition-all"
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={!apiKey.trim()}
                    className={clsx(
                      "w-full py-3 rounded-lg font-mono text-xs font-medium transition-all flex items-center justify-center gap-2",
                      apiKey.trim()
                        ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30"
                        : "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" /> Connect to Trade
                  </button>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="font-mono text-xs text-red-400">{error}</p>
                    </div>
                  )}

                  <div className="text-center">
                    <a
                      href="https://bankr.bot/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-gray-500 hover:text-cyan-400 transition-colors inline-flex items-center gap-1"
                    >
                      Get an API key at bankr.bot/api <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </TerminalWindow>
        ) : (
          <>
            {/* ─── CONNECTION BAR ─── */}
            <div className="mb-4 flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[11px] text-gray-400">
                  {apiKey.slice(0, 6)}...{apiKey.slice(-4)}
                </span>
                <span className="font-mono text-[10px] text-gray-600">·</span>
                <span className="font-mono text-[10px] text-blue-400">{chain}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md font-mono text-[10px] text-gray-500 hover:text-cyan-400 hover:bg-white/[0.03] transition-all"
                >
                  <Settings className="w-3 h-3" /> {slippage}%
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1 px-2 py-1 rounded-md font-mono text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* ─── SWAP CARD ─── */}
            <TerminalWindow title="swap-terminal — execute trades">
              <div className="p-5 space-y-1">
                {/* FROM */}
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] text-gray-500 uppercase">You Pay</span>
                    <span className="font-mono text-[10px] text-gray-600">
                      {chain} Network
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setResponse(null); }}
                      className="flex-1 bg-transparent font-mono text-2xl text-white placeholder-gray-700 focus:outline-none min-w-0"
                      step="any"
                    />
                    <button
                      onClick={() => setSelectingSide("from")}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all shrink-0"
                    >
                      <div className="w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <span className="font-mono text-[9px] text-cyan-400 font-bold">{fromToken.symbol.slice(0, 2)}</span>
                      </div>
                      <span className="font-mono text-sm font-medium text-white">{fromToken.symbol}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* FLIP BUTTON */}
                <div className="flex justify-center -my-2.5 relative z-10">
                  <button
                    onClick={flipTokens}
                    className="w-10 h-10 rounded-xl bg-[#0a0d14] border-2 border-white/[0.08] flex items-center justify-center hover:border-cyan-500/30 hover:bg-cyan-500/[0.05] transition-all group"
                  >
                    <ArrowDownUp className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors" />
                  </button>
                </div>

                {/* TO */}
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] text-gray-500 uppercase">You Receive</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 font-mono text-2xl text-gray-600 min-w-0">
                      {response ? (
                        <span className="text-emerald-400 text-lg">{response.slice(0, 60)}...</span>
                      ) : (
                        "—"
                      )}
                    </div>
                    <button
                      onClick={() => setSelectingSide("to")}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all shrink-0"
                    >
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <span className="font-mono text-[9px] text-emerald-400 font-bold">{toToken.symbol.slice(0, 2)}</span>
                      </div>
                      <span className="font-mono text-sm font-medium text-white">{toToken.symbol}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>
                </div>

                {/* INFO ROW */}
                <div className="pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-gray-600">
                      Slippage: <span className="text-gray-400">{slippage}%</span>
                    </span>
                    <span className="font-mono text-[10px] text-gray-600">
                      Network: <span className="text-blue-400">{chain}</span>
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="font-mono text-[10px] text-gray-600 hover:text-cyan-400 transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                </div>

                {/* QUOTE BUTTON */}
                {canTrade && !response && (
                  <button
                    onClick={handleQuote}
                    disabled={quoting}
                    className="w-full mt-3 py-3 rounded-xl font-mono text-xs font-medium transition-all flex items-center justify-center gap-2 bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.08] hover:text-white"
                  >
                    {quoting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Getting quote...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-3.5 h-3.5" /> Get Quote
                      </>
                    )}
                  </button>
                )}

                {/* SWAP BUTTON */}
                {!confirmSwap ? (
                  <button
                    onClick={() => setConfirmSwap(true)}
                    disabled={!canTrade || loading || quoting}
                    className={clsx(
                      "w-full mt-2 py-4 rounded-xl font-mono text-sm font-bold transition-all flex items-center justify-center gap-2",
                      canTrade && !loading && !quoting
                        ? "bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400 hover:from-cyan-500/30 hover:to-emerald-500/30"
                        : "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                    )}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Executing swap...
                      </>
                    ) : (
                      <>
                        <ArrowDownUp className="w-4 h-4" /> Swap {fromToken.symbol} → {toToken.symbol}
                      </>
                    )}
                  </button>
                ) : (
                  /* CONFIRM STEP */
                  <div className="mt-2 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      <span className="font-mono text-xs text-yellow-400 font-medium">Confirm Trade</span>
                    </div>
                    <div className="font-mono text-xs text-gray-300">
                      Swap <span className="text-white font-medium">{amount} {fromToken.symbol}</span> to{" "}
                      <span className="text-emerald-400 font-medium">{toToken.symbol}</span> on{" "}
                      <span className="text-blue-400">{chain}</span> with {slippage}% slippage
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSwap}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-lg font-mono text-xs font-medium bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        {loading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        {loading ? "Executing..." : "Confirm Swap"}
                      </button>
                      <button
                        onClick={() => setConfirmSwap(false)}
                        className="px-4 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:text-white transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </TerminalWindow>

            {/* ─── RESPONSE ─── */}
            {(response || error) && !loading && (
              <div className="mt-4">
                <TerminalWindow title="bankr-agent — trade result">
                  <div className="p-5">
                    {error && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
                        <div className="flex gap-2">
                          <span className="text-red-400 shrink-0">!</span>
                          <span className="font-mono text-xs text-red-400">{error}</span>
                        </div>
                        {error.toLowerCase().includes("agent api") && (
                          <div className="mt-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                            <p className="font-mono text-[11px] text-gray-400 mb-2">To fix this:</p>
                            <ol className="list-decimal list-inside font-mono text-[11px] text-gray-400 space-y-1">
                              <li>
                                Go to{" "}
                                <a
                                  href="https://bankr.bot/api"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:underline"
                                >
                                  bankr.bot/api
                                </a>
                              </li>
                              <li>Select your API key</li>
                              <li>Enable <span className="text-white font-medium">&quot;Agent API&quot;</span> access</li>
                              <li>Come back and try again</li>
                            </ol>
                          </div>
                        )}
                      </div>
                    )}

                    {response && (
                      <div className="space-y-1">
                        <div className="flex gap-2">
                          <span className="text-gray-500 shrink-0">$</span>
                          <span className="font-mono text-[11px] text-gray-500">trade_response:</span>
                        </div>
                        <div className="mt-2 p-4 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                          <div className="font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {response}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TerminalWindow>
              </div>
            )}

            {/* ─── TRADE HISTORY ─── */}
            <div className="mt-6">
              <TradeHistory history={tradeHistory} />
            </div>

            {/* ─── FEATURES INFO ─── */}
            <div className="mt-6 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
              <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" /> Powered by Bankr
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Multi-chain", desc: "Base, ETH, Polygon, Solana" },
                  { label: "Gas Sponsored", desc: "Free gas on Base" },
                  { label: "Best Routes", desc: "Optimal routing via DEXs" },
                  { label: "Secure", desc: "Non-custodial, agent-based" },
                ].map((f) => (
                  <div key={f.label} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                    <div className="font-mono text-[11px] text-gray-300 font-medium">{f.label}</div>
                    <div className="font-mono text-[10px] text-gray-600">{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── MODALS ─── */}
      <TokenSelector
        open={selectingSide !== null}
        onClose={() => setSelectingSide(null)}
        onSelect={(t) => {
          if (selectingSide === "from") setFromToken(t);
          else setToToken(t);
          setResponse(null);
        }}
        selectedSymbol={selectingSide === "from" ? fromToken.symbol : toToken.symbol}
        excludeSymbol={selectingSide === "from" ? toToken.symbol : fromToken.symbol}
      />

      {showSettings && (
        <SettingsPanel
          slippage={slippage}
          setSlippage={setSlippage}
          chain={chain}
          setChain={setChain}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
    </BankrGate>
  );
}
