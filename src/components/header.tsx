"use client";

import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ThemeToggle } from "./theme-toggle";
import { useTheme } from "./theme-provider";

const navItems = [
  { href: "/drops", label: "Live Drops" },
  { href: "/agents", label: "Agents" },
];

export function Header() {
  const pathname = usePathname();
  const { theme } = useTheme();

  return (
    <header className={clsx(
      "sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300",
      theme === "dark" 
        ? "border-white/[0.05] bg-[#030712]/80" 
        : "border-gray-200/50 bg-white/80"
    )}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-10 h-10 group-hover:scale-110 transition-transform">
              <Image
                src="/clawdy.png"
                alt="Clawdmint"
                width={40}
                height={40}
                className="object-contain drop-shadow-lg"
              />
            </div>
            <span className="text-xl font-bold gradient-text hidden sm:block">Clawdmint</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  pathname === item.href
                    ? theme === "dark"
                      ? "bg-white/[0.08] text-white"
                      : "bg-gray-100 text-gray-900"
                    : theme === "dark"
                      ? "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Base Network Badge */}
            <div className={clsx(
              "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium",
              theme === "dark"
                ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                : "bg-blue-50 border border-blue-200 text-blue-600"
            )}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 111 111" fill="none">
                <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
              </svg>
              Base
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Wallet Connect */}
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
                          >
                            Connect
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            className="px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm font-medium"
                          >
                            Wrong Network
                          </button>
                        );
                      }

                      return (
                        <button
                          onClick={openAccountModal}
                          className={clsx(
                            "px-4 py-2 glass rounded-xl text-sm font-medium transition-all",
                            theme === "dark" ? "hover:bg-white/[0.08]" : "hover:bg-gray-100"
                          )}
                        >
                          {account.displayName}
                        </button>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </div>
    </header>
  );
}
