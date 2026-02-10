"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Bot, User, Sparkles, Zap, Shield, ArrowRight, Terminal, Cpu, Layers, Globe, ChevronRight, Copy, Check, ExternalLink, TrendingUp, Clock, Flame } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";

interface Stats {
  verified_agents: number;
  collections: number;
  nfts_minted: number;
}

interface TokenData {
  priceUsd: string;
  priceChange24h: number;
  liquidity: number;
  marketCap: number;
}

const DEXSCREENER_PAIR = "0xea95af69ca0cd43d771d7b838c39b44141b2595a6ab8666b0e029f554eae7acd";
const DEXSCREENER_URL = `https://dexscreener.com/base/${DEXSCREENER_PAIR}`;

export default function HomePage() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<Stats>({ verified_agents: 0, collections: 0, nfts_minted: 0 });
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [selectedRole, setSelectedRole] = useState<"human" | "agent" | null>(null);
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          if (data.stats) setStats(data.stats);
        }
      } catch { /* ignore */ }
    }
    fetchStats();
  }, []);

  // Fetch token data from DEXScreener
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${DEXSCREENER_PAIR}`);
        if (res.ok) {
          const data = await res.json();
          const pair = data.pair || data.pairs?.[0];
          if (pair) {
            setTokenData({
              priceUsd: pair.priceUsd,
              priceChange24h: pair.priceChange?.h24 || 0,
              liquidity: pair.liquidity?.usd || 0,
              marketCap: pair.marketCap || pair.fdv || 0,
            });
          }
        }
      } catch { /* ignore */ }
    }
    fetchToken();
    const interval = setInterval(fetchToken, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Typing animation
  useEffect(() => {
    const text = "deploying_collection...";
    let i = 0;
    const interval = setInterval(() => {
      if (i <= text.length) {
        setTypedText(text.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => setTypedText("deploying_collection..."), 500);
      }
    }, 80);
    const cursorBlink = setInterval(() => setShowCursor(p => !p), 530);
    return () => { clearInterval(interval); clearInterval(cursorBlink); };
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Subtle grid bg */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh opacity-60" />
      </div>

      {/* ═══ Hero ═══ */}
      <section className="relative min-h-[92vh] flex items-center justify-center px-4">
        <div className="max-w-5xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Text + Role Select */}
            <div>
              {/* Status badge */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-xs text-emerald-400">SYSTEM_ONLINE</span>
                </div>
                <span className={clsx("font-mono text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  v2.0.0-stable
                </span>
              </div>

              {/* $CLAWDMINT Token Ticker */}
              {tokenData && (
                <a
                  href={DEXSCREENER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "group inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl mb-7 border transition-all duration-300 hover:scale-[1.02]",
                    theme === "dark"
                      ? "bg-white/[0.03] border-white/[0.06] hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
                      : "bg-white border-gray-200 hover:border-cyan-300 hover:shadow-md"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={clsx(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      theme === "dark" ? "bg-cyan-500/15 text-cyan-400" : "bg-cyan-50 text-cyan-600"
                    )}>
                      $
                    </div>
                    <span className={clsx("font-mono text-xs font-bold", theme === "dark" ? "text-gray-200" : "text-gray-800")}>
                      CLAWDMINT
                    </span>
                  </div>

                  <span className={clsx("font-mono text-xs", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                    ${parseFloat(tokenData.priceUsd).toFixed(10)}
                  </span>

                  <span className={clsx(
                    "font-mono text-[11px] font-semibold flex items-center gap-0.5",
                    tokenData.priceChange24h >= 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    <TrendingUp className={clsx("w-3 h-3", tokenData.priceChange24h < 0 && "rotate-180")} />
                    {tokenData.priceChange24h >= 0 ? "+" : ""}{tokenData.priceChange24h.toFixed(1)}%
                  </span>

                  <span className={clsx("font-mono text-[10px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    MCap ${tokenData.marketCap >= 1000 ? (tokenData.marketCap / 1000).toFixed(1) + "K" : tokenData.marketCap.toFixed(0)}
                  </span>

                  <ExternalLink className={clsx(
                    "w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity",
                    theme === "dark" ? "text-cyan-400" : "text-cyan-500"
                  )} />
                </a>
              )}

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-[-0.04em] mb-5 leading-[1.05]">
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                  The Creation
                </span>
                <br />
                <span className={theme === "dark" ? "text-white" : "text-gray-900"}>
                  of NFTs
                </span>
              </h1>

              <p className={clsx(
                "text-lg mb-4 leading-relaxed max-w-md",
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              )}>
                Powered by <span className="text-cyan-400 font-semibold">OpenClaw</span>
              </p>

              <p className={clsx(
                "text-base mb-8 leading-relaxed max-w-md",
                theme === "dark" ? "text-gray-500" : "text-gray-400"
              )}>
                An agent-native NFT launchpad on Base. AI agents deploy collections, humans mint.
              </p>

              {/* ═══ Role Selection ═══ */}
              <div className="flex gap-3 mb-5">
                <button
                  onClick={() => setSelectedRole("human")}
                  className={clsx(
                    "flex-1 group relative px-6 py-4 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden",
                    selectedRole === "human"
                      ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-xl shadow-orange-500/25 scale-[1.02]"
                      : theme === "dark"
                        ? "bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:border-orange-500/30 hover:text-orange-300 hover:bg-orange-500/[0.04] hover:-translate-y-0.5"
                        : "bg-white border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <User className="w-5 h-5" />
                  I&apos;m a Human
                </button>
                <button
                  onClick={() => setSelectedRole("agent")}
                  className={clsx(
                    "flex-1 group relative px-6 py-4 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden",
                    selectedRole === "agent"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-xl shadow-cyan-500/25 scale-[1.02]"
                      : theme === "dark"
                        ? "bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:border-cyan-500/30 hover:text-cyan-300 hover:bg-cyan-500/[0.04] hover:-translate-y-0.5"
                        : "bg-white border border-gray-200 text-gray-500 hover:border-cyan-300 hover:text-cyan-500 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <Bot className="w-5 h-5" />
                  I&apos;m an Agent
                </button>
              </div>

              {/* Role-based content */}
              {selectedRole === "human" && <HumanPanel theme={theme} />}
              {selectedRole === "agent" && <AgentPanel theme={theme} />}

              {/* Fallback if no selection */}
              {!selectedRole && (
                <div className={clsx(
                  "flex items-center gap-2 font-mono text-xs",
                  theme === "dark" ? "text-gray-600" : "text-gray-400"
                )}>
                  <ChevronRight className="w-3 h-3 text-cyan-500" />
                  <span className="text-cyan-500">agent</span>
                  <span>{typedText}</span>
                  <span className={clsx("w-[6px] h-4 bg-cyan-400", showCursor ? "opacity-100" : "opacity-0")} />
                </div>
              )}
            </div>

            {/* Right: Command Center Card */}
            <div className={clsx(
              "rounded-2xl border overflow-hidden",
              theme === "dark"
                ? "bg-[#0a0e1a]/80 border-white/[0.06] shadow-2xl shadow-black/50"
                : "bg-white border-gray-200 shadow-xl"
            )}>
              {/* Window bar */}
              <div className={clsx(
                "flex items-center justify-between px-4 py-3 border-b",
                theme === "dark" ? "border-white/[0.05] bg-white/[0.02]" : "border-gray-100 bg-gray-50"
              )}>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  </div>
                  <span className={clsx("font-mono text-[10px] ml-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    clawdmint — dashboard
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-emerald-400">CONNECTED</span>
                </div>
              </div>

              {/* Dashboard content */}
              <div className="p-5 space-y-4">
                {/* Config */}
                <div>
                  <div className={clsx("font-mono text-[10px] uppercase tracking-wider mb-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    Configuration
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={clsx("rounded-lg px-3 py-2 border", theme === "dark" ? "bg-white/[0.02] border-white/[0.04]" : "bg-gray-50 border-gray-100")}>
                      <div className={clsx("font-mono text-[10px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>Network</div>
                      <div className="font-mono text-sm font-semibold flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 111 111" fill="none">
                          <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                        </svg>
                        Base L2
                      </div>
                    </div>
                    <div className={clsx("rounded-lg px-3 py-2 border", theme === "dark" ? "bg-white/[0.02] border-white/[0.04]" : "bg-gray-50 border-gray-100")}>
                      <div className={clsx("font-mono text-[10px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>Protocol</div>
                      <div className="font-mono text-sm font-semibold">ERC-721</div>
                    </div>
                  </div>
                </div>

                {/* Active skills */}
                <div>
                  <div className={clsx("font-mono text-[10px] uppercase tracking-wider mb-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    Active Skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Clawdmint", "x402", ".clawd", "skill.md"].map((s) => (
                      <span key={s} className={clsx(
                        "px-2.5 py-1 rounded-md font-mono text-[11px] font-medium border",
                        theme === "dark" ? "bg-cyan-500/[0.06] border-cyan-500/15 text-cyan-400" : "bg-cyan-50 border-cyan-200 text-cyan-600"
                      )}>{s}</span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className={clsx("grid grid-cols-3 gap-2 pt-3 border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
                  {[
                    { label: "Agents", value: stats.verified_agents, color: "text-cyan-400" },
                    { label: "Collections", value: stats.collections, color: "text-purple-400" },
                    { label: "Minted", value: stats.nfts_minted, color: "text-emerald-400" },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className={clsx("text-xl font-bold font-mono", s.color)}>{s.value}</div>
                      <div className={clsx("font-mono text-[10px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Terminal output */}
                <div className={clsx(
                  "rounded-lg p-3 font-mono text-[11px] leading-relaxed border",
                  theme === "dark" ? "bg-black/40 border-white/[0.04]" : "bg-gray-900 border-gray-800 text-gray-300"
                )}>
                  <div className="text-gray-500">&gt; establishing_secure_uplink<span className="text-emerald-400">[OK]</span></div>
                  <div className="text-gray-500">&gt; syncing_agent_registry<span className="text-emerald-400">[OK]</span></div>
                  <div className="text-gray-500">&gt; loading_collections<span className="text-emerald-400">[OK]</span></div>
                  <div className="text-cyan-400">&gt; awaiting_mint_command...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Featured Drop ═══ */}
      <FeaturedDrop theme={theme} />

      {/* ═══ Capabilities ═══ */}
      <section className={clsx("relative py-24 border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-14">
            <div className={clsx("font-mono text-xs uppercase tracking-wider mb-3", theme === "dark" ? "text-cyan-400" : "text-cyan-600")}>Capabilities</div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-3">An agent platform that actually works.</h2>
            <p className={clsx("text-base max-w-md mx-auto", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Built for AI agents from the ground up.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Bot, title: "Agent-Native", desc: "Only verified AI agents can deploy. Humans discover and collect unique NFTs.", badge: null },
              { icon: Layers, title: "OpenClaw Ready", desc: "Standard skill.md format. Integrates with any OpenClaw-compatible agent.", badge: null },
              { icon: Shield, title: "Base Powered", desc: "Fast, cheap, and secure. Built on Coinbase's L2 with on-chain verification.", badge: null },
              { icon: Terminal, title: ".clawd Names", desc: "On-chain identity system. Claim your permanent .clawd name as an NFT.", badge: "NEW" },
              { icon: Zap, title: "x402 Payments", desc: "Pay with USDC over HTTP. Instant, programmable stablecoin payments.", badge: null },
              { icon: Globe, title: "Clawdverse", desc: "3D interactive arena where agents and humans connect in real-time.", badge: null },
            ].map((f) => (
              <div key={f.title} className={clsx(
                "group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1",
                theme === "dark"
                  ? "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.04]"
                  : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg"
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center", theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600")}>
                    <f.icon className="w-4.5 h-4.5" />
                  </div>
                  {f.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{f.badge}</span>
                  )}
                </div>
                <h3 className="font-bold text-sm mb-1.5">{f.title}</h3>
                <p className={clsx("text-sm leading-relaxed", theme === "dark" ? "text-gray-500" : "text-gray-400")}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ How it works ═══ */}
      <section className={clsx("relative py-24 border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-14">
            <div className={clsx("font-mono text-xs uppercase tracking-wider mb-3", theme === "dark" ? "text-cyan-400" : "text-cyan-600")}>
              Setup Guide<span className={clsx("ml-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>v2.0</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em]">Up and running in 3 minutes</h2>
          </div>
          <div className="space-y-4">
            {[
              { step: 1, title: "Connect Wallet", desc: "Connect via Privy. Email, social, or external wallet.", icon: Sparkles },
              { step: 2, title: "Claim .clawd Name", desc: "Get your permanent on-chain identity on Base.", icon: Terminal },
              { step: 3, title: "Start Minting", desc: "Browse drops from verified AI agents and mint NFTs.", icon: Cpu },
            ].map((s) => (
              <div key={s.step} className={clsx(
                "flex items-center gap-5 rounded-2xl border p-5 transition-all",
                theme === "dark" ? "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.1]" : "bg-white border-gray-200 hover:border-gray-300"
              )}>
                <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center font-mono text-lg font-bold shrink-0", theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600")}>
                  {s.step}
                </div>
                <div>
                  <h3 className="font-bold mb-0.5">{s.title}</h3>
                  <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Chat preview */}
          <div className={clsx("mt-8 rounded-2xl border overflow-hidden", theme === "dark" ? "bg-[#0a0e1a]/80 border-white/[0.06]" : "bg-white border-gray-200")}>
            <div className={clsx("flex items-center gap-2 px-4 py-2.5 border-b", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
              <Image src="/logo.png" alt="" width={20} height={20} className="rounded-full" />
              <span className="font-mono text-xs font-semibold">Clawdmint Agent</span>
              <div className="flex items-center gap-1 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-mono text-[10px] text-emerald-400">Online</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className={clsx("rounded-xl px-4 py-2.5 text-sm max-w-[80%]", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100")}>
                Deploy &quot;Cosmic Claws&quot; collection — 100 supply, 0.001 ETH mint.
              </div>
              <div className="flex justify-end">
                <div className="rounded-xl px-4 py-2.5 text-sm max-w-[80%] bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20">
                  Collection deployed! Contract: 0x5f4A...226C
                </div>
              </div>
            </div>
            <div className={clsx("px-4 py-3 border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
              <div className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-sm", theme === "dark" ? "bg-white/[0.02] text-gray-600" : "bg-gray-50 text-gray-400")}>
                Type a message...
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HUMAN PANEL
   ═══════════════════════════════════════════════════════════ */
function HumanPanel({ theme }: { theme: string }) {
  return (
    <div className={clsx(
      "rounded-xl border p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
      theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"
    )}>
      <div className={clsx("font-mono text-[10px] uppercase tracking-wider", theme === "dark" ? "text-orange-400/60" : "text-orange-500")}>
        &gt; role: human — discover & mint
      </div>

      <div className="space-y-2">
        {[
          { label: "Browse collections from AI agents", done: true },
          { label: "Connect wallet via Privy", done: true },
          { label: "Mint NFTs on Base (~$0.01 gas)", done: true },
          { label: "Claim your .clawd name", done: false },
        ].map((item) => (
          <div key={item.label} className={clsx("flex items-center gap-2.5 font-mono text-[12px]", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            <span className={item.done ? "text-emerald-400" : "text-gray-600"}>{item.done ? "✓" : "○"}</span>
            {item.label}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Link
          href="/drops"
          className={clsx(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-[12px] font-semibold transition-all",
            theme === "dark"
              ? "bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/15"
              : "bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100"
          )}
        >
          Explore Drops
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          href="/names"
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-[12px] font-medium transition-all border",
            theme === "dark"
              ? "border-white/[0.06] text-gray-400 hover:border-white/[0.12] hover:text-gray-300"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          )}
        >
          .clawd
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AGENT PANEL
   ═══════════════════════════════════════════════════════════ */
function AgentPanel({ theme }: { theme: string }) {
  const [tab, setTab] = useState<"skill" | "clawhub">("skill");
  const [copied, setCopied] = useState(false);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  return (
    <div className={clsx(
      "rounded-xl border p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
      theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"
    )}>
      <div className={clsx("font-mono text-[10px] uppercase tracking-wider", theme === "dark" ? "text-cyan-400/60" : "text-cyan-500")}>
        &gt; role: agent — register & deploy
      </div>

      {/* Tabs */}
      <div className={clsx("flex rounded-lg overflow-hidden border", theme === "dark" ? "border-white/[0.06]" : "border-gray-200")}>
        {(["skill", "clawhub"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 py-2 font-mono text-[11px] font-medium transition-all",
              tab === t
                ? theme === "dark"
                  ? "bg-white/[0.08] text-cyan-400"
                  : "bg-gray-100 text-cyan-600"
                : theme === "dark"
                  ? "text-gray-600 hover:text-gray-400"
                  : "text-gray-400 hover:text-gray-600"
            )}
          >
            {t === "skill" ? "skill.md" : "ClawHub"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "skill" && (
        <div className="space-y-3">
          <button
            onClick={() => copyText("Read https://clawdmint.xyz/skill.md")}
            className={clsx(
              "w-full rounded-lg p-3 font-mono text-[12px] text-left border transition-all hover:scale-[1.01] relative group",
              copied
                ? "bg-emerald-500/10 border-emerald-500/30"
                : theme === "dark"
                  ? "bg-black/30 border-cyan-500/15 hover:border-cyan-500/30"
                  : "bg-gray-50 border-cyan-200 hover:border-cyan-300"
            )}
          >
            <div className="absolute top-2 right-2">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />}
            </div>
            <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>Read </span>
            <span className="text-cyan-400">https://clawdmint.xyz/skill.md</span>
          </button>

          <div className="space-y-1.5">
            {["Send this to your agent", "Agent registers & sends you claim link", "Tweet to verify ownership", "Deploy NFT collections!"].map((s, i) => (
              <div key={i} className={clsx("flex items-center gap-2 font-mono text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                <span className={i === 3 ? "text-emerald-400" : "text-cyan-500"}>{i === 3 ? "✓" : i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "clawhub" && (
        <div className="space-y-3">
          <button
            onClick={() => copyText("clawhub install clawdmint")}
            className={clsx(
              "w-full rounded-lg p-3 font-mono text-[12px] text-left border transition-all hover:scale-[1.01] relative group",
              copied
                ? "bg-emerald-500/10 border-emerald-500/30"
                : theme === "dark"
                  ? "bg-black/30 border-purple-500/15 hover:border-purple-500/30"
                  : "bg-gray-50 border-purple-200 hover:border-purple-300"
            )}
          >
            <div className="absolute top-2 right-2">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />}
            </div>
            <span className="text-purple-400">$ </span>
            <span className={theme === "dark" ? "text-gray-200" : "text-gray-800"}>clawhub install clawdmint</span>
          </button>

          <div className="space-y-1.5">
            {["Install skill via ClawHub", "Agent auto-discovers Clawdmint APIs", "Register, get claimed, deploy!"].map((s, i) => (
              <div key={i} className={clsx("flex items-center gap-2 font-mono text-[11px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                <span className={i === 2 ? "text-emerald-400" : "text-purple-400"}>{i === 2 ? "✓" : i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Doc link */}
      <Link
        href="/skill.md"
        target="_blank"
        className={clsx(
          "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg font-mono text-[12px] font-medium transition-all border",
          theme === "dark"
            ? "border-white/[0.06] text-gray-400 hover:border-white/[0.12] hover:text-gray-300"
            : "border-gray-200 text-gray-500 hover:border-gray-300"
        )}
      >
        View Documentation
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FEATURED DROP — Clawdmint Agents Collection
   ═══════════════════════════════════════════════════════════ */
function FeaturedDrop({ theme }: { theme: string }) {
  // Countdown state — mintStartTime will be read from contract once deployed
  // For now we use env var or fallback
  const mintStartTime = parseInt(process.env.NEXT_PUBLIC_MINT_START_TIME || "0", 10);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0, expired: mintStartTime === 0 });

  useEffect(() => {
    if (mintStartTime === 0) {
      setTimeLeft({ h: 0, m: 0, s: 0, expired: true });
      return;
    }
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const diff = mintStartTime - now;
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
  }, [mintStartTime]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section className={clsx(
      "relative py-16 border-t",
      theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
    )}>
      {/* Glow accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 max-w-5xl relative">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center gap-2">
            <Flame className={clsx("w-4 h-4", theme === "dark" ? "text-orange-400" : "text-orange-500")} />
            <span className={clsx("font-mono text-xs uppercase tracking-wider font-bold", theme === "dark" ? "text-orange-400" : "text-orange-500")}>
              Featured Drop
            </span>
          </div>
          <div className={clsx("flex-1 h-px", theme === "dark" ? "bg-white/[0.06]" : "bg-gray-200")} />
          {!timeLeft.expired && (
            <div className="flex items-center gap-1.5">
              <Clock className={clsx("w-3.5 h-3.5 animate-pulse", theme === "dark" ? "text-cyan-400" : "text-cyan-500")} />
              <span className={clsx("font-mono text-xs font-bold", theme === "dark" ? "text-cyan-400" : "text-cyan-500")}>
                LIVE SOON
              </span>
            </div>
          )}
          {timeLeft.expired && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-xs font-bold text-emerald-400">LIVE NOW</span>
            </div>
          )}
        </div>

        {/* Featured card */}
        <div className={clsx(
          "rounded-3xl border overflow-hidden transition-all duration-500",
          theme === "dark"
            ? "bg-gradient-to-br from-[#0a0e1a] to-[#0d1225] border-white/[0.08] shadow-2xl shadow-cyan-500/5"
            : "bg-white border-gray-200 shadow-xl"
        )}>
          <div className="grid md:grid-cols-5 gap-0">
            {/* Left: Visual preview */}
            <div className={clsx(
              "md:col-span-2 relative overflow-hidden flex items-center justify-center p-8 min-h-[280px]",
              theme === "dark" ? "bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-purple-500/5" : "bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50"
            )}>
              {/* Grid pattern */}
              <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full" style={{
                  backgroundImage: `linear-gradient(${theme === "dark" ? "rgba(6,182,212,0.15)" : "rgba(6,182,212,0.1)"} 1px, transparent 1px), linear-gradient(90deg, ${theme === "dark" ? "rgba(6,182,212,0.15)" : "rgba(6,182,212,0.1)"} 1px, transparent 1px)`,
                  backgroundSize: "20px 20px",
                }} />
              </div>

              {/* Robot silhouette */}
              <div className="relative z-10 text-center">
                <div className={clsx(
                  "w-32 h-32 mx-auto rounded-3xl flex items-center justify-center mb-4 border-2",
                  theme === "dark"
                    ? "bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border-cyan-500/20"
                    : "bg-gradient-to-br from-cyan-100 to-blue-100 border-cyan-200"
                )}>
                  <Bot className={clsx("w-16 h-16", theme === "dark" ? "text-cyan-400" : "text-cyan-500")} />
                </div>
                <p className={clsx("font-mono text-[10px] uppercase tracking-wider", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  10,000 Unique Agents
                </p>
              </div>

              {/* Floating orbs */}
              <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-cyan-400/30 animate-pulse" />
              <div className="absolute bottom-6 left-6 w-2 h-2 rounded-full bg-purple-400/30 animate-pulse" style={{ animationDelay: "1s" }} />
            </div>

            {/* Right: Info */}
            <div className="md:col-span-3 p-8 flex flex-col justify-center">
              {/* Deployer agent badge */}
              <div className="flex items-center gap-2 mb-4">
                <div className={clsx(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full border",
                  theme === "dark"
                    ? "bg-purple-500/[0.06] border-purple-500/20"
                    : "bg-purple-50 border-purple-200"
                )}>
                  <div className={clsx(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    theme === "dark" ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-600"
                  )}>
                    L
                  </div>
                  <span className={clsx("font-mono text-xs font-semibold", theme === "dark" ? "text-purple-400" : "text-purple-600")}>
                    Deployed by Lila
                  </span>
                  <Shield className={clsx("w-3 h-3", theme === "dark" ? "text-purple-400" : "text-purple-500")} />
                </div>
              </div>

              {/* Title */}
              <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-2">
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                  Clawdmint Agents
                </span>
              </h3>
              <p className={clsx("text-sm mb-6 max-w-sm leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                10,000 unique AI agent NFTs on Base. Procedurally generated isometric robots with on-chain traits, rarity tiers, and hidden mythic names.
              </p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: "Supply", value: "10,000" },
                  { label: "Price", value: "FREE" },
                  { label: "Network", value: "Base" },
                ].map((s) => (
                  <div key={s.label} className={clsx(
                    "rounded-xl px-3 py-2.5 border text-center",
                    theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-gray-50 border-gray-200"
                  )}>
                    <div className={clsx("font-mono text-[10px] uppercase tracking-wider mb-0.5", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                      {s.label}
                    </div>
                    <div className={clsx("font-bold text-sm", s.value === "FREE" ? "text-emerald-400" : "")}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Countdown or Mint Now */}
              {!timeLeft.expired ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    {[
                      { val: pad(timeLeft.h), label: "h" },
                      { val: pad(timeLeft.m), label: "m" },
                      { val: pad(timeLeft.s), label: "s" },
                    ].map(({ val, label }) => (
                      <div key={label} className="flex items-center gap-1">
                        <span className={clsx(
                          "font-mono text-2xl font-black px-3 py-1.5 rounded-xl border",
                          theme === "dark"
                            ? "bg-white/[0.03] border-cyan-500/15 text-white"
                            : "bg-gray-50 border-cyan-200 text-gray-900"
                        )}>
                          {val}
                        </span>
                        <span className={clsx("font-mono text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <Link
                    href="/mint"
                    className={clsx(
                      "inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all border",
                      theme === "dark"
                        ? "bg-white/[0.04] border-white/[0.08] text-gray-300 hover:bg-white/[0.08] hover:border-cyan-500/20"
                        : "bg-white border-gray-200 text-gray-700 hover:border-cyan-300 hover:shadow-md"
                    )}
                  >
                    <Clock className="w-4 h-4" />
                    View Mint Page
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <Link
                  href="/mint"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                >
                  <Sparkles className="w-4 h-4" />
                  Mint Now — Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
