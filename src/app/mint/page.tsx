"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { useWallet } from "@/components/wallet-context";
import { COLLECTION_ABI } from "@/lib/contracts";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import {
  Sparkles, ExternalLink, Minus, Plus, CheckCircle, ShoppingBag,
  Shield, Cpu, Eye, Zap, Target, Layers, ChevronDown, Lock, Clock,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════

const AGENTS_CONTRACT = (process.env["NEXT_PUBLIC_AGENTS_CONTRACT"] || "") as `0x${string}`;
const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";

const MAX_SUPPLY = 10000;
const MAX_PER_TX = 10;
const PLATFORM_FEE_USD = 1.5;

// ═══════════════════════════════════════════════════════════════════════
// RARITY DATA
// ═══════════════════════════════════════════════════════════════════════

const RARITY_TIERS = [
  { name: "Common", pct: "45%", color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20" },
  { name: "Uncommon", pct: "25%", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  { name: "Rare", pct: "18%", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  { name: "Epic", pct: "8%", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { name: "Legendary", pct: "3.5%", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  { name: "Mythic", pct: "0.5%", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
];

const TRAIT_CATEGORIES = [
  { name: "Head", icon: Shield, count: 8 },
  { name: "Eyes", icon: Eye, count: 7 },
  { name: "Body", icon: Cpu, count: 7 },
  { name: "Arms", icon: Zap, count: 7 },
  { name: "Legs", icon: Target, count: 7 },
  { name: "Background", icon: Layers, count: 22 },
];

// ═══════════════════════════════════════════════════════════════════════
// ON-CHAIN DATA HOOK
// ═══════════════════════════════════════════════════════════════════════

interface CollectionData {
  loading: boolean;
  name: string;
  maxSupply: number;
  mintPrice: bigint;
  totalMinted: number;
  isSoldOut: boolean;
  mintStartTime: number; // unix timestamp, 0 = immediate
  refetch: () => void;
}

function useCollectionData(): CollectionData {
  const contractConfig = {
    address: AGENTS_CONTRACT,
    abi: COLLECTION_ABI,
  } as const;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...contractConfig, functionName: "name" },
      { ...contractConfig, functionName: "maxSupply" },
      { ...contractConfig, functionName: "mintPrice" },
      { ...contractConfig, functionName: "totalMinted" },
      { ...contractConfig, functionName: "isSoldOut" },
    ],
    query: {
      enabled: !!AGENTS_CONTRACT,
      refetchInterval: 15000,
    },
  });

  return useMemo((): CollectionData => {
    if (!data || isLoading) {
      const envMintStart = parseInt(process.env["NEXT_PUBLIC_MINT_START_TIME"] || "0", 10);
      return {
        loading: true,
        name: "Clawdmint Agents",
        maxSupply: MAX_SUPPLY,
        mintPrice: BigInt(0),
        totalMinted: 0,
        isSoldOut: false,
        mintStartTime: envMintStart,
        refetch,
      };
    }

    const [nameRes, maxSupplyRes, mintPriceRes, totalMintedRes, isSoldOutRes] = data;

    // mintStartTime from ENV (contract doesn't have this function)
    const envMintStart = parseInt(process.env["NEXT_PUBLIC_MINT_START_TIME"] || "0", 10);

    return {
      loading: false,
      name: (nameRes.result as string) || "Clawdmint Agents",
      maxSupply: Number(maxSupplyRes.result || MAX_SUPPLY),
      mintPrice: (mintPriceRes.result as bigint) || BigInt(0),
      totalMinted: Number(totalMintedRes.result || 0),
      isSoldOut: (isSoldOutRes.result as boolean) || false,
      mintStartTime: envMintStart,
      refetch,
    };
  }, [data, isLoading, refetch]);
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function CountdownTimer({ targetTime }: { targetTime: number }) {
  const { theme } = useTheme();
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0, expired: false });

  useEffect(() => {
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const diff = targetTime - now;
      if (diff <= 0) {
        setTimeLeft({ h: 0, m: 0, s: 0, expired: true });
        return;
      }
      setTimeLeft({
        h: Math.floor(diff / 3600),
        m: Math.floor((diff % 3600) / 60),
        s: diff % 60,
        expired: false,
      });
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (timeLeft.expired) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="text-center py-6 space-y-4">
      <p className={clsx(
        "text-xs uppercase tracking-widest font-mono",
        theme === "dark" ? "text-cyan-400" : "text-cyan-600"
      )}>
        Mint Opens In
      </p>
      <div className="flex items-center justify-center gap-3">
        {[
          { val: pad(timeLeft.h), label: "Hours" },
          { val: pad(timeLeft.m), label: "Min" },
          { val: pad(timeLeft.s), label: "Sec" },
        ].map(({ val, label }) => (
          <div key={label} className="text-center">
            <div className={clsx(
              "w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-mono font-black border",
              theme === "dark"
                ? "bg-white/[0.03] border-cyan-500/20 text-white"
                : "bg-gray-50 border-cyan-200 text-gray-900"
            )}>
              {val}
            </div>
            <p className={clsx(
              "text-xs mt-1.5 uppercase tracking-wider",
              theme === "dark" ? "text-gray-500" : "text-gray-400"
            )}>
              {label}
            </p>
          </div>
        ))}
      </div>
      <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
        {new Date(targetTime * 1000).toLocaleString()}
      </p>
    </div>
  );
}

function WalletButton() {
  const { login } = useWallet();
  return (
    <button
      onClick={login}
      className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
    >
      Connect Wallet to Mint
    </button>
  );
}

function MintProgress({ minted, total }: { minted: number; total: number }) {
  const pct = total > 0 ? (minted / total) * 100 : 0;
  const remaining = total - minted;
  const { theme } = useTheme();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className={clsx("text-xs uppercase tracking-wider mb-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            Supply
          </p>
          <p className="text-xl font-bold">{total.toLocaleString()}</p>
        </div>
        <div>
          <p className={clsx("text-xs uppercase tracking-wider mb-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            Minted
          </p>
          <p className="text-xl font-bold text-cyan-500">{minted.toLocaleString()}</p>
        </div>
        <div>
          <p className={clsx("text-xs uppercase tracking-wider mb-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            Remaining
          </p>
          <p className="text-xl font-bold">{remaining.toLocaleString()}</p>
        </div>
      </div>
      <div className={clsx("h-2 rounded-full overflow-hidden", theme === "dark" ? "bg-white/[0.05]" : "bg-gray-200")}>
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-1000 ease-out",
            pct >= 90
              ? "bg-gradient-to-r from-orange-500 to-red-500"
              : pct >= 50
                ? "bg-gradient-to-r from-cyan-400 to-blue-500"
                : "bg-cyan-500"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className={clsx("text-xs text-right", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
        {pct.toFixed(1)}% minted
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function MintPage() {
  const { theme } = useTheme();
  const { isConnected } = useAccount();
  const collection = useCollectionData();

  const [quantity, setQuantity] = useState(1);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Refresh data after mint
  useEffect(() => {
    if (isSuccess && collection.refetch) {
      const timer = setTimeout(() => collection.refetch(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, collection]);

  const mintPrice = collection.mintPrice;
  const mintPriceEth = formatEther(mintPrice);
  const totalCost = mintPrice * BigInt(quantity);
  const totalCostEth = formatEther(totalCost);
  const remaining = collection.maxSupply - collection.totalMinted;
  const isSoldOut = collection.isSoldOut;
  const mintStartTime = collection.mintStartTime;

  // Check if minting is live (countdown expired)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (mintStartTime > 0 && now < mintStartTime) {
      const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
      return () => clearInterval(interval);
    }
  }, [mintStartTime, now]);
  const mintLive = mintStartTime === 0 || now >= mintStartTime;

  const handleMint = useCallback(() => {
    if (!AGENTS_CONTRACT || !isConnected) return;

    writeContract({
      address: AGENTS_CONTRACT,
      abi: COLLECTION_ABI,
      functionName: "publicMint",
      args: [BigInt(quantity)],
      value: totalCost,
    });
  }, [writeContract, quantity, totalCost, isConnected]);

  const isMinting = isWritePending || isConfirming;

  // ── Not configured state ──
  if (!AGENTS_CONTRACT) {
    return (
      <div className="min-h-screen relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 tech-grid opacity-30" />
          <div className="absolute inset-0 gradient-mesh" />
        </div>
        <div className="container mx-auto px-4 py-20 relative flex items-center justify-center min-h-screen">
          <div className={clsx("glass-card text-center max-w-lg", theme === "light" && "bg-white/80")}>
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
              <Lock className="w-10 h-10 text-cyan-500" />
            </div>
            <h1 className="text-3xl font-bold mb-3">Coming Soon</h1>
            <p className={clsx("mb-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
              Clawdmint Agents collection is being prepared for deployment.
              10,000 unique AI-powered agent NFTs are coming to Base.
            </p>
            <p className={clsx("text-sm font-mono", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              STATUS: DEPLOYING...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-20" />
        <div className="absolute inset-0 gradient-mesh" />
        <div className="hero-orb hero-orb-cyan w-[600px] h-[600px] top-[-200px] right-[-200px] opacity-30" />
        <div className="hero-orb hero-orb-purple w-[400px] h-[400px] bottom-[-100px] left-[-100px] opacity-20" />
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12 relative">

        {/* ══════════════════ HERO ══════════════════ */}
        <section className="max-w-6xl mx-auto mb-16 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className={clsx(
              "px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border",
              theme === "dark"
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                : "bg-cyan-50 text-cyan-600 border-cyan-200"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block mr-2 animate-pulse" />
              {isSoldOut ? "Sold Out" : "Live Mint"}
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
              Clawdmint Agents
            </span>
          </h1>

          <p className={clsx(
            "text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed",
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          )}>
            10,000 unique AI-powered agent NFTs on Base. Free mint.
            Each agent has distinct traits, abilities, and a classified identity.
            Reveal on sold out.
          </p>

          {/* Collection preview grid — real agent SVGs */}
          <div className="flex items-center justify-center gap-3 md:gap-4 mb-8 flex-wrap">
            {[42, 137, 888, 1337, 7777, 9999].map((id, i) => (
              <div
                key={id}
                className={clsx(
                  "w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 rounded-2xl overflow-hidden ring-2 transition-all duration-300 hover:scale-110 hover:ring-4 hover:-translate-y-1 hover:shadow-lg group",
                  theme === "dark"
                    ? "ring-white/[0.08] hover:ring-cyan-500/40 bg-[#0a0e1a] hover:shadow-cyan-500/10"
                    : "ring-gray-200 hover:ring-cyan-400 bg-gray-50 hover:shadow-cyan-200/40"
                )}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/agents-data/images/${id}.svg`}
                  alt={`Agent #${id}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
          <p className={clsx(
            "text-xs font-mono mb-2",
            theme === "dark" ? "text-gray-600" : "text-gray-400"
          )}>
            Showing 6 of 10,000 unique agents
          </p>
        </section>

        {/* ══════════════════ MINT + STATS ══════════════════ */}
        <section className="max-w-4xl mx-auto mb-20">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Progress */}
            <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-500" />
                Mint Progress
              </h2>
              <MintProgress
                minted={!collection.loading ? collection.totalMinted : 0}
                total={!collection.loading ? collection.maxSupply : MAX_SUPPLY}
              />

              {/* Contract link */}
              <div className={clsx(
                "mt-6 pt-4 border-t flex items-center justify-between text-sm",
                theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
              )}>
                <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>Contract</span>
                <a
                  href={`${explorerUrl}/address/${AGENTS_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-500 hover:underline font-mono inline-flex items-center gap-1"
                >
                  {AGENTS_CONTRACT.slice(0, 6)}...{AGENTS_CONTRACT.slice(-4)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Right: Mint Card */}
            <div className={clsx(
              "glass-card relative overflow-hidden",
              theme === "light" && "bg-white/80"
            )}>
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/[0.03] to-transparent -translate-x-full animate-shimmer pointer-events-none" />

              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-500" />
                Mint Agent
              </h2>

              <div className="space-y-4">
                {/* Free Mint Badge */}
                <div className="text-center py-3">
                  <span className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    FREE MINT
                  </span>
                </div>

                {/* Platform Fee */}
                <div className={clsx(
                  "flex items-center justify-between px-3 py-2.5 rounded-xl",
                  theme === "dark" ? "bg-white/[0.03]" : "bg-gray-50"
                )}>
                  <span className={clsx("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                    Platform Fee
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-bold">{mintPriceEth} ETH</span>
                    <span className={clsx("text-xs ml-1.5", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                      (~${PLATFORM_FEE_USD.toFixed(2)})
                    </span>
                  </div>
                </div>

                {!isSoldOut && (
                  <>
                    {/* Quantity */}
                    <div className="flex items-center justify-between">
                      <span className={clsx("text-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                        Quantity
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors border",
                            theme === "dark"
                              ? "border-white/[0.06] hover:bg-white/[0.06]"
                              : "border-gray-200 hover:bg-gray-100"
                          )}
                          disabled={quantity <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-xl font-bold w-12 text-center font-mono">{quantity}</span>
                        <button
                          onClick={() => setQuantity(Math.min(MAX_PER_TX, remaining, quantity + 1))}
                          className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors border",
                            theme === "dark"
                              ? "border-white/[0.06] hover:bg-white/[0.06]"
                              : "border-gray-200 hover:bg-gray-100"
                          )}
                          disabled={quantity >= MAX_PER_TX || quantity >= remaining}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Total */}
                    <div className={clsx(
                      "flex items-center justify-between pt-4 border-t",
                      theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
                    )}>
                      <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Total</span>
                      <div className="text-right">
                        <span className="text-2xl font-bold">{totalCostEth} ETH</span>
                        <p className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                          ~${(PLATFORM_FEE_USD * quantity).toFixed(2)} platform fee
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Countdown Timer */}
                {mintStartTime > 0 && !mintLive && (
                  <CountdownTimer targetTime={mintStartTime} />
                )}

                {/* Mint Button */}
                {!isConnected ? (
                  <WalletButton />
                ) : isSoldOut ? (
                  <button disabled className="w-full py-4 rounded-2xl font-bold text-lg bg-red-500/20 text-red-400 cursor-not-allowed border border-red-500/20">
                    Sold Out
                  </button>
                ) : !mintLive ? (
                  <button disabled className={clsx(
                    "w-full py-4 rounded-2xl font-bold text-lg cursor-not-allowed flex items-center justify-center gap-2 border",
                    theme === "dark"
                      ? "bg-white/[0.03] text-gray-500 border-white/5"
                      : "bg-gray-100 text-gray-400 border-gray-200"
                  )}>
                    <Clock className="w-5 h-5" />
                    Minting Opens Soon
                  </button>
                ) : (
                  <button
                    onClick={handleMint}
                    disabled={isMinting}
                    className={clsx(
                      "w-full py-4 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-2",
                      isMinting
                        ? "bg-gray-500/20 text-gray-400 cursor-wait"
                        : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98]"
                    )}
                  >
                    <Sparkles className="w-5 h-5" />
                    {isConfirming
                      ? "Confirming..."
                      : isWritePending
                        ? "Approve in Wallet..."
                        : `Mint ${quantity} Agent${quantity > 1 ? "s" : ""}`}
                  </button>
                )}

                {/* Success */}
                {isSuccess && txHash && (
                  <div className="p-5 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-2xl animate-in zoom-in-95 fade-in duration-500">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-emerald-300 font-bold text-lg">Mint Successful!</p>
                        <p className="text-emerald-400/70 text-xs">
                          {quantity} Agent{quantity > 1 ? "s" : ""} minted. Reveal on sold out.
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${explorerUrl}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm transition-all"
                    >
                      View Transaction
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════ TRAITS & RARITY ══════════════════ */}
        <section className="max-w-4xl mx-auto mb-20">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
            Traits & Rarity
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Trait Categories */}
            <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-500" />
                Trait Categories
              </h3>
              <div className="space-y-3">
                {TRAIT_CATEGORIES.map(({ name, icon: Icon, count }) => (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100"
                      )}>
                        <Icon className="w-4 h-4 text-cyan-500" />
                      </div>
                      <span className="font-medium text-sm">{name}</span>
                    </div>
                    <span className={clsx("text-sm font-mono", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                      {count} variants
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rarity Tiers */}
            <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                Rarity Tiers
              </h3>
              <div className="space-y-3">
                {RARITY_TIERS.map(({ name, pct, color, bg, border }) => (
                  <div key={name} className={clsx("flex items-center justify-between px-3 py-2 rounded-lg border", bg, border)}>
                    <span className={clsx("font-medium text-sm", color)}>{name}</span>
                    <span className={clsx("text-sm font-mono", color)}>{pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════ HOW IT WORKS ══════════════════ */}
        <section className="max-w-4xl mx-auto mb-20">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Mint",
                desc: "Connect your wallet and mint random agents. Each mint assigns a unique trait combination.",
                icon: Sparkles,
              },
              {
                step: "02",
                title: "Classify",
                desc: "Before reveal, all agents show as CLASSIFIED. Their true identity is hidden on-chain.",
                icon: Lock,
              },
              {
                step: "03",
                title: "Reveal",
                desc: "When the collection sells out, all 10,000 agents are revealed simultaneously.",
                icon: Eye,
              },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div
                key={step}
                className={clsx("glass-card text-center group hover:scale-105 transition-transform", theme === "light" && "bg-white/80")}
              >
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center group-hover:from-cyan-500/30 group-hover:to-blue-600/30 transition-colors">
                  <Icon className="w-6 h-6 text-cyan-500" />
                </div>
                <p className="text-cyan-500 font-mono text-xs mb-2">{step}</p>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className={clsx("text-sm leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════ FAQ ══════════════════ */}
        <section className="max-w-2xl mx-auto mb-20">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">FAQ</h2>

          {[
            {
              q: "What are Clawdmint Agents?",
              a: "Clawdmint Agents are 10,000 unique SVG NFTs on Base. Each agent is a procedurally generated robot with 8+ trait categories, 6 rarity tiers, and a unique classified identity. They feature advanced pseudo-3D rendering with metallic effects, energy glows, and dynamic backgrounds.",
            },
            {
              q: "How does the reveal work?",
              a: "Before the collection sells out, all minted NFTs show a CLASSIFIED placeholder. Once all 10,000 are minted, the metadata is updated to reveal each agent's true traits, name, and appearance. Metadata is then permanently frozen on-chain.",
            },
            {
              q: "What chain is this on?",
              a: "Clawdmint Agents live on Base (Ethereum L2). You need ETH on Base to mint. Gas fees on Base are typically less than $0.01.",
            },
            {
              q: "How many can I mint per transaction?",
              a: `You can mint up to ${MAX_PER_TX} agents per transaction. There is no per-wallet limit.`,
            },
            {
              q: "What are Mythic agents?",
              a: "Mythic agents are the rarest tier at 0.5% chance. They have unique 1-of-1 names inspired by the Base ecosystem (like Jesse, Zora, etc.) and come with top-tier accent colors, clearance levels, and combat modifications.",
            },
          ].map(({ q, a }, i) => (
            <div
              key={i}
              className={clsx(
                "border-b last:border-0",
                theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
              )}
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className={clsx(
                  "w-full flex items-center justify-between py-5 text-left transition-colors",
                  theme === "dark" ? "hover:text-white" : "hover:text-gray-900",
                  expandedFaq === i
                    ? ""
                    : theme === "dark" ? "text-gray-300" : "text-gray-700"
                )}
              >
                <span className="font-semibold pr-4">{q}</span>
                <ChevronDown className={clsx(
                  "w-5 h-5 flex-shrink-0 transition-transform",
                  expandedFaq === i && "rotate-180"
                )} />
              </button>
              {expandedFaq === i && (
                <div className={clsx(
                  "pb-5 text-sm leading-relaxed animate-in slide-in-from-top-2 fade-in duration-200",
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                )}>
                  {a}
                </div>
              )}
            </div>
          ))}
        </section>

        {/* ══════════════════ MARKETPLACES ══════════════════ */}
        {AGENTS_CONTRACT && (
          <section className="max-w-2xl mx-auto mb-12 text-center">
            <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
              <div className="flex items-center justify-center gap-2 mb-4">
                <ShoppingBag className="w-5 h-5 text-cyan-500" />
                <h3 className="font-bold">Secondary Market</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <a
                  href={isMainnet
                    ? `https://opensea.io/assets/base/${AGENTS_CONTRACT}`
                    : `https://testnets.opensea.io/assets/base-sepolia/${AGENTS_CONTRACT}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
                    theme === "dark"
                      ? "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 text-blue-400"
                      : "bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-600"
                  )}
                >
                  OpenSea
                </a>
                {isMainnet && (
                  <a
                    href={`https://zora.co/collect/base:${AGENTS_CONTRACT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
                      theme === "dark"
                        ? "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 text-purple-400"
                        : "bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-600"
                    )}
                  >
                    Zora
                  </a>
                )}
                <a
                  href={`https://rarible.com/collection/base/${AGENTS_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
                    theme === "dark"
                      ? "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20 text-yellow-400"
                      : "bg-yellow-50 border-yellow-200 hover:bg-yellow-100 text-yellow-600"
                  )}
                >
                  Rarible
                </a>
                {isMainnet && (
                  <a
                    href={`https://element.market/collections/base-${AGENTS_CONTRACT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
                      theme === "dark"
                        ? "bg-pink-500/10 border-pink-500/20 hover:bg-pink-500/20 text-pink-400"
                        : "bg-pink-50 border-pink-200 hover:bg-pink-100 text-pink-600"
                    )}
                  >
                    Element
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
