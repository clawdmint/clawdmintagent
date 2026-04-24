"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ChevronRight, Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useWallet } from "./wallet-context";
import { SolanaLogo } from "./network-icons";

const primaryNavItems = [
  { href: "/drops", label: "drops" },
  { href: "/marketplace", label: "marketplace" },
  { href: "/agents", label: "agents" },
  { href: "/studio", label: "studio" },
  { href: "/clawdverse", label: "clawdverse" },
];

/** Shown in the mobile sheet only, not the desktop top bar. */
const mobileSubNavItem = { href: "/skill.md", label: "skill.md", external: true } as const;

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const {
    ready,
    authenticated,
    displayAddress,
    connectSolana,
    logout,
    solanaAvailable,
  } = useWallet();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleConnect = () => {
    if (!solanaAvailable) {
      window.open("https://phantom.app/download", "_blank", "noopener,noreferrer");
      return;
    }

    void connectSolana();
  };

  const connectLabel = solanaAvailable ? "connect wallet" : "install phantom";

  return (
    <>
      <header
        className={clsx(
          "sticky top-0 z-50 border-b backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-300",
          theme === "dark"
            ? "border-white/[0.04] bg-[#030712]/80"
            : "border-gray-200/30 bg-white/70"
        )}
      >
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="group relative flex items-center gap-2.5">
                <div className="relative h-8 w-8 transition-transform duration-300 group-hover:scale-110">
                  <Image src="/logo.png" alt="Clawdmint" width={32} height={32} className="object-contain" />
                </div>
                <div className="hidden sm:flex items-center gap-0">
                  <span
                    className={clsx(
                      "font-mono text-[15px] font-bold tracking-[-0.02em]",
                      theme === "dark" ? "text-white" : "text-gray-900"
                    )}
                  >
                    clawd
                  </span>
                  <span
                    className={clsx(
                      "font-mono text-[15px] font-bold tracking-[-0.02em]",
                      theme === "dark" ? "text-cyan-400 group-hover:text-cyan-300" : "text-cyan-600 group-hover:text-cyan-500"
                    )}
                  >
                    mint
                  </span>
                  <span
                    className={clsx(
                      "ml-[3px] inline-block h-[14px] w-[2px] animate-pulse rounded-full",
                      theme === "dark" ? "bg-cyan-400" : "bg-cyan-500"
                    )}
                  />
                </div>
                <div className="pointer-events-none absolute -inset-2 rounded-xl bg-cyan-500/0 transition-all duration-500 group-hover:bg-cyan-500/[0.03]" />
              </Link>

            </div>

            <nav
              className={clsx(
                "hidden items-center rounded-lg border px-1 py-1 md:flex",
                theme === "dark" ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-200 bg-gray-50"
              )}
            >
              {primaryNavItems.map((item) => {
                const isActive = !item.external && pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={clsx(
                      "relative flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-[12px] transition-all duration-200",
                      isActive
                        ? theme === "dark"
                          ? "bg-white/[0.08] text-cyan-400"
                          : "bg-white text-cyan-600 shadow-sm"
                        : theme === "dark"
                          ? "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                          : "text-gray-500 hover:bg-white hover:text-gray-700"
                    )}
                  >
                    {isActive && <ChevronRight className="h-3 w-3 shrink-0 text-cyan-400" />}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  "hidden items-center rounded-lg border divide-x sm:flex",
                  theme === "dark"
                    ? "border-white/[0.06] bg-white/[0.02] divide-white/[0.06]"
                    : "border-gray-200 bg-gray-50 divide-gray-200"
                )}
              >
                <div
                  className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 font-mono text-[11px]",
                    theme === "dark" ? "text-emerald-300" : "text-emerald-700"
                  )}
                >
                  <SolanaLogo className="h-3 w-3" />
                  <span>Solana</span>
                </div>
                <button
                  onClick={toggleTheme}
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center transition-colors",
                    theme === "dark" ? "text-gray-500 hover:text-cyan-400" : "text-gray-400 hover:text-amber-500"
                  )}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                </button>
              </div>

              <button
                onClick={toggleTheme}
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors sm:hidden",
                  theme === "dark" ? "text-gray-500 hover:text-cyan-400" : "text-gray-400 hover:text-amber-500"
                )}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              {ready && !authenticated && (
                <button
                  onClick={handleConnect}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-mono text-[12px] font-semibold transition-all duration-200",
                    theme === "dark" ? "bg-cyan-400 text-black hover:bg-cyan-300" : "bg-gray-900 text-white hover:bg-gray-800"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {connectLabel}
                </button>
              )}

              {ready && authenticated && (
                <>
                  <button
                    onClick={() => router.push("/profile")}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[12px] font-medium transition-all",
                      pathname === "/profile"
                        ? theme === "dark"
                          ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-400"
                          : "border-cyan-200 bg-cyan-50 text-cyan-600"
                        : theme === "dark"
                          ? "border-white/[0.08] text-gray-300 hover:border-white/[0.15] hover:text-white"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    {displayAddress || "connected"}
                  </button>
                  <button
                    onClick={() => void logout()}
                    className={clsx(
                      "hidden rounded-lg border px-3 py-1.5 font-mono text-[12px] transition-all sm:block",
                      theme === "dark"
                        ? "border-white/[0.08] text-gray-500 hover:text-red-300"
                        : "border-gray-200 text-gray-500 hover:text-red-500"
                    )}
                  >
                    disconnect
                  </button>
                </>
              )}

              <button
                onClick={() => setMobileMenuOpen((current) => !current)}
                className={clsx(
                  "p-1.5 rounded-lg transition-colors md:hidden",
                  theme === "dark" ? "hover:bg-white/[0.06]" : "hover:bg-gray-100"
                )}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div
            className={clsx(
              "absolute left-0 right-0 top-14 border-b shadow-xl",
              theme === "dark" ? "border-white/[0.05] bg-[#030712]/95" : "border-gray-200 bg-white/95"
            )}
          >
            <div className={clsx("px-5 pt-4 pb-2 flex items-center gap-2", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-500/50" />
                <div className="h-2 w-2 rounded-full bg-yellow-500/50" />
                <div className="h-2 w-2 rounded-full bg-emerald-500/50" />
              </div>
              <span className="ml-1 font-mono text-[10px]">~/clawdmint</span>
            </div>

            <div className="px-4 pb-2">
              <div className={clsx("flex items-center gap-2 px-3 py-2", theme === "dark" ? "text-cyan-500/50" : "text-cyan-600/50")}>
                <span className="font-mono text-[9px] uppercase tracking-widest font-semibold">Network</span>
                <div className={clsx("flex-1 h-px", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-200")} />
              </div>
              <div className="px-2">
                <div
                  className={clsx(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 font-mono text-xs",
                    theme === "dark" ? "bg-white/[0.06] text-cyan-400" : "bg-gray-100 text-cyan-600"
                  )}
                >
                  <SolanaLogo className="h-4 w-4" />
                  Solana only
                </div>
              </div>
            </div>

            <nav className="space-y-0.5 px-4 pb-4">
              {primaryNavItems.map((item) => {
                const isActive = !item.external && pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg px-3 py-2.5 font-mono text-sm transition-all",
                      isActive
                        ? theme === "dark"
                          ? "bg-white/[0.06] text-cyan-400"
                          : "bg-gray-100 text-cyan-600"
                        : theme === "dark"
                          ? "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    )}
                  >
                    <span className={clsx("text-[11px]", isActive ? "text-cyan-400" : theme === "dark" ? "text-gray-700" : "text-gray-300")}>
                      {isActive ? ">" : "$"}
                    </span>
                    <span>{item.label}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                  </Link>
                );
              })}

              <div
                className={clsx(
                  "mt-2 border-t pt-2",
                  theme === "dark" ? "border-white/[0.06]" : "border-gray-200"
                )}
              >
                <div
                  className={clsx(
                    "px-3 py-1 font-mono text-[9px] uppercase tracking-widest",
                    theme === "dark" ? "text-cyan-500/40" : "text-cyan-600/50"
                  )}
                >
                  resources
                </div>
                <Link
                  href={mobileSubNavItem.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className={clsx(
                    "mt-0.5 flex items-center gap-2 rounded-lg px-3 py-2.5 font-mono text-sm transition-all",
                    theme === "dark"
                      ? "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  )}
                >
                  <span className={clsx("text-[11px]", theme === "dark" ? "text-gray-700" : "text-gray-300")}>$</span>
                  <span>{mobileSubNavItem.label}</span>
                </Link>
              </div>

              {ready && !authenticated && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleConnect();
                  }}
                  className={clsx(
                    "mt-2 w-full rounded-lg px-3 py-2.5 font-mono text-sm font-semibold",
                    theme === "dark" ? "bg-cyan-400 text-black" : "bg-gray-900 text-white"
                  )}
                >
                  {connectLabel}
                </button>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
