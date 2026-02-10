"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { useWallet } from "@/components/wallet-context";
import { COLLECTION_ABI } from "@/lib/contracts";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import Link from "next/link";
import {
  ExternalLink, Minus, Plus, CheckCircle,
  Shield, Cpu, Eye, Zap, Target, Layers, ChevronDown, Lock, Clock, Terminal,
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

// Deployer agent page
const DEPLOYER_AGENT_URL = "/agents/cmle5y1wr000058gfxgutjfa9";

// Deterministic number formatting (avoids hydration mismatch from toLocaleString)
function fmtNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ═══════════════════════════════════════════════════════════════════════
// RARITY DATA
// ═══════════════════════════════════════════════════════════════════════

const RARITY_TIERS = [
  { name: "Common", pct: "45%", color: "text-gray-500" },
  { name: "Uncommon", pct: "25%", color: "text-green-500" },
  { name: "Rare", pct: "18%", color: "text-blue-400" },
  { name: "Epic", pct: "8%", color: "text-purple-400" },
  { name: "Legendary", pct: "3.5%", color: "text-yellow-400" },
  { name: "Mythic", pct: "0.5%", color: "text-red-400" },
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
  mintStartTime: number;
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
    const envMintStart = parseInt(process.env["NEXT_PUBLIC_MINT_START_TIME"] || "0", 10);
    if (!data || isLoading) {
      return {
        loading: true, name: "Clawdmint Agents", maxSupply: MAX_SUPPLY,
        mintPrice: BigInt(0), totalMinted: 0, isSoldOut: false,
        mintStartTime: envMintStart, refetch,
      };
    }
    const [nameRes, maxSupplyRes, mintPriceRes, totalMintedRes, isSoldOutRes] = data;
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
// TERMINAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function TerminalWindow({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-emerald-500/20 bg-[#0a0f0a] overflow-hidden", className)}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/10 bg-emerald-500/[0.03]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
        </div>
        <span className="font-mono text-[10px] text-emerald-500/60 ml-2">{title}</span>
      </div>
      {/* Content */}
      <div className="p-5 font-mono text-sm">{children}</div>
    </div>
  );
}

function TermLine({ prefix = ">", color = "text-emerald-400", children }: { prefix?: string; color?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 leading-relaxed">
      <span className={clsx("flex-shrink-0", color)}>{prefix}</span>
      <span className="text-gray-300">{children}</span>
    </div>
  );
}

function BlinkCursor() {
  return <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-0.5" />;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function MintPage() {
  const { theme } = useTheme();
  const { isConnected } = useAccount();
  const collection = useCollectionData();
  const { login } = useWallet();

  const [quantity, setQuantity] = useState(1);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && collection.refetch) {
      const timer = setTimeout(() => collection.refetch(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, collection]);

  const mintPrice = collection.mintPrice;
  const totalCost = mintPrice * BigInt(quantity);
  const remaining = collection.maxSupply - collection.totalMinted;
  const isSoldOut = collection.isSoldOut;
  const mintStartTime = collection.mintStartTime;

  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const isComingSoon = mintStartTime === 0;
  useEffect(() => {
    if (mintStartTime > 0 && now < mintStartTime) {
      const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
      return () => clearInterval(interval);
    }
  }, [mintStartTime, now]);
  const mintLive = !isComingSoon && mintStartTime > 0 && now >= mintStartTime;

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
  const pct = collection.maxSupply > 0 ? (collection.totalMinted / collection.maxSupply) * 100 : 0;

  // Not configured
  if (!AGENTS_CONTRACT) {
    return (
      <div className="min-h-screen bg-[#050a05] flex items-center justify-center p-4">
        <TerminalWindow title="clawdmint — error">
          <TermLine prefix="$" color="text-red-400">ERROR: Collection contract not configured</TermLine>
          <TermLine prefix=">" color="text-gray-600">Awaiting deployment...</TermLine>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050a05] relative">
      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none z-10 opacity-[0.015]" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.03) 2px, rgba(0,255,0,0.03) 4px)",
      }} />
      {/* Subtle glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-500/[0.03] rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 py-8 md:py-12 relative z-20 max-w-5xl">

        {/* ══════════════════ HEADER ══════════════════ */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] text-emerald-400 uppercase tracking-wider">
              {isSoldOut ? "SOLD_OUT" : isComingSoon ? "COMING_SOON" : mintLive ? "MINT_ACTIVE" : "COUNTDOWN"}
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-mono font-bold mb-4 text-emerald-400 tracking-tight">
            CLAWDMINT_AGENTS
          </h1>

          <p className="text-gray-500 font-mono text-sm max-w-xl mx-auto leading-relaxed mb-6">
            10,000 unique AI-powered agent NFTs on Base. Free mint.
            Random assignment. Reveal on sold out.
          </p>

          {/* Deployer link */}
          <Link
            href={DEPLOYER_AGENT_URL}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08] transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Cpu className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="font-mono text-xs text-emerald-400/80">deployed_by: <span className="text-emerald-400">agent_lila</span></span>
          </Link>
        </div>

        {/* ══════════════════ NFT CAROUSEL ══════════════════ */}
        <AgentCarousel />

        {/* ══════════════════ MAIN GRID ══════════════════ */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">

          {/* LEFT: STATUS TERMINAL */}
          <TerminalWindow title="clawdmint — status">
            <div className="space-y-2 mb-5">
              <TermLine prefix="$">cat /collection/status</TermLine>
              <div className="h-px bg-emerald-500/10 my-2" />
              <TermLine prefix=" ">collection: <span className="text-emerald-400">Clawdmint Agents</span></TermLine>
              <TermLine prefix=" ">network:    <span className="text-cyan-400">Base L2</span></TermLine>
              <TermLine prefix=" ">standard:   <span className="text-gray-400">ERC-721</span></TermLine>
              <TermLine prefix=" ">supply:     <span className="text-white">{fmtNum(collection.maxSupply)}</span></TermLine>
              <TermLine prefix=" ">minted:     <span className="text-emerald-400">{fmtNum(collection.totalMinted)}</span></TermLine>
              <TermLine prefix=" ">remaining:  <span className="text-yellow-400">{fmtNum(remaining)}</span></TermLine>
              <TermLine prefix=" ">price:      <span className="text-emerald-400">FREE</span></TermLine>
            </div>

            {/* Progress bar — terminal style */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
                <span>progress</span>
                <span>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-emerald-500/[0.06] rounded border border-emerald-500/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-500/40 transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-700 mt-1 font-mono">
                <span>0</span>
                <span>{fmtNum(collection.maxSupply)}</span>
              </div>
            </div>

            {/* Contract */}
            <div className="flex items-center justify-between text-xs border-t border-emerald-500/10 pt-3">
              <span className="text-gray-600">contract</span>
              <a
                href={`${explorerUrl}/address/${AGENTS_CONTRACT}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500/70 hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
              >
                {AGENTS_CONTRACT.slice(0, 6)}...{AGENTS_CONTRACT.slice(-4)}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </TerminalWindow>

          {/* RIGHT: MINT TERMINAL */}
          <TerminalWindow title="clawdmint — mint">
            <div className="space-y-4">
              <TermLine prefix="$">./mint --collection=agents</TermLine>

              {/* Free Mint */}
              <div className="text-center py-3 border border-emerald-500/15 rounded-lg bg-emerald-500/[0.03]">
                <span className="font-mono text-2xl font-bold text-emerald-400">FREE MINT</span>
              </div>

              {!isSoldOut && (
                <>
                  {/* Quantity */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">quantity:</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-8 h-8 rounded border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                        disabled={quantity <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xl font-bold text-emerald-400 w-8 text-center">{quantity}</span>
                      <button
                        onClick={() => setQuantity(Math.min(MAX_PER_TX, remaining, quantity + 1))}
                        className="w-8 h-8 rounded border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                        disabled={quantity >= MAX_PER_TX || quantity >= remaining}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Coming Soon */}
              {isComingSoon && (
                <div className="text-center py-4 border border-dashed border-emerald-500/20 rounded-lg">
                  <Clock className="w-5 h-5 mx-auto mb-2 text-emerald-500/50" />
                  <p className="text-emerald-400 font-mono text-sm font-bold">COMING_SOON</p>
                  <p className="text-gray-600 text-xs mt-1">mint date will be announced</p>
                </div>
              )}

              {/* Countdown */}
              {mintStartTime > 0 && !mintLive && (
                <CountdownTerminal targetTime={mintStartTime} />
              )}

              {/* Mint Button */}
              {!isConnected ? (
                <button
                  onClick={login}
                  className="w-full py-3 rounded-lg font-mono font-bold text-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all"
                >
                  $ connect_wallet<BlinkCursor />
                </button>
              ) : isSoldOut ? (
                <div className="w-full py-3 rounded-lg font-mono text-sm text-center bg-red-500/10 border border-red-500/20 text-red-400">
                  STATUS: SOLD_OUT
                </div>
              ) : !mintLive ? (
                <button disabled className="w-full py-3 rounded-lg font-mono text-sm bg-gray-500/5 border border-gray-500/10 text-gray-600 cursor-not-allowed">
                  $ mint --status=pending
                </button>
              ) : (
                <button
                  onClick={handleMint}
                  disabled={isMinting}
                  className={clsx(
                    "w-full py-3 rounded-lg font-mono font-bold text-sm transition-all",
                    isMinting
                      ? "bg-gray-500/10 border border-gray-500/20 text-gray-500 cursor-wait"
                      : "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/10"
                  )}
                >
                  {isConfirming
                    ? "$ confirming..."
                    : isWritePending
                      ? "$ awaiting_wallet..."
                      : `$ mint --qty=${quantity}`}
                  {!isMinting && <BlinkCursor />}
                </button>
              )}

              {/* Success */}
              {isSuccess && txHash && (
                <div className="p-4 border border-emerald-500/30 rounded-lg bg-emerald-500/[0.05] space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 text-sm font-bold">MINT_SUCCESS</span>
                  </div>
                  <TermLine prefix=" " color="text-gray-600">{quantity} agent(s) minted. Reveal on sold out.</TermLine>
                  <a
                    href={`${explorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-500/70 hover:text-emerald-400 text-xs transition-colors"
                  >
                    view_tx <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </TerminalWindow>
        </div>

        {/* ══════════════════ TRAITS & RARITY ══════════════════ */}
        <TerminalWindow title="clawdmint — traits" className="mb-12">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Trait Categories */}
            <div>
              <TermLine prefix="$" color="text-cyan-400">ls /traits/categories</TermLine>
              <div className="mt-3 space-y-1.5">
                {TRAIT_CATEGORIES.map(({ name, icon: Icon, count }) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-emerald-500/50" />
                      <span className="text-gray-400">{name}</span>
                    </div>
                    <span className="text-emerald-500/60">{count} variants</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rarity */}
            <div>
              <TermLine prefix="$" color="text-cyan-400">cat /traits/rarity</TermLine>
              <div className="mt-3 space-y-1.5">
                {RARITY_TIERS.map(({ name, pct, color }) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className={color}>{name}</span>
                    <span className="text-gray-600">{pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TerminalWindow>

        {/* ══════════════════ HOW IT WORKS ══════════════════ */}
        <TerminalWindow title="clawdmint — guide" className="mb-12">
          <TermLine prefix="$" color="text-cyan-400">cat /docs/how-it-works</TermLine>
          <div className="mt-4 space-y-4">
            {[
              { step: "01", cmd: "mint", desc: "Connect wallet. Mint random agents. Each mint = unique trait combination." },
              { step: "02", cmd: "classify", desc: "Before reveal, all agents show CLASSIFIED. True identity is hidden." },
              { step: "03", cmd: "reveal", desc: "Collection sells out → all 10,000 agents revealed simultaneously." },
            ].map(({ step, cmd, desc }) => (
              <div key={step} className="flex gap-3">
                <span className="text-emerald-500/40 text-xs mt-0.5">{step}</span>
                <div>
                  <span className="text-emerald-400 text-sm font-bold">{cmd}</span>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </TerminalWindow>

        {/* ══════════════════ FAQ ══════════════════ */}
        <TerminalWindow title="clawdmint — faq" className="mb-12">
          <TermLine prefix="$" color="text-cyan-400">man clawdmint-agents</TermLine>
          <div className="mt-3">
            {[
              { q: "What are Clawdmint Agents?", a: "10,000 unique SVG NFTs on Base. Procedurally generated robots with 8+ trait categories, 6 rarity tiers, and unique classified identities." },
              { q: "How does the reveal work?", a: "Pre-reveal: all NFTs show CLASSIFIED placeholder. Post sold-out: metadata updated to reveal true traits. Then permanently frozen on-chain." },
              { q: "What chain?", a: "Base (Ethereum L2). Gas fees < $0.01." },
              { q: "Max per transaction?", a: `${MAX_PER_TX} agents per tx. No per-wallet limit.` },
              { q: "What are Mythic agents?", a: "Rarest tier (0.5%). Unique 1-of-1 names from the Base ecosystem. Top-tier stats and combat modifications." },
            ].map(({ q, a }, i) => (
              <div key={i} className="border-b border-emerald-500/[0.06] last:border-0">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full flex items-center justify-between py-3 text-left text-sm hover:text-emerald-400 transition-colors text-gray-400"
                >
                  <span>{q}</span>
                  <ChevronDown className={clsx("w-4 h-4 flex-shrink-0 transition-transform text-emerald-500/30", expandedFaq === i && "rotate-180")} />
                </button>
                {expandedFaq === i && (
                  <p className="pb-3 text-xs text-gray-600 leading-relaxed">{a}</p>
                )}
              </div>
            ))}
          </div>
        </TerminalWindow>

        {/* ══════════════════ MARKETPLACES ══════════════════ */}
        {AGENTS_CONTRACT && (
          <div className="text-center mb-8">
            <p className="font-mono text-xs text-gray-600 mb-3">secondary_market:</p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {[
                { name: "OpenSea", url: isMainnet ? `https://opensea.io/assets/base/${AGENTS_CONTRACT}` : `https://testnets.opensea.io/assets/base-sepolia/${AGENTS_CONTRACT}` },
                ...(isMainnet ? [{ name: "Zora", url: `https://zora.co/collect/base:${AGENTS_CONTRACT}` }] : []),
                { name: "Rarible", url: `https://rarible.com/collection/base/${AGENTS_CONTRACT}` },
                ...(isMainnet ? [{ name: "Element", url: `https://element.market/collections/base-${AGENTS_CONTRACT}` }] : []),
              ].map(({ name, url }) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.02] text-emerald-500/60 hover:text-emerald-400 hover:border-emerald-500/30 transition-all font-mono text-xs"
                >
                  {name}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN (TERMINAL STYLE)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// AGENT CAROUSEL — cycles through 10 NFT images
// ═══════════════════════════════════════════════════════════════════════

const CAROUSEL_IDS = [42, 137, 256, 888, 1337, 2048, 4096, 5555, 7777, 9999];

function AgentCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % CAROUSEL_IDS.length);
        setIsTransitioning(false);
      }, 300);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center mb-10">
      {/* Main showcase */}
      <div className="relative w-44 h-44 md:w-56 md:h-56 mb-4">
        {/* Glow behind active image */}
        <div className="absolute inset-0 rounded-2xl bg-emerald-500/10 blur-xl" />
        {/* Frame */}
        <div className="relative w-full h-full rounded-2xl border-2 border-emerald-500/30 bg-[#060d06] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/agents-data/images/${CAROUSEL_IDS[activeIndex]}.svg`}
            alt={`Agent #${CAROUSEL_IDS[activeIndex]}`}
            className={clsx(
              "w-full h-full object-cover transition-all duration-300",
              isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
            )}
          />
          {/* Scanline overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-10" style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.05) 2px, rgba(0,255,0,0.05) 4px)",
          }} />
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="flex items-center gap-1.5">
        {CAROUSEL_IDS.map((id, i) => (
          <button
            key={id}
            onClick={() => { setIsTransitioning(true); setTimeout(() => { setActiveIndex(i); setIsTransitioning(false); }, 200); }}
            className={clsx(
              "w-8 h-8 md:w-10 md:h-10 rounded-lg overflow-hidden border-2 transition-all duration-200",
              i === activeIndex
                ? "border-emerald-400 scale-110 shadow-lg shadow-emerald-500/20"
                : "border-emerald-500/10 opacity-40 hover:opacity-70 hover:border-emerald-500/30"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/agents-data/images/${id}.svg`}
              alt={`Agent #${id}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN (TERMINAL STYLE)
// ═══════════════════════════════════════════════════════════════════════

function CountdownTerminal({ targetTime }: { targetTime: number }) {
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0, expired: false });

  useEffect(() => {
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const diff = targetTime - now;
      if (diff <= 0) { setTimeLeft({ h: 0, m: 0, s: 0, expired: true }); return; }
      setTimeLeft({ h: Math.floor(diff / 3600), m: Math.floor((diff % 3600) / 60), s: diff % 60, expired: false });
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (timeLeft.expired) return null;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="text-center py-3 border border-emerald-500/15 rounded-lg bg-emerald-500/[0.02]">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">mint opens in</p>
      <div className="flex items-center justify-center gap-1 font-mono text-2xl font-bold text-emerald-400">
        <span>{pad(timeLeft.h)}</span><span className="text-emerald-500/30">:</span>
        <span>{pad(timeLeft.m)}</span><span className="text-emerald-500/30">:</span>
        <span>{pad(timeLeft.s)}</span>
      </div>
    </div>
  );
}
