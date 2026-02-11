"use client";

import { useEffect, useState, useCallback } from "react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { BankrGate } from "@/components/bankr-gate";
import Link from "next/link";
import {
  Wallet, Key, Eye, EyeOff, RefreshCw, AlertTriangle,
  Activity, ExternalLink, Zap, Shield, TrendingUp,
  BarChart3, Search, Send, Trash2, ChevronRight,
  DollarSign, Layers, ArrowRight,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// LOCAL STORAGE KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

const KEY_STORAGE = "bankr_api_key";

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

// ═══════════════════════════════════════════════════════════════════════
// TERMINAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function TerminalWindow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-[#0a0d14] overflow-hidden">
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

function TermLine({ prefix = ">", color = "text-cyan-400", children }: { prefix?: string; color?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 leading-relaxed">
      <span className={clsx("flex-shrink-0", color)}>{prefix}</span>
      <span className="text-gray-300">{children}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// QUICK ACTION CARDS
// ═══════════════════════════════════════════════════════════════════════

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  action: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "portfolio", label: "Full Portfolio", description: "All balances across chains", icon: Wallet, action: "portfolio", color: "text-cyan-400" },
  { id: "trending", label: "Trending", description: "Hot tokens on Base", icon: TrendingUp, action: "trending", color: "text-emerald-400" },
  { id: "nfts", label: "My NFTs", description: "NFT holdings on Base & ETH", icon: Layers, action: "nfts", color: "text-purple-400" },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function PortfolioPage() {
  const { theme } = useTheme();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Load saved key
  useEffect(() => {
    const saved = getSavedKey();
    if (saved) {
      setApiKey(saved);
      setConnected(true);
    }
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

  const executeAction = useCallback(async (action: string, extra?: Record<string, string>) => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setActiveAction(action);

    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, action, ...extra }),
      });
      const json = await res.json();

      if (json.success) {
        setResponse(json.response);
      } else {
        setError(json.error || "Something went wrong");
      }
    } catch (e) {
      setError("Network error — check your connection");
      console.error(e);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  }, [apiKey]);

  const handleCustomQuery = () => {
    if (!customPrompt.trim()) return;
    executeAction("custom", { prompt: customPrompt.trim() });
  };

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
              <Wallet className="w-5 h-5 text-cyan-400" />
              <h1 className="font-mono text-xl font-bold text-white">
                Portfolio<span className="text-cyan-400">Tracker</span>
              </h1>
              {connected && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-emerald-400 font-medium">CONNECTED</span>
                </div>
              )}
            </div>
            <Link href="/screener"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
              <Activity className="w-3.5 h-3.5" /> Screener
            </Link>
          </div>
          <p className="font-mono text-xs text-gray-500">
            Connect your Bankr API key to view portfolio, track balances, and get market intelligence
          </p>
        </div>

        {/* ─── API KEY CONNECTION ─── */}
        {!connected ? (
          <TerminalWindow title="bankr-connect — api key setup">
            <div className="p-6">
              <div className="max-w-md mx-auto">
                {/* Info */}
                <div className="mb-6 p-4 rounded-lg bg-cyan-500/[0.05] border border-cyan-500/10">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-mono text-xs text-cyan-400 font-medium mb-1">Secure Connection</p>
                      <p className="font-mono text-[11px] text-gray-400 leading-relaxed">
                        Your API key is stored locally in your browser and never sent to our servers.
                        It is only used to communicate directly with the Bankr API.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Input */}
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
                      <button onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors">
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button onClick={handleConnect}
                    disabled={!apiKey.trim()}
                    className={clsx(
                      "w-full py-3 rounded-lg font-mono text-xs font-medium transition-all flex items-center justify-center gap-2",
                      apiKey.trim()
                        ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30"
                        : "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                    )}>
                    <Zap className="w-3.5 h-3.5" /> Connect to Bankr
                  </button>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="font-mono text-xs text-red-400">{error}</p>
                    </div>
                  )}

                  <div className="text-center">
                    <a href="https://bankr.bot/api" target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[11px] text-gray-500 hover:text-cyan-400 transition-colors inline-flex items-center gap-1">
                      Get an API key at bankr.bot/api <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </TerminalWindow>
        ) : (
          <>
            {/* ─── CONNECTED STATE ─── */}
            {/* Connection bar */}
            <div className="mb-4 flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[11px] text-gray-400">
                  Connected: <span className="text-gray-300">{apiKey.slice(0, 6)}...{apiKey.slice(-4)}</span>
                </span>
              </div>
              <button onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                <Trash2 className="w-3 h-3" /> Disconnect
              </button>
            </div>

            {/* ─── QUICK ACTIONS ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {QUICK_ACTIONS.map((qa) => {
                const Icon = qa.icon;
                const isActive = activeAction === qa.action && loading;
                return (
                  <button key={qa.id} onClick={() => executeAction(qa.action)}
                    disabled={loading}
                    className={clsx(
                      "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                      isActive
                        ? "bg-cyan-500/10 border-cyan-500/20"
                        : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.1]",
                      loading && !isActive && "opacity-50"
                    )}>
                    {isActive ? (
                      <RefreshCw className={clsx("w-5 h-5 shrink-0 animate-spin", qa.color)} />
                    ) : (
                      <Icon className={clsx("w-5 h-5 shrink-0", qa.color)} />
                    )}
                    <div>
                      <div className="font-mono text-xs font-medium text-white">{qa.label}</div>
                      <div className="font-mono text-[10px] text-gray-500">{qa.description}</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600 ml-auto shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* ─── CUSTOM QUERY ─── */}
            <TerminalWindow title="bankr-agent — natural language query">
              <div className="p-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input type="text" placeholder='Ask anything... "price of ETH", "analyze BNKR", "my balances on Base"'
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCustomQuery()}
                      disabled={loading}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg font-mono text-xs bg-white/[0.03] border border-white/[0.06] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.05] transition-all" />
                  </div>
                  <button onClick={handleCustomQuery}
                    disabled={loading || !customPrompt.trim()}
                    className={clsx(
                      "px-4 py-2.5 rounded-lg font-mono text-xs transition-all flex items-center gap-1.5 shrink-0",
                      customPrompt.trim() && !loading
                        ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30"
                        : "bg-white/[0.02] border border-white/[0.04] text-gray-600 cursor-not-allowed"
                    )}>
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send
                  </button>
                </div>

                {/* Suggested queries */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {["price of BNKR", "my ETH balance", "top gainers today", "compare ETH vs SOL"].map((q) => (
                    <button key={q} onClick={() => { setCustomPrompt(q); }}
                      className="px-2.5 py-1 rounded-md font-mono text-[10px] text-gray-500 bg-white/[0.02] border border-white/[0.04] hover:text-cyan-400 hover:border-cyan-500/20 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </TerminalWindow>

            {/* ─── RESPONSE ─── */}
            {(loading || response || error) && (
              <div className="mt-4">
                <TerminalWindow title="bankr-agent — response">
                  <div className="p-5 space-y-2">
                    {loading && (
                      <div className="flex items-center gap-3 py-8 justify-center">
                        <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                        <span className="font-mono text-sm text-gray-400">
                          querying bankr agent<span className="animate-pulse">...</span>
                        </span>
                      </div>
                    )}

                    {error && !loading && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
                        <TermLine prefix="!" color="text-red-400">{error}</TermLine>
                        {error.toLowerCase().includes("agent api") && (
                          <div className="mt-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                            <p className="font-mono text-[11px] text-gray-400 mb-2">To fix this:</p>
                            <ol className="list-decimal list-inside font-mono text-[11px] text-gray-400 space-y-1">
                              <li>Go to <a href="https://bankr.bot/api" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">bankr.bot/api</a></li>
                              <li>Select your API key</li>
                              <li>Enable <span className="text-white font-medium">&quot;Agent API&quot;</span> access</li>
                              <li>Come back and try again</li>
                            </ol>
                          </div>
                        )}
                      </div>
                    )}

                    {response && !loading && (
                      <div className="space-y-1">
                        <TermLine prefix="$" color="text-gray-500">bankr_response:</TermLine>
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

            {/* ─── INFO ─── */}
            <div className="mt-6 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
              <h3 className="font-mono text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" /> Available Commands
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: "Portfolio & Balances", examples: ["my portfolio", "ETH balance on Base", "total value"] },
                  { label: "Market Data", examples: ["price of BNKR", "trending on Base", "top gainers"] },
                  { label: "Analysis", examples: ["analyze ETH", "compare ETH vs SOL", "RSI for BTC"] },
                  { label: "NFTs", examples: ["show my NFTs", "floor price of Pudgy Penguins"] },
                ].map((cat) => (
                  <div key={cat.label} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                    <div className="font-mono text-[11px] text-gray-400 font-medium mb-2">{cat.label}</div>
                    <div className="space-y-1">
                      {cat.examples.map((ex) => (
                        <button key={ex} onClick={() => setCustomPrompt(ex)}
                          className="block font-mono text-[10px] text-gray-500 hover:text-cyan-400 transition-colors cursor-pointer">
                          &gt; &quot;{ex}&quot;
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </BankrGate>
  );
}
