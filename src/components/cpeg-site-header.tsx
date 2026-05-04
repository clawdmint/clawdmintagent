"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ChevronRight, ExternalLink, Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "./theme-provider";
import { useWallet } from "./wallet-context";
import { SolanaLogo } from "./network-icons";
import { useCpegSite } from "@/components/cpeg-site-context";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";

const lobster = "\u{1F99E}"; // 🦞

const MAIN_APP_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

export function CpegSiteHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const site = useCpegSite();
  const p = cpegPublicPaths(site);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    ready,
    authenticated,
    displayAddress,
    connectSolana,
    logout,
    solanaAvailable,
  } = useWallet();

  const navItems = [
    { href: p.home, label: "Hub" },
    { href: p.launch, label: "Launch" },
    { href: p.market(), label: "Market" },
  ] as const;

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
            ? "border-white/[0.04] bg-[#090909]/90"
            : "border-gray-200/30 bg-white/85"
        )}
      >
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-6">
              <Link href={p.home} className="group flex shrink-0 items-center gap-2">
                <div className="relative h-8 w-8 shrink-0 transition-transform duration-300 group-hover:scale-110">
                  <Image src="/logo.png" alt="cPEG" width={32} height={32} className="object-contain opacity-98" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="text-lg" aria-hidden>
                      {lobster}
                    </span>
                    <span
                      className={clsx(
                        "font-mono text-[15px] font-black tracking-[-0.02em] uppercase",
                        theme === "dark" ? "text-[#f7f2df]" : "text-gray-900"
                      )}
                    >
                      c<span className={theme === "dark" ? "text-cyan-400" : "text-cyan-600"}>PEG</span>
                    </span>
                  </div>
                  <p
                    className={clsx(
                      "hidden font-mono text-[10px] uppercase tracking-[0.22em] sm:block truncate",
                      theme === "dark" ? "text-white/40" : "text-gray-500"
                    )}
                  >
                    claw + jpeg = identity
                  </p>
                </div>
              </Link>

              <nav
                className={clsx(
                  "hidden items-center rounded-lg border px-1 py-1 md:flex",
                  theme === "dark" ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-200 bg-gray-50"
                )}
              >
                {navItems.map((item) => {
                  const path = pathname || "";
                  const active =
                    item.label === "Hub"
                      ? path === "/" || path === ""
                      : item.label === "Launch"
                        ? path === "/launch"
                        : path === "/market" || path.startsWith("/market/");

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={clsx(
                        "relative flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-[12px] transition-all duration-200",
                        active
                          ? theme === "dark"
                            ? "bg-white/[0.08] text-cyan-400"
                            : "bg-white text-cyan-600 shadow-sm"
                          : theme === "dark"
                            ? "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                            : "text-gray-500 hover:bg-white hover:text-gray-700"
                      )}
                    >
                      {active && <ChevronRight className="h-3 w-3 shrink-0 text-cyan-400" />}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <a
              href={MAIN_APP_URL}
              target="_blank"
              rel="noreferrer"
              className={clsx(
                "hidden items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition hover:border-cyan-500/40 lg:inline-flex",
                theme === "dark"
                  ? "border-white/[0.08] text-white/45 hover:text-cyan-300"
                  : "border-gray-200 text-gray-500 hover:text-cyan-600"
              )}
            >
              clawdmint
              <ExternalLink className="h-2.5 w-2.5 opacity-60" aria-hidden />
            </a>

            <div className="flex shrink-0 items-center gap-2">
              <div
                className={clsx(
                  "hidden items-center divide-x rounded-lg border sm:flex",
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
                  type="button"
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
                type="button"
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
                  type="button"
                  onClick={handleConnect}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold transition-all md:px-4 md:text-[12px]",
                    theme === "dark"
                      ? "bg-cyan-400 text-black hover:bg-cyan-300"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {connectLabel}
                </button>
              )}

              {ready && authenticated && (
                <>
                  <Link
                    href={`${MAIN_APP_URL}/profile`}
                    className={clsx(
                      "hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[12px] font-medium transition-all sm:flex",
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
                  </Link>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className={clsx(
                      "hidden rounded-lg border px-3 py-1.5 font-mono text-[12px] transition-all lg:block",
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
                type="button"
                onClick={() => setMobileMenuOpen((c) => !c)}
                className={clsx(
                  "rounded-lg p-1.5 transition-colors md:hidden",
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
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className={clsx(
              "absolute left-0 right-0 top-14 border-b shadow-xl",
              theme === "dark" ? "border-white/[0.05] bg-[#090909]/98" : "border-gray-200 bg-white/98"
            )}
          >
            <div className={clsx("px-5 pt-3 pb-2", theme === "dark" ? "text-white/50" : "text-gray-500")}>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em]">cPEG</p>
              <p className="mt-1 font-mono text-xs">{lobster} Claw + JPEG = cPEG</p>
            </div>
            <nav className="space-y-0.5 px-4 pb-4">
              {navItems.map((item) => {
                const path = pathname || "";
                const isActive =
                  item.label === "Hub"
                    ? path === "/" || path === ""
                    : item.label === "Launch"
                      ? path === "/launch"
                      : path === "/market" || path.startsWith("/market/");
                return (
                  <Link
                    key={item.label}
                    href={item.href}
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
                    {item.label}
                  </Link>
                );
              })}
              <a
                href={MAIN_APP_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className={clsx(
                  "mt-2 flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-sm",
                  theme === "dark"
                    ? "border-white/[0.08] text-white/72 hover:bg-white/[0.04]"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                )}
              >
                clawdmint
                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
              </a>

              <Link
                href={`${MAIN_APP_URL}/profile`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs",
                  theme === "dark" ? "text-white/50 hover:text-cyan-300" : "text-gray-500 hover:text-cyan-600"
                )}
              >
                profile on clawdmint
              </Link>

              {ready && !authenticated && (
                <button
                  type="button"
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
