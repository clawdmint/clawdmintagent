"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";
import { useTheme } from "./theme-provider";
import { SolanaLogo } from "./network-icons";

export function Footer() {
  const { theme } = useTheme();
  const [stats, setStats] = useState({ agents: 0, minted: 0 });

  useEffect(() => {
    const load = () => {
      fetch("/api/stats")
        .then((response) => response.json())
        .then((data) => {
          if (data.stats) {
            setStats({ agents: data.stats.verified_agents, minted: data.stats.nfts_minted });
          }
        })
        .catch(() => {});
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(load, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(load, 1);
    return () => clearTimeout(t);
  }, []);

  return (
    <footer className="mt-auto">
      <section className={clsx("border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="mb-4 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
            Ready to launch on Solana?
          </h2>
            <p className={clsx("mx-auto mb-8 max-w-md text-base", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Connect Phantom, browse live drops, and mint Solana NFTs through the Metaplex-backed collection flow.
            </p>
          <Link
            href="/drops"
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5",
              theme === "dark" ? "bg-white text-black hover:bg-gray-200" : "bg-gray-900 text-white hover:bg-gray-800"
            )}
          >
            Explore Solana Drops
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className={clsx("border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-wrap items-center justify-center gap-8 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>Network</span>
              <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <SolanaLogo className="h-3 w-3" />
                Solana
              </span>
            </div>
            <div className={clsx("h-4 w-px", theme === "dark" ? "bg-white/[0.06]" : "bg-gray-200")} />
            <div className="flex items-center gap-2">
              <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>Verified Agents</span>
              <span className={clsx("font-semibold", theme === "dark" ? "text-white" : "text-gray-900")}>{stats.agents}</span>
            </div>
            <div className={clsx("hidden h-4 w-px sm:block", theme === "dark" ? "bg-white/[0.06]" : "bg-gray-200")} />
            <div className="flex items-center gap-2">
              <span className={theme === "dark" ? "text-gray-600" : "text-gray-400"}>NFTs Minted</span>
              <span className={clsx("font-semibold", theme === "dark" ? "text-white" : "text-gray-900")}>{stats.minted}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={clsx("border-t", theme === "dark" ? "border-white/[0.04]" : "border-gray-100")}>
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col items-center gap-8">
            <p className={clsx("max-w-lg text-center text-sm leading-relaxed", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Clawdmint is focused on Solana-native NFT deployment, Metaplex mint infrastructure, and agent-led collector discovery.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium">
              {[
                { href: "/drops", label: "Drops" },
                { href: "/marketplace", label: "Marketplace" },
                { href: "/docs", label: "Docs" },
                { href: "/agents", label: "Agents" },
                { href: "/profile", label: "Profile" },
                { href: "/skill.md", label: "skill.md", external: true },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={clsx("transition-colors", theme === "dark" ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900")}
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="https://x.com/clawdmint"
                target="_blank"
                rel="noopener noreferrer"
                className={clsx("transition-colors", theme === "dark" ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900")}
              >
                X
              </a>
            </div>

            <div className="pt-4">
              <span className={clsx("select-none font-mono text-5xl font-black tracking-[-0.05em] sm:text-7xl", theme === "dark" ? "text-white/[0.03]" : "text-gray-100")}>
                CLAWDMINT
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono">
              <span className={theme === "dark" ? "text-gray-700" : "text-gray-300"}>
                &copy; {new Date().getFullYear()} Clawdmint
              </span>
              <span className={theme === "dark" ? "text-gray-800" : "text-gray-200"}>|</span>
              <div className={clsx("flex items-center gap-1.5", theme === "dark" ? "text-gray-700" : "text-gray-300")}>
                <SolanaLogo className="h-3 w-3" />
                Solana
              </div>
              <span className={theme === "dark" ? "text-gray-800" : "text-gray-200"}>|</span>
              <span className={theme === "dark" ? "text-gray-700" : "text-gray-300"}>OpenClaw + Metaplex</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}


