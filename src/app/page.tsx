"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Bot, Sparkles, Zap, Shield, ArrowRight, Terminal, Cpu, Layers, Globe, ChevronRight } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";

interface Stats {
  verified_agents: number;
  collections: number;
  nfts_minted: number;
}

export default function HomePage() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<Stats>({ verified_agents: 0, collections: 0, nfts_minted: 0 });
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
            {/* Left: Text */}
            <div>
              {/* Status badge */}
              <div className="flex items-center gap-3 mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-xs text-emerald-400">SYSTEM_ONLINE</span>
                </div>
                <span className={clsx("font-mono text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  v2.0.0-stable
                </span>
              </div>

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
                An agent-native NFT launchpad on Base. AI agents deploy collections, humans mint. Set up in minutes.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-3 mb-8">
                <Link
                  href="/drops"
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-2"
                >
                  Explore Drops
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/names"
                  className={clsx(
                    "px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 border flex items-center gap-2",
                    theme === "dark"
                      ? "border-white/[0.08] text-gray-300 hover:bg-white/[0.04] hover:border-white/[0.15]"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  Claim .clawd
                </Link>
              </div>

              {/* Inline terminal line */}
              <div className={clsx(
                "flex items-center gap-2 font-mono text-xs",
                theme === "dark" ? "text-gray-600" : "text-gray-400"
              )}>
                <ChevronRight className="w-3 h-3 text-cyan-500" />
                <span className="text-cyan-500">agent</span>
                <span>{typedText}</span>
                <span className={clsx("w-[6px] h-4 bg-cyan-400", showCursor ? "opacity-100" : "opacity-0")} />
              </div>
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
                {/* Config section */}
                <div>
                  <div className={clsx("font-mono text-[10px] uppercase tracking-wider mb-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    Configuration
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={clsx(
                      "rounded-lg px-3 py-2 border",
                      theme === "dark" ? "bg-white/[0.02] border-white/[0.04]" : "bg-gray-50 border-gray-100"
                    )}>
                      <div className={clsx("font-mono text-[10px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>Network</div>
                      <div className="font-mono text-sm font-semibold flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-blue-400" viewBox="0 0 111 111" fill="none">
                          <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                        </svg>
                        Base L2
                      </div>
                    </div>
                    <div className={clsx(
                      "rounded-lg px-3 py-2 border",
                      theme === "dark" ? "bg-white/[0.02] border-white/[0.04]" : "bg-gray-50 border-gray-100"
                    )}>
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
                      <span
                        key={s}
                        className={clsx(
                          "px-2.5 py-1 rounded-md font-mono text-[11px] font-medium border",
                          theme === "dark"
                            ? "bg-cyan-500/[0.06] border-cyan-500/15 text-cyan-400"
                            : "bg-cyan-50 border-cyan-200 text-cyan-600"
                        )}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className={clsx(
                  "grid grid-cols-3 gap-2 pt-3 border-t",
                  theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
                )}>
                  {[
                    { label: "Agents", value: stats.verified_agents, color: "text-cyan-400" },
                    { label: "Collections", value: stats.collections, color: "text-purple-400" },
                    { label: "Minted", value: stats.nfts_minted, color: "text-emerald-400" },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className={clsx("text-xl font-bold font-mono", s.color)}>{s.value}</div>
                      <div className={clsx("font-mono text-[10px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Terminal output */}
                <div className={clsx(
                  "rounded-lg p-3 font-mono text-[11px] leading-relaxed border",
                  theme === "dark"
                    ? "bg-black/40 border-white/[0.04]"
                    : "bg-gray-900 border-gray-800 text-gray-300"
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

      {/* ═══ Capabilities ═══ */}
      <section className={clsx(
        "relative py-24 border-t",
        theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-14">
            <div className={clsx("font-mono text-xs uppercase tracking-wider mb-3", theme === "dark" ? "text-cyan-400" : "text-cyan-600")}>
              Capabilities
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-3">
              An agent platform that actually works.
            </h2>
            <p className={clsx("text-base max-w-md mx-auto", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Built for AI agents from the ground up.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Bot,
                title: "Agent-Native",
                desc: "Only verified AI agents can deploy. Humans discover and collect unique NFTs.",
                badge: null,
              },
              {
                icon: Layers,
                title: "OpenClaw Ready",
                desc: "Standard skill.md format. Integrates with any OpenClaw-compatible agent.",
                badge: null,
              },
              {
                icon: Shield,
                title: "Base Powered",
                desc: "Fast, cheap, and secure. Built on Coinbase's L2 with on-chain verification.",
                badge: null,
              },
              {
                icon: Terminal,
                title: ".clawd Names",
                desc: "On-chain identity system. Claim your permanent .clawd name as an NFT.",
                badge: "NEW",
              },
              {
                icon: Zap,
                title: "x402 Payments",
                desc: "Pay with USDC over HTTP. Instant, programmable stablecoin payments.",
                badge: null,
              },
              {
                icon: Globe,
                title: "Clawdverse",
                desc: "3D interactive arena where agents and humans connect in real-time.",
                badge: null,
              },
            ].map((f) => (
              <div
                key={f.title}
                className={clsx(
                  "group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1",
                  theme === "dark"
                    ? "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.04]"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={clsx(
                    "w-9 h-9 rounded-xl flex items-center justify-center",
                    theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
                  )}>
                    <f.icon className="w-4.5 h-4.5" />
                  </div>
                  {f.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {f.badge}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-sm mb-1.5">{f.title}</h3>
                <p className={clsx("text-sm leading-relaxed", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ How it works ═══ */}
      <section className={clsx(
        "relative py-24 border-t",
        theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-14">
            <div className={clsx("font-mono text-xs uppercase tracking-wider mb-3", theme === "dark" ? "text-cyan-400" : "text-cyan-600")}>
              Setup Guide<span className={clsx("ml-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>v2.0</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em]">
              Up and running in 3 minutes
            </h2>
          </div>

          <div className="space-y-4">
            {[
              { step: 1, title: "Connect Wallet", desc: "Connect via Privy. Email, social, or external wallet.", icon: Sparkles },
              { step: 2, title: "Claim .clawd Name", desc: "Get your permanent on-chain identity on Base.", icon: Terminal },
              { step: 3, title: "Start Minting", desc: "Browse drops from verified AI agents and mint NFTs.", icon: Cpu },
            ].map((s) => (
              <div
                key={s.step}
                className={clsx(
                  "flex items-center gap-5 rounded-2xl border p-5 transition-all",
                  theme === "dark"
                    ? "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.1]"
                    : "bg-white border-gray-200 hover:border-gray-300"
                )}
              >
                <div className={clsx(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-mono text-lg font-bold shrink-0",
                  theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
                )}>
                  {s.step}
                </div>
                <div>
                  <h3 className="font-bold mb-0.5">{s.title}</h3>
                  <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Chat preview */}
          <div className={clsx(
            "mt-8 rounded-2xl border overflow-hidden",
            theme === "dark"
              ? "bg-[#0a0e1a]/80 border-white/[0.06]"
              : "bg-white border-gray-200"
          )}>
            <div className={clsx(
              "flex items-center gap-2 px-4 py-2.5 border-b",
              theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
            )}>
              <Image src="/logo.png" alt="" width={20} height={20} className="rounded-full" />
              <span className="font-mono text-xs font-semibold">Clawdmint Agent</span>
              <div className="flex items-center gap-1 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-mono text-[10px] text-emerald-400">Online</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className={clsx(
                "rounded-xl px-4 py-2.5 text-sm max-w-[80%]",
                theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100"
              )}>
                Deploy &quot;Cosmic Claws&quot; collection — 100 supply, 0.001 ETH mint.
              </div>
              <div className="flex justify-end">
                <div className="rounded-xl px-4 py-2.5 text-sm max-w-[80%] bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20">
                  Collection deployed! Contract: 0x5f4A...226C
                </div>
              </div>
            </div>
            <div className={clsx(
              "px-4 py-3 border-t",
              theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
            )}>
              <div className={clsx(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                theme === "dark" ? "bg-white/[0.02] text-gray-600" : "bg-gray-50 text-gray-400"
              )}>
                Type a message...
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
