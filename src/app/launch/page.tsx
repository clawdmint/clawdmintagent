"use client";

import { useState, useCallback, useEffect } from "react";
import { clsx } from "clsx";
import { BaseLogo, SolanaLogo } from "@/components/network-icons";
import { useTheme } from "@/components/theme-provider";
import { useWallet } from "@/components/wallet-context";
import { fetchWithRetry, getErrorMessage } from "@/lib/fetch-retry";
import { getTokenExplorerUrl, getTransactionExplorerUrl, getNetworkFromValue } from "@/lib/network-config";
import Link from "next/link";
import {
  Rocket, Zap, Globe, Image as ImageIcon, Twitter, AlertTriangle,
  Check, Copy, ExternalLink, Loader2, ChevronRight, Sparkles,
  ArrowRight, Wallet, Eye, RefreshCw, Shield,
} from "lucide-react";

const FEE_RECIPIENT_TYPES = [
  { id: "wallet", label: "Wallet Address", placeholder: "0x... or Solana address", desc: "EVM or Solana wallet" },
  { id: "x", label: "X / Twitter", placeholder: "@username", desc: "Resolves to Bankr wallet" },
  { id: "farcaster", label: "Farcaster", placeholder: "username.eth", desc: "Verified EVM address" },
  { id: "ens", label: "ENS", placeholder: "name.eth", desc: "Resolves to address" },
];

interface DeployResult {
  tokenAddress: string;
  poolId?: string;
  txHash?: string;
  chain: string;
  feeDistribution?: Record<string, { address: string; bps: number }>;
  simulated?: boolean;
}

interface LaunchRecord {
  id: string;
  name?: string;
  tokenName?: string;
  symbol?: string;
  tokenSymbol?: string;
  tokenAddress: string;
  chain?: string;
  txHash?: string;
  timestamp?: number;
  createdAt?: string;
  simulated?: boolean;
}

export default function LaunchPage() {
  const { theme } = useTheme();
  const { authenticated, address, login, connectSolana, solanaConnected, solanaAvailable } = useWallet();

  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [tweetUrl, setTweetUrl] = useState("");
  const [feeType, setFeeType] = useState("wallet");
  const [feeValue, setFeeValue] = useState("");
  const [useOwnWallet, setUseOwnWallet] = useState(true);

  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [history, setHistory] = useState<LaunchRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [stats, setStats] = useState<{ totalLaunches: number; recentLaunches24h: number; uniqueLaunchers: number } | null>(null);

  const effectiveFeeValue = useOwnWallet ? (address || "") : feeValue;

  // Fetch launch history from DB when wallet connects
  useEffect(() => {
    if (!address) { setHistory([]); return; }
    fetch("/api/token-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", walletAddress: address }),
    }).then(r => r.json()).then(d => {
      if (d.success) setHistory(d.launches.map((l: LaunchRecord) => ({ ...l, timestamp: new Date(l.createdAt || 0).getTime() })));
    }).catch(() => {});
  }, [address]);

  // Fetch platform stats
  useEffect(() => {
    fetch("/api/token-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stats" }),
    }).then(r => r.json()).then(d => {
      if (d.success) setStats(d.stats);
    }).catch(() => {});
  }, []);

  const copyToClip = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }, []);

  const handleSolanaConnect = useCallback(() => {
    if (!solanaAvailable) {
      window.open("https://phantom.app/download", "_blank", "noopener,noreferrer");
      return;
    }

    void connectSolana();
  }, [connectSolana, solanaAvailable]);

  const handleSimulate = useCallback(async () => {
    if (!tokenName.trim()) { setError("Token name is required"); return; }
    setSimulating(true);
    setError("");
    setResult(null);
    try {
      const res = await fetchWithRetry("/api/token-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          tokenName: tokenName.trim(),
          tokenSymbol: tokenSymbol.trim() || undefined,
          feeRecipientValue: effectiveFeeValue || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ ...data, simulated: true });
      } else {
        setError(data.error || "Simulation failed");
      }
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setSimulating(false); }
  }, [tokenName, tokenSymbol, effectiveFeeValue]);

  const handleDeploy = useCallback(async () => {
    if (!tokenName.trim()) { setError("Token name is required"); return; }
    if (!effectiveFeeValue) { setError("Fee recipient is required"); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetchWithRetry("/api/token-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deploy",
          tokenName: tokenName.trim(),
          tokenSymbol: tokenSymbol.trim() || undefined,
          description: description.trim() || undefined,
          image: imageUrl.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          tweetUrl: tweetUrl.trim() || undefined,
          feeRecipientType: useOwnWallet ? "wallet" : feeType,
          feeRecipientValue: effectiveFeeValue,
          launcherAddress: address,
        }),
      }, { timeoutMs: 60000 });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        const record: LaunchRecord = {
          id: Date.now().toString(),
          name: tokenName.trim(),
          symbol: tokenSymbol.trim() || tokenName.trim().slice(0, 4).toUpperCase(),
          tokenAddress: data.tokenAddress,
          chain: data.chain,
          txHash: data.txHash,
          timestamp: Date.now(),
          simulated: false,
        };
        setHistory((prev) => [record, ...prev]);
      } else {
        setError(data.error || "Deploy failed");
      }
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, [tokenName, tokenSymbol, description, imageUrl, websiteUrl, tweetUrl, feeType, effectiveFeeValue, useOwnWallet]);

  const resetForm = () => {
    setTokenName("");
    setTokenSymbol("");
    setDescription("");
    setImageUrl("");
    setWebsiteUrl("");
    setTweetUrl("");
    setFeeValue("");
    setResult(null);
    setError("");
  };

  const isDark = theme === "dark";

  return (
    <div className={clsx("min-h-screen transition-colors duration-300", isDark ? "bg-[#050810]" : "bg-gray-50")}>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)" }} />

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Rocket className="w-5 h-5 text-cyan-400" />
                <h1 className="font-mono text-xl font-bold">Token Launch</h1>
              </div>
              <p className={clsx("font-mono text-xs", isDark ? "text-gray-600" : "text-gray-400")}>
              Deploy tokens via Bankr Partner API
              </p>
            </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg font-mono text-[11px] font-medium border transition-all",
                  isDark ? "border-white/[0.08] text-gray-400 hover:border-cyan-500/20 hover:text-white" : "border-gray-200 text-gray-500 hover:border-cyan-300"
                )}
              >
                History ({history.length})
              </button>
            )}
            <Link href="/screener" className={clsx("px-3 py-1.5 rounded-lg font-mono text-[11px] font-medium border transition-all", isDark ? "border-white/[0.08] text-gray-500 hover:text-gray-300" : "border-gray-200 text-gray-400")}>
              Screener <ChevronRight className="w-3 h-3 inline" />
            </Link>
          </div>
        </div>

        {/* History Panel */}
        {showHistory && history.length > 0 && (
          <div className={clsx("rounded-2xl border p-5 mb-6", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
            <h3 className="font-mono text-sm font-bold mb-3">Recent Launches</h3>
            <div className="space-y-2">
              {history.slice(0, 10).map((h) => (
                <div key={h.id} className={clsx("flex items-center justify-between px-3 py-2 rounded-lg border", isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-gray-100 bg-gray-50")}>
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold", isDark ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600")}>
                      {(h.tokenSymbol || h.symbol || "?").slice(0, 3)}
                    </div>
                    <div>
                      <div className="font-mono text-xs font-medium">{h.tokenName || h.name} <span className={isDark ? "text-gray-600" : "text-gray-400"}>({h.tokenSymbol || h.symbol})</span></div>
                      <div className={clsx("font-mono text-[10px]", isDark ? "text-gray-700" : "text-gray-400")}>
                        {new Date(h.createdAt || h.timestamp || 0).toLocaleDateString()} {h.simulated && "· simulated"}
                      </div>
                    </div>
                  </div>
                  {h.txHash && (
                    <a href={getTransactionExplorerUrl(h.txHash, h.chain)} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left: Form */}
          <div className="lg:col-span-3 space-y-5">
            {/* Token Info */}
            <div className={clsx("rounded-2xl border overflow-hidden", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
              <div className={clsx("px-5 py-3 border-b flex items-center gap-2", isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-gray-100 bg-gray-50")}>
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-mono text-xs font-bold">Token Details</span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={clsx("font-mono text-[10px] uppercase tracking-wider mb-1.5 block", isDark ? "text-gray-500" : "text-gray-400")}>
                    Token Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="My Token"
                    maxLength={100}
                    className={clsx("w-full px-4 py-3 rounded-xl border font-mono text-sm outline-none transition-all focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={clsx("font-mono text-[10px] uppercase tracking-wider mb-1.5 block", isDark ? "text-gray-500" : "text-gray-400")}>
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={tokenSymbol}
                      onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                      placeholder="MTK"
                      maxLength={10}
                      className={clsx("w-full px-4 py-3 rounded-xl border font-mono text-sm outline-none transition-all focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                    />
                  </div>
                  <div>
                    <label className={clsx("font-mono text-[10px] uppercase tracking-wider mb-1.5 block", isDark ? "text-gray-500" : "text-gray-400")}>
                      Network
                    </label>
                    <div className={clsx("px-4 py-3 rounded-xl border font-mono text-sm flex items-center gap-3", isDark ? "bg-white/[0.02] border-white/[0.08]" : "bg-gray-50 border-gray-200")}>
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-blue-300">
                        <BaseLogo className="w-3.5 h-3.5 text-blue-400" />
                        Base
                      </div>
                      <div className={clsx("h-4 w-px", isDark ? "bg-white/[0.08]" : "bg-gray-200")} />
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                        <SolanaLogo className="w-3.5 h-3.5" />
                        Solana
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className={clsx("font-mono text-[10px] uppercase tracking-wider mb-1.5 block", isDark ? "text-gray-500" : "text-gray-400")}>
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description for on-chain metadata (max 500 chars)"
                    maxLength={500}
                    rows={3}
                    className={clsx("w-full px-4 py-3 rounded-xl border font-mono text-xs outline-none transition-all resize-none focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                  />
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className={clsx("rounded-2xl border overflow-hidden", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
              <div className={clsx("px-5 py-3 border-b flex items-center gap-2", isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-gray-100 bg-gray-50")}>
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-mono text-xs font-bold">Metadata & Links</span>
                <span className={clsx("ml-auto font-mono text-[10px]", isDark ? "text-gray-700" : "text-gray-400")}>Optional</span>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className={clsx("w-4 h-4 shrink-0", isDark ? "text-gray-600" : "text-gray-400")} />
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Logo image URL (uploaded to IPFS)"
                    className={clsx("flex-1 px-3 py-2.5 rounded-lg border font-mono text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Globe className={clsx("w-4 h-4 shrink-0", isDark ? "text-gray-600" : "text-gray-400")} />
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="Website URL"
                    className={clsx("flex-1 px-3 py-2.5 rounded-lg border font-mono text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Twitter className={clsx("w-4 h-4 shrink-0", isDark ? "text-gray-600" : "text-gray-400")} />
                  <input
                    type="url"
                    value={tweetUrl}
                    onChange={(e) => setTweetUrl(e.target.value)}
                    placeholder="Tweet URL (announcement tweet)"
                    className={clsx("flex-1 px-3 py-2.5 rounded-lg border font-mono text-xs outline-none transition-all focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                  />
                </div>
              </div>
            </div>

            {/* Fee Recipient */}
            <div className={clsx("rounded-2xl border overflow-hidden", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
              <div className={clsx("px-5 py-3 border-b flex items-center gap-2", isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-gray-100 bg-gray-50")}>
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-xs font-bold">Fee Recipient</span>
              </div>
              <div className="p-5 space-y-4">
                <p className={clsx("font-mono text-[11px] leading-relaxed", isDark ? "text-gray-500" : "text-gray-400")}>
                  Receives the creator&apos;s share (57%) of the 1.2% swap fee from all trades on your token.
                </p>

                {authenticated && (
                  <label className={clsx("flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all",
                    useOwnWallet
                      ? isDark ? "bg-cyan-500/[0.06] border-cyan-500/20" : "bg-cyan-50 border-cyan-200"
                      : isDark ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]" : "bg-gray-50 border-gray-200 hover:border-gray-300"
                  )}>
                    <input type="checkbox" checked={useOwnWallet} onChange={(e) => setUseOwnWallet(e.target.checked)} className="sr-only" />
                    <div className={clsx("w-4 h-4 rounded border flex items-center justify-center", useOwnWallet ? "bg-cyan-500 border-cyan-500" : isDark ? "border-white/20" : "border-gray-300")}>
                      {useOwnWallet && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <div className="font-mono text-xs font-medium">Use my connected wallet</div>
                      <div className={clsx("font-mono text-[10px]", isDark ? "text-gray-600" : "text-gray-400")}>
                        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
                      </div>
                    </div>
                  </label>
                )}

                {!useOwnWallet && (
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      {FEE_RECIPIENT_TYPES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setFeeType(t.id)}
                          className={clsx("px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold border transition-all",
                            feeType === t.id
                              ? isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-200 text-cyan-600"
                              : isDark ? "border-white/[0.06] text-gray-600 hover:text-gray-400" : "border-gray-200 text-gray-400 hover:text-gray-600"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={feeValue}
                      onChange={(e) => setFeeValue(e.target.value)}
                      placeholder={FEE_RECIPIENT_TYPES.find((t) => t.id === feeType)?.placeholder}
                      className={clsx("w-full px-4 py-3 rounded-xl border font-mono text-sm outline-none transition-all focus:ring-1 focus:ring-cyan-500/30", isDark ? "bg-white/[0.02] border-white/[0.08] text-white placeholder-gray-700" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400")}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="font-mono text-xs text-red-400 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {!authenticated ? (
                <>
                  <button onClick={login} className="flex-1 py-3.5 rounded-xl font-mono text-sm font-bold bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all flex items-center justify-center gap-2">
                    <BaseLogo className="w-4 h-4 text-blue-400" /> Connect Base
                  </button>
                  <button
                    onClick={handleSolanaConnect}
                    className={clsx(
                      "flex-1 py-3.5 rounded-xl font-mono text-sm font-bold border transition-all flex items-center justify-center gap-2",
                      isDark
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/15"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                    )}
                  >
                    <SolanaLogo className="w-4 h-4" /> {solanaAvailable ? (solanaConnected ? "Solana Connected" : "Connect Solana") : "Install Phantom"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSimulate}
                    disabled={simulating || loading || !tokenName.trim()}
                    className={clsx("px-5 py-3.5 rounded-xl font-mono text-sm font-semibold border transition-all flex items-center justify-center gap-2",
                      simulating || loading || !tokenName.trim()
                        ? "opacity-40 cursor-not-allowed"
                        : isDark ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.04] hover:border-cyan-500/20" : "border-gray-200 text-gray-600 hover:border-cyan-300"
                    )}
                  >
                    {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    Simulate
                  </button>
                  <button
                    onClick={handleDeploy}
                    disabled={loading || simulating || !tokenName.trim() || !effectiveFeeValue}
                    className={clsx("flex-1 py-3.5 rounded-xl font-mono text-sm font-bold transition-all flex items-center justify-center gap-2",
                      loading || simulating || !tokenName.trim() || !effectiveFeeValue
                        ? "opacity-40 cursor-not-allowed bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400/60"
                        : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25 hover:scale-[1.01] active:scale-[0.99]"
                    )}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                    {loading ? "Deploying..." : "Deploy Token"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: Info / Result */}
          <div className="lg:col-span-2 space-y-5">
            {/* Result Card */}
            {result && (
              <div className={clsx("rounded-2xl border overflow-hidden", result.simulated ? "border-yellow-500/20" : "border-emerald-500/20", isDark ? "bg-[#0a0d14]" : "bg-white")}>
                <div className={clsx("px-5 py-3 border-b flex items-center gap-2", result.simulated ? "border-yellow-500/10 bg-yellow-500/[0.03]" : "border-emerald-500/10 bg-emerald-500/[0.03]")}>
                  {result.simulated ? <Eye className="w-3.5 h-3.5 text-yellow-400" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  <span className={clsx("font-mono text-xs font-bold", result.simulated ? "text-yellow-400" : "text-emerald-400")}>
                    {result.simulated ? "Simulation Result" : "Token Deployed!"}
                  </span>
                </div>
                <div className="p-5 space-y-3">
                  <div>
                    <div className={clsx("font-mono text-[10px] mb-1", isDark ? "text-gray-600" : "text-gray-400")}>Token Address</div>
                    <button onClick={() => copyToClip(result.tokenAddress, "addr")} className={clsx("w-full flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-xs break-all text-left transition-all", isDark ? "border-white/[0.06] hover:border-cyan-500/20 text-gray-300" : "border-gray-200 hover:border-cyan-300 text-gray-700")}>
                      <span className="flex-1">{result.tokenAddress}</span>
                      {copied === "addr" ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0 opacity-40" />}
                    </button>
                  </div>

                  {result.txHash && (
                    <div>
                      <div className={clsx("font-mono text-[10px] mb-1", isDark ? "text-gray-600" : "text-gray-400")}>Transaction</div>
                      <a href={getTransactionExplorerUrl(result.txHash, result.chain)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-all border-cyan-500/20 hover:border-cyan-500/40">
                        <span className="truncate">{result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}

                  {result.feeDistribution && (
                    <div>
                      <div className={clsx("font-mono text-[10px] mb-2", isDark ? "text-gray-600" : "text-gray-400")}>Fee Distribution (1.2% swap fee)</div>
                      <div className="space-y-1">
                        {Object.entries(result.feeDistribution).map(([role, info]) => (
                          <div key={role} className={clsx("flex items-center justify-between px-3 py-1.5 rounded-lg font-mono text-[10px]", isDark ? "bg-white/[0.02]" : "bg-gray-50")}>
                            <span className="capitalize">{role}</span>
                            <span className={clsx(role === "creator" ? "text-emerald-400 font-bold" : isDark ? "text-gray-500" : "text-gray-400")}>
                              {(info.bps / 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    {!result.simulated && (
                      <a href={getTokenExplorerUrl(result.tokenAddress, result.chain)} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 font-mono text-[11px] text-cyan-400 hover:bg-cyan-500/20 transition-all text-center">
                        View on {getNetworkFromValue(result.chain).explorerName}
                      </a>
                    )}
                    <button onClick={resetForm} className={clsx("flex-1 py-2 rounded-lg border font-mono text-[11px] transition-all text-center flex items-center justify-center gap-1", isDark ? "border-white/[0.06] text-gray-500 hover:text-gray-300" : "border-gray-200 text-gray-400 hover:text-gray-600")}>
                      <RefreshCw className="w-3 h-3" /> New Token
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Info Card */}
            <div className={clsx("rounded-2xl border p-5", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-yellow-400" />
                <h3 className="font-mono text-sm font-bold">How It Works</h3>
              </div>
              <div className="space-y-3">
                {[
                  { step: "1", title: "Fill Details", desc: "Name, symbol, metadata — all stored on-chain" },
                  { step: "2", title: "Set Fee Recipient", desc: "Who receives 57% of 1.2% trading fees" },
                  { step: "3", title: "Simulate First", desc: "Preview your token address risk-free" },
                  { step: "4", title: "Deploy", desc: "One click — live on Base with bonding curve" },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className={clsx("w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold shrink-0 mt-0.5", isDark ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600")}>{s.step}</div>
                    <div>
                      <div className="font-mono text-xs font-medium">{s.title}</div>
                      <div className={clsx("font-mono text-[10px]", isDark ? "text-gray-600" : "text-gray-400")}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fee Breakdown */}
            <div className={clsx("rounded-2xl border p-5", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h3 className="font-mono text-sm font-bold">Fee Structure</h3>
              </div>
              <p className={clsx("font-mono text-[10px] mb-3 leading-relaxed", isDark ? "text-gray-600" : "text-gray-400")}>
                Every trade on your token incurs a 1.2% swap fee, distributed automatically:
              </p>
              <div className="space-y-1.5">
                {[
                  { label: "Creator (You)", pct: "57%", color: "text-emerald-400" },
                  { label: "Platform", pct: "18%", color: isDark ? "text-gray-500" : "text-gray-400" },
                  { label: "Partner", pct: "18%", color: "text-cyan-400" },
                  { label: "Protocol", pct: "5%", color: isDark ? "text-gray-600" : "text-gray-300" },
                  { label: "Ecosystem", pct: "2%", color: isDark ? "text-gray-600" : "text-gray-300" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center justify-between font-mono text-[11px]">
                    <span className={isDark ? "text-gray-400" : "text-gray-500"}>{f.label}</span>
                    <span className={clsx("font-bold", f.color)}>{f.pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Stats */}
            {stats && (
              <div className={clsx("rounded-2xl border p-4", isDark ? "bg-[#0a0d14] border-white/[0.06]" : "bg-white border-gray-200")}>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="font-mono text-lg font-bold text-cyan-400">{stats.totalLaunches}</div>
                    <div className={clsx("font-mono text-[9px] uppercase", isDark ? "text-gray-600" : "text-gray-400")}>Total Launches</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold text-emerald-400">{stats.recentLaunches24h}</div>
                    <div className={clsx("font-mono text-[9px] uppercase", isDark ? "text-gray-600" : "text-gray-400")}>Last 24h</div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold text-purple-400">{stats.uniqueLaunchers}</div>
                    <div className={clsx("font-mono text-[9px] uppercase", isDark ? "text-gray-600" : "text-gray-400")}>Launchers</div>
                  </div>
                </div>
              </div>
            )}

            {/* Powered by */}
            <div className={clsx("rounded-xl border px-4 py-3 flex items-center justify-center gap-2", isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-gray-100 bg-gray-50")}>
              <span className={clsx("font-mono text-[10px]", isDark ? "text-gray-700" : "text-gray-400")}>Powered by</span>
              <a href="https://bankr.bot" target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
                Bankr <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
