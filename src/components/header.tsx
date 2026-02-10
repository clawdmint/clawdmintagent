"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { Menu, X, ChevronRight, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useWallet } from "./wallet-context";
import { reverseResolveAddress } from "@/lib/clawd-names";

const navItems = [
  { href: "/mint", cmd: "mint" },
  { href: "/drops", cmd: "drops" },
  { href: "/names", cmd: ".clawd" },
  { href: "/clawdverse", cmd: "verse" },
  { href: "/agents", cmd: "agents" },
];

export function Header() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { ready, authenticated, displayAddress, address, login } = useWallet();
  const [clawdName, setClawdName] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      reverseResolveAddress(address).then(setClawdName);
    } else {
      setClawdName(null);
    }
  }, [address]);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className={clsx(
        "sticky top-0 z-50 border-b backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-300",
        theme === "dark"
          ? "border-white/[0.04] bg-[#030712]/80"
          : "border-gray-200/30 bg-white/70"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group relative">
              <div className="relative w-8 h-8 group-hover:scale-110 transition-transform duration-300">
                <Image
                  src="/logo.png"
                  alt="Clawdmint"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <div className="hidden sm:flex items-center gap-0 relative">
                <span className={clsx(
                  "font-mono text-[15px] font-bold tracking-[-0.02em] transition-all duration-300",
                  theme === "dark" ? "text-white" : "text-gray-900"
                )}>
                  clawd
                </span>
                <span className={clsx(
                  "font-mono text-[15px] font-bold tracking-[-0.02em] transition-all duration-300",
                  theme === "dark" ? "text-cyan-400 group-hover:text-cyan-300" : "text-cyan-600 group-hover:text-cyan-500"
                )}>
                  mint
                </span>
                <span className={clsx(
                  "inline-block w-[2px] h-[14px] ml-[3px] rounded-full animate-pulse",
                  theme === "dark" ? "bg-cyan-400" : "bg-cyan-500"
                )} />
              </div>
              <div className="absolute -inset-2 rounded-xl bg-cyan-500/0 group-hover:bg-cyan-500/[0.03] transition-all duration-500 pointer-events-none" />
            </Link>

            {/* Desktop Nav — terminal style */}
            <nav className={clsx(
              "hidden md:flex items-center rounded-lg border px-1 py-1",
              theme === "dark"
                ? "bg-white/[0.02] border-white/[0.06]"
                : "bg-gray-50 border-gray-200"
            )}>
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "relative px-3 py-1 rounded-md font-mono text-[12px] transition-all duration-200 flex items-center gap-1.5",
                      isActive
                        ? theme === "dark"
                          ? "bg-white/[0.08] text-cyan-400"
                          : "bg-white text-cyan-600 shadow-sm"
                        : theme === "dark"
                          ? "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]"
                          : "text-gray-500 hover:text-gray-700 hover:bg-white"
                    )}
                  >
                    {isActive && (
                      <ChevronRight className="w-3 h-3 text-cyan-400 shrink-0" />
                    )}
                    <span>{item.cmd}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right — unified toolbar */}
            <div className="flex items-center gap-2">
              {/* Grouped controls */}
              <div className={clsx(
                "hidden sm:flex items-center rounded-lg border divide-x",
                theme === "dark"
                  ? "bg-white/[0.02] border-white/[0.06] divide-white/[0.06]"
                  : "bg-gray-50 border-gray-200 divide-gray-200"
              )}>
                {/* Base network indicator */}
                <div className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] font-medium",
                  theme === "dark" ? "text-blue-400/80" : "text-blue-600"
                )}>
                  <svg className="w-3 h-3" viewBox="0 0 111 111" fill="none">
                    <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                  </svg>
                  <span className="hidden lg:inline">Base</span>
                </div>

                {/* Theme toggle — inline */}
                <button
                  onClick={toggleTheme}
                  className={clsx(
                    "flex items-center justify-center w-8 h-8 transition-colors",
                    theme === "dark" ? "text-gray-500 hover:text-cyan-400" : "text-gray-400 hover:text-amber-500"
                  )}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Moon className="w-3.5 h-3.5" />
                  ) : (
                    <Sun className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Mobile-only theme toggle */}
              <button
                onClick={toggleTheme}
                className={clsx(
                  "sm:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                  theme === "dark" ? "text-gray-500 hover:text-cyan-400" : "text-gray-400 hover:text-amber-500"
                )}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}
              </button>

              {/* Wallet */}
              {ready && !authenticated && (
                <button
                  onClick={login}
                  className={clsx(
                    "px-4 py-1.5 rounded-lg font-mono text-[12px] font-semibold transition-all duration-200 flex items-center gap-1.5",
                    theme === "dark"
                      ? "bg-cyan-400 text-black hover:bg-cyan-300"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                  connect
                </button>
              )}
              {ready && authenticated && (
                <button
                  onClick={() => router.push("/profile")}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg font-mono text-[12px] font-medium transition-all border flex items-center gap-1.5",
                    pathname === "/profile"
                      ? theme === "dark"
                        ? "bg-cyan-500/10 border-cyan-500/25 text-cyan-400"
                        : "bg-cyan-50 border-cyan-200 text-cyan-600"
                      : theme === "dark"
                        ? "border-white/[0.08] text-gray-400 hover:border-white/[0.15] hover:text-white"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {clawdName ? (
                    <span className="text-cyan-400 font-semibold">{clawdName}</span>
                  ) : (
                    displayAddress || "connected"
                  )}
                </button>
              )}

              {/* Mobile toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={clsx(
                  "md:hidden p-1.5 rounded-lg transition-colors",
                  theme === "dark" ? "hover:bg-white/[0.06]" : "hover:bg-gray-100"
                )}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu — terminal style */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className={clsx(
            "absolute top-14 left-0 right-0 border-b shadow-xl",
            theme === "dark"
              ? "bg-[#030712]/95 border-white/[0.05]"
              : "bg-white/95 border-gray-200"
          )}>
            {/* Terminal header */}
            <div className={clsx(
              "px-5 pt-4 pb-2 flex items-center gap-2",
              theme === "dark" ? "text-gray-600" : "text-gray-400"
            )}>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/50" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
              </div>
              <span className="font-mono text-[10px] ml-1">~/clawdmint</span>
            </div>

            <nav className="px-4 pb-4 space-y-0.5">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg font-mono text-sm transition-all",
                      isActive
                        ? theme === "dark"
                          ? "bg-white/[0.06] text-cyan-400"
                          : "bg-gray-100 text-cyan-600"
                        : theme === "dark"
                          ? "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    )}
                  >
                    <span className={clsx(
                      "text-[11px]",
                      isActive
                        ? "text-cyan-400"
                        : theme === "dark" ? "text-gray-700" : "text-gray-300"
                    )}>
                      {isActive ? ">" : "$"}
                    </span>
                    <span>{item.cmd}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
