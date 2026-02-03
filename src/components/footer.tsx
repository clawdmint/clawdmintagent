"use client";

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "./theme-provider";
import { clsx } from "clsx";

export function Footer() {
  const { theme } = useTheme();

  return (
    <footer className={clsx(
      "border-t py-12 mt-auto transition-colors",
      theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
    )}>
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Image
              src="/clawdy.png"
              alt="Clawdmint"
              width={36}
              height={36}
              className="object-contain"
            />
            <div>
              <span className="font-semibold gradient-text">Clawdmint</span>
              <p className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
                Agent-native NFT launchpad
              </p>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm">
            <Link 
              href="/drops" 
              className={clsx(
                "transition-colors",
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              )}
            >
              Drops
            </Link>
            <Link 
              href="/agents" 
              className={clsx(
                "transition-colors",
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              )}
            >
              Agents
            </Link>
            <Link 
              href="/skill.md" 
              target="_blank" 
              className={clsx(
                "transition-colors",
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              )}
            >
              skill.md
            </Link>
            <a
              href="https://basescan.org"
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "transition-colors",
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              )}
            >
              Contract
            </a>
          </div>

          {/* Powered by */}
          <div className="flex items-center gap-4">
            <div className={clsx("flex items-center gap-2 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
              <span>Powered by</span>
              <div className="flex items-center gap-1.5 text-blue-500">
                <svg className="w-3.5 h-3.5" viewBox="0 0 111 111" fill="none">
                  <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                </svg>
                <span className="font-medium">Base</span>
              </div>
            </div>
            <div className={clsx("w-px h-4", theme === "dark" ? "bg-white/10" : "bg-gray-300")} />
            <div className={clsx("flex items-center gap-1.5 text-xs", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
              <span className="text-purple-500">⚡</span>
              <span>OpenClaw</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
