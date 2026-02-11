"use client";

import { useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { BankrGate } from "@/components/bankr-gate";
import Link from "next/link";
import {
  Repeat, TrendingUp, TrendingDown, ShieldCheck, Clock,
  Plus, Trash2, RefreshCw, Settings, ChevronDown, X,
  ExternalLink, Key, Eye, EyeOff, Zap, Activity,
  AlertTriangle, ArrowRight, Wallet, Check, DollarSign,
  Target, ArrowUpDown, Layers, Play, Pause, Search,
  ChevronRight, BarChart3, Shield, Timer, Sparkles,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const KEY_STORAGE = "bankr_api_key";

const POPULAR_TOKENS = [
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "BNKR", name: "Bankr" },
  { symbol: "DEGEN", name: "Degen" },
  { symbol: "BRETT", name: "Brett" },
  { symbol: "TOSHI", name: "Toshi" },
  { symbol: "AERO", name: "Aerodrome" },
  { symbol: "HIGHER", name: "Higher" },
  { symbol: "WETH", name: "Wrapped ETH" },
  { symbol: "DAI", name: "DAI" },
];

const DCA_FREQUENCIES = [
  { value: "15m", label: "Every 15 min", desc: "High frequency" },
  { value: "1h", label: "Hourly", desc: "Aggressive" },
  { value: "4h", label: "Every 4 hours", desc: "Active" },
  { value: "daily", label: "Daily", desc: "Standard" },
  { value: "weekly", label: "Weekly", desc: "Conservative" },
  { value: "monthly", label: "Monthly", desc: "Long-term" },
];

const DCA_DURATIONS = [
  { value: "7 days", label: "7 Days" },
  { value: "14 days", label: "14 Days" },
  { value: "30 days", label: "30 Days" },
  { value: "60 days", label: "60 Days" },
  { value: "90 days", label: "90 Days" },
  { value: "6 months", label: "6 Months" },
  { value: "1 year", label: "1 Year" },
  { value: "", label: "Indefinite" },
];

type AutomationType = "dca" | "limit-order" | "stop-loss" | "take-profit" | "twap";

interface AutomationRecord {
  id: string;
  type: AutomationType;
  token: string;
  description: string;
  status: "active" | "completed" | "cancelled" | "pending";
  createdAt: string;
  response?: string;
}

const HISTORY_KEY = "bankr_automations_history";

// ═══════════════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════════════

function getSavedKey(): string { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } }
function saveKey(k: string) { try { localStorage.setItem(KEY_STORAGE, k); } catch { /* */ } }
function clearKey() { try { localStorage.removeItem(KEY_STORAGE); } catch { /* */ } }

function getHistory(): AutomationRecord[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(h: AutomationRecord[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50))); } catch { /* */ }
}
function addRecord(r: AutomationRecord) {
  const h = getHistory();
  h.unshift(r);
  saveHistory(h);
  return h;
}

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
      <div className="font-mono text-sm">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TOKEN SELECTOR
// ═══════════════════════════════════════════════════════════════════════

function TokenPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <div>
      <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white font-mono text-xs hover:border-cyan-500/30 transition-all"
      >
        <span>{value || "Select token..."}</span>
        <ChevronDown className={clsx("w-3.5 h-3.5 text-gray-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-white/[0.08] bg-[#0a0d14] overflow-hidden z-20 relative">
          <div className="p-2 border-b border-white/[0.05]">
            <input
              type="text"
              placeholder="Custom token symbol..."
              value={custom}
              onChange={(e) => setCustom(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom) {
                  onChange(custom);
                  setOpen(false);
                  setCustom("");
                }
              }}
              className="w-full px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.05] font-mono text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {POPULAR_TOKENS.map((t) => (
              <button
                key={t.symbol}
                onClick={() => { onChange(t.symbol); setOpen(false); }}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.04] transition-colors",
                  value === t.symbol ? "text-cyan-400" : "text-gray-300"
                )}
              >
                <span className="font-mono text-xs font-medium">{t.symbol}</span>
                <span className="font-mono text-[10px] text-gray-600">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AUTOMATION TYPE TABS
// ═══════════════════════════════════════════════════════════════════════

const AUTOMATION_TYPES: { id: AutomationType; label: string; icon: React.ElementType; desc: string; color: string }[] = [
  { id: "dca", label: "DCA", icon: Repeat, desc: "Dollar Cost Average", color: "text-cyan-400" },
  { id: "limit-order", label: "Limit Order", icon: Target, desc: "Buy/Sell at price", color: "text-emerald-400" },
  { id: "stop-loss", label: "Stop Loss", icon: Shield, desc: "Protect position", color: "text-red-400" },
  { id: "take-profit", label: "Take Profit", icon: TrendingUp, desc: "Lock in gains", color: "text-amber-400" },
  { id: "twap", label: "TWAP", icon: Layers, desc: "Split large orders", color: "text-purple-400" },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function AutomationPage() {
  const { theme } = useTheme();

  // API Key state
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Automation type
  const [activeType, setActiveType] = useState<AutomationType>("dca");

  // Form states — DCA
  const [dcaToken, setDcaToken] = useState("ETH");
  const [dcaAmount, setDcaAmount] = useState("10");
  const [dcaCurrency, setDcaCurrency] = useState("USDC");
  const [dcaFrequency, setDcaFrequency] = useState("daily");
  const [dcaDuration, setDcaDuration] = useState("30 days");

  // Form states — Limit Order
  const [loToken, setLoToken] = useState("ETH");
  const [loSide, setLoSide] = useState<"buy" | "sell">("buy");
  const [loAmount, setLoAmount] = useState("50");
  const [loPrice, setLoPrice] = useState("");
  const [loCurrency, setLoCurrency] = useState("USDC");

  // Form states — Stop Loss
  const [slToken, setSlToken] = useState("ETH");
  const [slStopPrice, setSlStopPrice] = useState("");
  const [slPercentage, setSlPercentage] = useState("100");

  // Form states — Take Profit
  const [tpToken, setTpToken] = useState("ETH");
  const [tpTargetPrice, setTpTargetPrice] = useState("");
  const [tpPercentage, setTpPercentage] = useState("100");

  // Form states — TWAP
  const [twapToken, setTwapToken] = useState("ETH");
  const [twapAmount, setTwapAmount] = useState("500");
  const [twapCurrency, setTwapCurrency] = useState("USDC");
  const [twapDuration, setTwapDuration] = useState("24 hours");
  const [twapIntervals, setTwapIntervals] = useState("12");

  // Loading & result
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AutomationRecord[]>([]);

  // Active automations
  const [activeAutomations, setActiveAutomations] = useState<string | null>(null);
  const [loadingAutomations, setLoadingAutomations] = useState(false);

  // Current token price
  const [currentPrice, setCurrentPrice] = useState<string | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Init
  useEffect(() => {
    const saved = getSavedKey();
    if (saved) { setApiKey(saved); setConnected(true); }
    setHistory(getHistory());
  }, []);

  const handleConnect = () => {
    if (!apiKey.trim() || !apiKey.startsWith("bk_")) return;
    saveKey(apiKey.trim());
    setConnected(true);
    setError(null);
  };

  const handleDisconnect = () => {
    clearKey();
    setApiKey("");
    setConnected(false);
    setResult(null);
    setError(null);
    setActiveAutomations(null);
    setCurrentPrice(null);
  };

  // Check current price for a token
  const fetchPrice = useCallback(async (token: string) => {
    if (!connected || !token) return;
    setLoadingPrice(true);
    setCurrentPrice(null);
    try {
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, action: "check-price", token }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentPrice(data.response);
      }
    } catch { /* ignore */ }
    finally { setLoadingPrice(false); }
  }, [connected, apiKey]);

  // List active automations
  const fetchAutomations = useCallback(async () => {
    if (!connected) return;
    setLoadingAutomations(true);
    setActiveAutomations(null);
    try {
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, action: "list-automations" }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveAutomations(data.response);
      } else {
        setActiveAutomations("Failed to fetch automations: " + (data.error || "Unknown error"));
      }
    } catch {
      setActiveAutomations("Network error");
    } finally {
      setLoadingAutomations(false);
    }
  }, [connected, apiKey]);

  // Submit automation
  const handleSubmit = useCallback(async () => {
    if (!connected || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    let actionBody: Record<string, unknown> = { apiKey };

    switch (activeType) {
      case "dca":
        actionBody = {
          ...actionBody,
          action: "create-dca",
          token: dcaToken,
          amount: dcaAmount,
          currency: dcaCurrency,
          frequency: dcaFrequency,
          duration: dcaDuration,
        };
        break;
      case "limit-order":
        actionBody = {
          ...actionBody,
          action: "create-limit-order",
          token: loToken,
          side: loSide,
          amount: loAmount,
          price: loPrice,
          currency: loCurrency,
        };
        break;
      case "stop-loss":
        actionBody = {
          ...actionBody,
          action: "create-stop-loss",
          token: slToken,
          stopPrice: slStopPrice,
          sellPercentage: slPercentage,
        };
        break;
      case "take-profit":
        actionBody = {
          ...actionBody,
          action: "create-take-profit",
          token: tpToken,
          targetPrice: tpTargetPrice,
          sellPercentage: tpPercentage,
        };
        break;
      case "twap":
        actionBody = {
          ...actionBody,
          action: "create-twap",
          token: twapToken,
          totalAmount: twapAmount,
          currency: twapCurrency,
          duration: twapDuration,
          intervals: twapIntervals,
        };
        break;
    }

    try {
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actionBody),
      });
      const data = await res.json();

      if (data.success) {
        setResult(data.response);
        // Add to history
        const typeLabel = AUTOMATION_TYPES.find((t) => t.id === activeType)?.label || activeType;
        const token = activeType === "dca" ? dcaToken : activeType === "limit-order" ? loToken : activeType === "stop-loss" ? slToken : activeType === "take-profit" ? tpToken : twapToken;
        const record: AutomationRecord = {
          id: data.jobId || Date.now().toString(),
          type: activeType,
          token,
          description: `${typeLabel}: ${token}`,
          status: "active",
          createdAt: new Date().toISOString(),
          response: data.response,
        };
        const updated = addRecord(record);
        setHistory(updated);
      } else {
        setError(data.error || "Failed to create automation");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [connected, loading, activeType, apiKey, dcaToken, dcaAmount, dcaCurrency, dcaFrequency, dcaDuration, loToken, loSide, loAmount, loPrice, loCurrency, slToken, slStopPrice, slPercentage, tpToken, tpTargetPrice, tpPercentage, twapToken, twapAmount, twapCurrency, twapDuration, twapIntervals]);

  // Get the currently relevant token for price lookup
  const currentToken = activeType === "dca" ? dcaToken : activeType === "limit-order" ? loToken : activeType === "stop-loss" ? slToken : activeType === "take-profit" ? tpToken : twapToken;

  return (
    <BankrGate>
    <div className={clsx("min-h-screen transition-colors duration-300", theme === "dark" ? "bg-[#050810]" : "bg-gray-50")}>
      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)" }} />

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-4xl">
        {/* ─── HEADER ─── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Repeat className="w-5 h-5 text-cyan-400" />
              <h1 className="font-mono text-xl font-bold text-white">
                DCA &amp; <span className="text-cyan-400">Automation</span>
              </h1>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="font-mono text-[10px] text-cyan-400 font-medium">BETA</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/trade"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
                <ArrowUpDown className="w-3.5 h-3.5" /> Trade
              </Link>
              <Link href="/screener"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
                <Activity className="w-3.5 h-3.5" /> Screener
              </Link>
            </div>
          </div>
          <p className="font-mono text-xs text-gray-500">
            Automate your trading — DCA strategies, limit orders, stop losses, and TWAP via Bankr Agent
          </p>
        </div>

        {/* ─── API KEY CONNECTION ─── */}
        {!connected ? (
          <TerminalWindow title="bankr-auth — connect your api key">
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Key className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="font-mono text-sm font-bold text-white">Connect Bankr API Key</div>
                  <div className="font-mono text-[11px] text-gray-500">Required to create automations</div>
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    placeholder="bk_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    className="w-full px-4 py-3 pr-20 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button onClick={() => setShowKey(!showKey)}
                      className="p-1.5 text-gray-600 hover:text-gray-400 transition-colors">
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button onClick={handleConnect}
                disabled={!apiKey.trim() || !apiKey.startsWith("bk_")}
                className={clsx(
                  "w-full py-3 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-2",
                  apiKey.startsWith("bk_")
                    ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30"
                    : "bg-white/[0.02] border border-white/[0.06] text-gray-600 cursor-not-allowed"
                )}>
                <Zap className="w-3.5 h-3.5" /> Connect &amp; Start Automating
              </button>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <div className="font-mono text-[10px] text-gray-500 mb-2">How to get your API key:</div>
                <ol className="space-y-1 font-mono text-[10px] text-gray-600">
                  <li>1. Go to <a href="https://bankr.bot/api" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">bankr.bot/api</a></li>
                  <li>2. Create or select an API key</li>
                  <li>3. Enable &quot;Agent API&quot; access</li>
                  <li>4. Copy your key (starts with bk_)</li>
                </ol>
              </div>
            </div>
          </TerminalWindow>
        ) : (
          <>
            {/* ─── CONNECTED BAR ─── */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] mb-6">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[11px] text-emerald-400">connected</span>
                <span className="font-mono text-[10px] text-gray-600">
                  {apiKey.slice(0, 6)}...{apiKey.slice(-4)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={fetchAutomations}
                  disabled={loadingAutomations}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] font-mono text-[10px] text-gray-400 hover:text-cyan-400 transition-all">
                  <RefreshCw className={clsx("w-3 h-3", loadingAutomations && "animate-spin")} /> Active Orders
                </button>
                <button onClick={handleDisconnect}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] font-mono text-[10px] text-gray-400 hover:text-red-400 transition-all">
                  <X className="w-3 h-3" /> Disconnect
                </button>
              </div>
            </div>

            {/* ─── ACTIVE AUTOMATIONS (if loaded) ─── */}
            {activeAutomations && (
              <TerminalWindow title="active-automations — your running orders" className="mb-6">
                <div className="p-4">
                  <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{activeAutomations}</pre>
                </div>
              </TerminalWindow>
            )}

            {/* ─── AUTOMATION TYPE SELECTOR ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
              {AUTOMATION_TYPES.map((type) => {
                const Icon = type.icon;
                const isActive = activeType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => { setActiveType(type.id); setResult(null); setError(null); }}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border transition-all",
                      isActive
                        ? "bg-cyan-500/[0.08] border-cyan-500/30"
                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]"
                    )}
                  >
                    <Icon className={clsx("w-5 h-5", isActive ? type.color : "text-gray-600")} />
                    <span className={clsx("font-mono text-[11px] font-bold", isActive ? "text-white" : "text-gray-400")}>{type.label}</span>
                    <span className="font-mono text-[8px] text-gray-600">{type.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* ─── AUTOMATION FORM ─── */}
            <TerminalWindow title={`create-${activeType} — configure your automation`}>
              <div className="p-5 space-y-4">

                {/* ═══ DCA FORM ═══ */}
                {activeType === "dca" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TokenPicker value={dcaToken} onChange={setDcaToken} label="Buy Token" />
                      <div>
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Amount per buy</label>
                        <div className="flex gap-2">
                          <input type="number" value={dcaAmount} onChange={(e) => setDcaAmount(e.target.value)}
                            className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30" placeholder="10" />
                          <select value={dcaCurrency} onChange={(e) => setDcaCurrency(e.target.value)}
                            className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30 appearance-none cursor-pointer">
                            <option value="USDC">USDC</option>
                            <option value="ETH">ETH</option>
                            <option value="DAI">DAI</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Frequency</label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {DCA_FREQUENCIES.map((f) => (
                          <button key={f.value} onClick={() => setDcaFrequency(f.value)}
                            className={clsx(
                              "px-2 py-2 rounded-lg border font-mono text-center transition-all",
                              dcaFrequency === f.value
                                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                                : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.1]"
                            )}>
                            <div className="text-[10px] font-bold">{f.label}</div>
                            <div className="text-[8px] text-gray-600 mt-0.5">{f.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Duration</label>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                        {DCA_DURATIONS.map((d) => (
                          <button key={d.value || "indefinite"} onClick={() => setDcaDuration(d.value)}
                            className={clsx(
                              "px-2 py-2 rounded-lg border font-mono text-[10px] transition-all",
                              dcaDuration === d.value
                                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                                : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:border-white/[0.1]"
                            )}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DCA Summary */}
                    <div className="p-3 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/10">
                      <div className="font-mono text-[10px] text-cyan-400/70 uppercase mb-1">Strategy Summary</div>
                      <div className="font-mono text-xs text-gray-300">
                        Buy <span className="text-white font-bold">{dcaAmount} {dcaCurrency}</span> worth of{" "}
                        <span className="text-cyan-400 font-bold">{dcaToken}</span>{" "}
                        <span className="text-gray-400">{DCA_FREQUENCIES.find((f) => f.value === dcaFrequency)?.label?.toLowerCase()}</span>
                        {dcaDuration && <> for <span className="text-white">{dcaDuration}</span></>}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══ LIMIT ORDER FORM ═══ */}
                {activeType === "limit-order" && (
                  <>
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setLoSide("buy")}
                        className={clsx("flex-1 py-2.5 rounded-lg border font-mono text-xs font-bold transition-all",
                          loSide === "buy" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-white/[0.02] border-white/[0.06] text-gray-500")}>
                        BUY
                      </button>
                      <button onClick={() => setLoSide("sell")}
                        className={clsx("flex-1 py-2.5 rounded-lg border font-mono text-xs font-bold transition-all",
                          loSide === "sell" ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-white/[0.02] border-white/[0.06] text-gray-500")}>
                        SELL
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TokenPicker value={loToken} onChange={(v) => { setLoToken(v); }} label="Token" />
                      <div>
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">
                          {loSide === "buy" ? "Amount to spend" : "Amount to sell"}
                        </label>
                        <div className="flex gap-2">
                          <input type="number" value={loAmount} onChange={(e) => setLoAmount(e.target.value)}
                            className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30" placeholder="50" />
                          {loSide === "buy" && (
                            <select value={loCurrency} onChange={(e) => setLoCurrency(e.target.value)}
                              className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30 appearance-none cursor-pointer">
                              <option value="USDC">USDC</option>
                              <option value="ETH">ETH</option>
                            </select>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
                          {loSide === "buy" ? "Buy when price drops to" : "Sell when price reaches"}
                        </label>
                        <button onClick={() => fetchPrice(loToken)}
                          disabled={loadingPrice}
                          className="font-mono text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                          <RefreshCw className={clsx("w-2.5 h-2.5", loadingPrice && "animate-spin")} /> Check price
                        </button>
                      </div>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                        <input type="number" value={loPrice} onChange={(e) => setLoPrice(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30" placeholder="0.00" />
                      </div>
                      {currentPrice && (
                        <div className="mt-2 p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                          <pre className="font-mono text-[10px] text-gray-400 whitespace-pre-wrap">{currentPrice}</pre>
                        </div>
                      )}
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/10">
                      <div className="font-mono text-[10px] text-emerald-400/70 uppercase mb-1">Order Summary</div>
                      <div className="font-mono text-xs text-gray-300">
                        {loSide === "buy" ? (
                          <>Buy <span className="text-white font-bold">{loAmount} {loCurrency}</span> worth of <span className="text-emerald-400 font-bold">{loToken}</span> when price drops to <span className="text-white font-bold">${loPrice || "..."}</span></>
                        ) : (
                          <>Sell <span className="text-white font-bold">{loAmount} {loToken}</span> when price reaches <span className="text-white font-bold">${loPrice || "..."}</span></>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══ STOP LOSS FORM ═══ */}
                {activeType === "stop-loss" && (
                  <>
                    <TokenPicker value={slToken} onChange={setSlToken} label="Token to protect" />

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">Sell if price drops below</label>
                        <button onClick={() => fetchPrice(slToken)}
                          disabled={loadingPrice}
                          className="font-mono text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                          <RefreshCw className={clsx("w-2.5 h-2.5", loadingPrice && "animate-spin")} /> Check price
                        </button>
                      </div>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                        <input type="number" value={slStopPrice} onChange={(e) => setSlStopPrice(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30" placeholder="0.00" />
                      </div>
                      {currentPrice && (
                        <div className="mt-2 p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                          <pre className="font-mono text-[10px] text-gray-400 whitespace-pre-wrap">{currentPrice}</pre>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Sell percentage</label>
                      <div className="grid grid-cols-4 gap-2">
                        {["25", "50", "75", "100"].map((p) => (
                          <button key={p} onClick={() => setSlPercentage(p)}
                            className={clsx(
                              "py-2 rounded-lg border font-mono text-xs transition-all",
                              slPercentage === p ? "bg-red-500/10 border-red-500/30 text-red-400 font-bold" : "bg-white/[0.02] border-white/[0.06] text-gray-500"
                            )}>
                            {p}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-red-500/[0.04] border border-red-500/10">
                      <div className="font-mono text-[10px] text-red-400/70 uppercase mb-1">Stop Loss Summary</div>
                      <div className="font-mono text-xs text-gray-300">
                        Sell <span className="text-white font-bold">{slPercentage}%</span> of{" "}
                        <span className="text-red-400 font-bold">{slToken}</span> if price drops below{" "}
                        <span className="text-white font-bold">${slStopPrice || "..."}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* ═══ TAKE PROFIT FORM ═══ */}
                {activeType === "take-profit" && (
                  <>
                    <TokenPicker value={tpToken} onChange={setTpToken} label="Token" />

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">Sell when price reaches</label>
                        <button onClick={() => fetchPrice(tpToken)}
                          disabled={loadingPrice}
                          className="font-mono text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                          <RefreshCw className={clsx("w-2.5 h-2.5", loadingPrice && "animate-spin")} /> Check price
                        </button>
                      </div>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                        <input type="number" value={tpTargetPrice} onChange={(e) => setTpTargetPrice(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30" placeholder="0.00" />
                      </div>
                      {currentPrice && (
                        <div className="mt-2 p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                          <pre className="font-mono text-[10px] text-gray-400 whitespace-pre-wrap">{currentPrice}</pre>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Sell percentage</label>
                      <div className="grid grid-cols-4 gap-2">
                        {["25", "50", "75", "100"].map((p) => (
                          <button key={p} onClick={() => setTpPercentage(p)}
                            className={clsx(
                              "py-2 rounded-lg border font-mono text-xs transition-all",
                              tpPercentage === p ? "bg-amber-500/10 border-amber-500/30 text-amber-400 font-bold" : "bg-white/[0.02] border-white/[0.06] text-gray-500"
                            )}>
                            {p}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-500/[0.04] border border-amber-500/10">
                      <div className="font-mono text-[10px] text-amber-400/70 uppercase mb-1">Take Profit Summary</div>
                      <div className="font-mono text-xs text-gray-300">
                        Sell <span className="text-white font-bold">{tpPercentage}%</span> of{" "}
                        <span className="text-amber-400 font-bold">{tpToken}</span> when price reaches{" "}
                        <span className="text-white font-bold">${tpTargetPrice || "..."}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* ═══ TWAP FORM ═══ */}
                {activeType === "twap" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TokenPicker value={twapToken} onChange={setTwapToken} label="Buy Token" />
                      <div>
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Total Amount</label>
                        <div className="flex gap-2">
                          <input type="number" value={twapAmount} onChange={(e) => setTwapAmount(e.target.value)}
                            className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30" placeholder="500" />
                          <select value={twapCurrency} onChange={(e) => setTwapCurrency(e.target.value)}
                            className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30 appearance-none cursor-pointer">
                            <option value="USDC">USDC</option>
                            <option value="ETH">ETH</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Duration</label>
                        <select value={twapDuration} onChange={(e) => setTwapDuration(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30 appearance-none cursor-pointer">
                          <option value="1 hour">1 Hour</option>
                          <option value="4 hours">4 Hours</option>
                          <option value="12 hours">12 Hours</option>
                          <option value="24 hours">24 Hours</option>
                          <option value="48 hours">48 Hours</option>
                          <option value="7 days">7 Days</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Split into (intervals)</label>
                        <input type="number" value={twapIntervals} onChange={(e) => setTwapIntervals(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500/30" placeholder="12" />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-purple-500/[0.04] border border-purple-500/10">
                      <div className="font-mono text-[10px] text-purple-400/70 uppercase mb-1">TWAP Summary</div>
                      <div className="font-mono text-xs text-gray-300">
                        Buy <span className="text-white font-bold">{twapAmount} {twapCurrency}</span> worth of{" "}
                        <span className="text-purple-400 font-bold">{twapToken}</span> spread over{" "}
                        <span className="text-white">{twapDuration}</span> in{" "}
                        <span className="text-white">{twapIntervals}</span> equal parts
                        {twapAmount && twapIntervals && (
                          <span className="text-gray-500"> ({(parseFloat(twapAmount) / parseInt(twapIntervals || "1")).toFixed(2)} {twapCurrency} each)</span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ─── SUBMIT BUTTON ─── */}
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className={clsx(
                    "w-full py-3 rounded-lg font-mono text-xs font-bold transition-all flex items-center justify-center gap-2",
                    loading
                      ? "bg-gray-500/10 border border-gray-500/20 text-gray-500 cursor-wait"
                      : "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30"
                  )}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating automation...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Create {AUTOMATION_TYPES.find((t) => t.id === activeType)?.label}
                    </>
                  )}
                </button>
              </div>
            </TerminalWindow>

            {/* ─── RESULT ─── */}
            {result && (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-xs font-bold text-emerald-400">Automation Created</span>
                </div>
                <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{result}</pre>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="font-mono text-xs font-bold text-red-400">Error</span>
                </div>
                <p className="font-mono text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* ─── HISTORY ─── */}
            {history.length > 0 && (
              <TerminalWindow title="automation-history — recent automations" className="mt-6">
                <div className="divide-y divide-white/[0.04]">
                  {history.slice(0, 10).map((record) => {
                    const typeDef = AUTOMATION_TYPES.find((t) => t.id === record.type);
                    const Icon = typeDef?.icon || Repeat;
                    return (
                      <div key={record.id} className="px-4 py-3 flex items-center gap-3">
                        <Icon className={clsx("w-4 h-4 shrink-0", typeDef?.color || "text-gray-500")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-white">{record.description}</span>
                            <span className={clsx(
                              "px-1.5 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase",
                              record.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                                record.status === "completed" ? "bg-cyan-500/20 text-cyan-400" :
                                  record.status === "cancelled" ? "bg-red-500/20 text-red-400" :
                                    "bg-gray-500/20 text-gray-400"
                            )}>
                              {record.status}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-gray-600 mt-0.5">
                            {new Date(record.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TerminalWindow>
            )}

            {/* ─── FEATURES INFO ─── */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: Repeat, title: "DCA Strategy", desc: "Automatically buy tokens at regular intervals. Reduce volatility impact with dollar cost averaging.", color: "text-cyan-400" },
                { icon: Target, title: "Limit Orders", desc: "Set buy/sell orders at specific prices. Get the price you want without constant monitoring.", color: "text-emerald-400" },
                { icon: Shield, title: "Stop Loss", desc: "Protect your positions from major drops. Auto-sell when price hits your threshold.", color: "text-red-400" },
                { icon: TrendingUp, title: "Take Profit", desc: "Lock in gains automatically. Sell when price reaches your target.", color: "text-amber-400" },
                { icon: Layers, title: "TWAP Orders", desc: "Split large orders over time to minimize price impact. Smart execution.", color: "text-purple-400" },
                { icon: ShieldCheck, title: "Secure", desc: "Your API key never leaves your browser. All operations are executed directly through Bankr.", color: "text-emerald-400" },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                  <item.icon className={clsx("w-5 h-5 mb-2", item.color)} />
                  <div className="font-mono text-xs font-bold text-white mb-1">{item.title}</div>
                  <div className="font-mono text-[10px] text-gray-500 leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </BankrGate>
  );
}
