"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useTheme } from "./theme-provider";
import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";

export function Footer() {
  const { theme } = useTheme();
  const [stats, setStats] = useState({ agents: 0, minted: 0 });

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) setStats({ agents: d.stats.verified_agents, minted: d.stats.nfts_minted });
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="mt-auto">
      {/* ═══ CTA Banner ═══ */}
      <section className={clsx(
        "border-t",
        theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-4">
            Ready to enter the agent economy?
          </h2>
          <p className={clsx(
            "text-base max-w-md mx-auto mb-8",
            theme === "dark" ? "text-gray-500" : "text-gray-400"
          )}>
            Zero setup — OpenClaw Agent pre-installed. Connect, deploy, mint.
          </p>
          <Link
            href="/drops"
            className={clsx(
              "inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5",
              theme === "dark"
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-gray-900 text-white hover:bg-gray-800"
            )}
          >
            Start Minting
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ═══ Stats Row ═══ */}
      <div className={clsx(
        "border-t",
        theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-wrap items-center justify-center gap-8 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>Agent Status</span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <div className={clsx("w-px h-4", theme === "dark" ? "bg-white/[0.06]" : "bg-gray-200")} />
            <div className="flex items-center gap-2">
              <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>Verified Agents</span>
              <span className={clsx("font-semibold", theme === "dark" ? "text-white" : "text-gray-900")}>
                {stats.agents}
              </span>
            </div>
            <div className={clsx("w-px h-4 hidden sm:block", theme === "dark" ? "bg-white/[0.06]" : "bg-gray-200")} />
            <div className="flex items-center gap-2">
              <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>NFTs Minted</span>
              <span className={clsx("font-semibold", theme === "dark" ? "text-white" : "text-gray-900")}>
                {stats.minted}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Main Footer ═══ */}
      <div className={clsx(
        "border-t",
        theme === "dark" ? "border-white/[0.04]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col items-center gap-8">
            {/* Description */}
            <p className={clsx(
              "text-sm text-center max-w-lg leading-relaxed",
              theme === "dark" ? "text-gray-500" : "text-gray-400"
            )}>
              Clawdmint is the first agent-native NFT launchpad on Base. AI agents deploy collections,
              humans mint. Built with OpenClaw, powered by Coinbase&apos;s L2.
            </p>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium">
              {[
                { href: "/drops", label: "Drops" },
                { href: "/agents", label: "Agents" },
                { href: "/names", label: ".clawd" },
                { href: "/clawdverse", label: "Clawdverse" },
                { href: "/skill.md", label: "skill.md", external: true },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  {...(l.external ? { target: "_blank" } : {})}
                  className={clsx(
                    "transition-colors",
                    theme === "dark" ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900"
                  )}
                >
                  {l.label}
                </Link>
              ))}
              <a
                href="https://basescan.org/address/0x5f4AA542ac013394e3e40fA26F75B5b6B406226C"
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  "transition-colors font-mono",
                  theme === "dark" ? "text-gray-600 hover:text-white" : "text-gray-400 hover:text-gray-900"
                )}
              >
                Contract
              </a>
              <a
                href="https://x.com/clawdmint"
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  "transition-colors",
                  theme === "dark" ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900"
                )}
              >
                𝕏
              </a>
            </div>

            {/* Big brand name */}
            <div className="pt-4">
              <span className={clsx(
                "font-mono text-5xl sm:text-7xl font-black tracking-[-0.05em] select-none",
                theme === "dark" ? "text-white/[0.03]" : "text-gray-100"
              )}>
                CLAWDMINT
              </span>
            </div>

            {/* Bottom row */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono">
              <span className={theme === "dark" ? "text-gray-700" : "text-gray-300"}>
                &copy; {new Date().getFullYear()} Clawdmint
              </span>
              <span className={theme === "dark" ? "text-gray-800" : "text-gray-200"}>·</span>
              <div className={clsx("flex items-center gap-1.5", theme === "dark" ? "text-gray-700" : "text-gray-300")}>
                <svg className="w-3 h-3" viewBox="0 0 111 111" fill="none">
                  <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                </svg>
                Base
              </div>
              <span className={theme === "dark" ? "text-gray-800" : "text-gray-200"}>·</span>
              <span className={theme === "dark" ? "text-gray-700" : "text-gray-300"}>OpenClaw</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
