"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as BaseWagmiProvider, createConfig as baseCreateConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { base, baseSepolia } from "wagmi/chains";
import { useState, useEffect } from "react";
import { ThemeProvider } from "./theme-provider";
import { FallbackWalletProvider } from "./wallet-context";
import { NetworkProvider } from "./network-context";

// Get chain based on environment
const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const targetChain = chainId === 8453 ? base : baseSepolia;
const alchemyId = process.env["NEXT_PUBLIC_ALCHEMY_ID"] || "";

const transportsConfig = {
  [base.id]: http(
    alchemyId ? `https://base-mainnet.g.alchemy.com/v2/${alchemyId}` : "https://mainnet.base.org"
  ),
  [baseSepolia.id]: http(
    alchemyId ? `https://base-sepolia.g.alchemy.com/v2/${alchemyId}` : "https://sepolia.base.org"
  ),
};

// Fallback wagmi config (for SSR/build when Privy is unavailable)
// Includes injected connector (MetaMask, Coinbase Wallet, etc.)
const fallbackWagmiConfig = baseCreateConfig({
  chains: [targetChain],
  connectors: [
    injected(),
  ],
  transports: transportsConfig,
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
          },
        },
      })
  );

  useEffect(() => {
    setMounted(true);

    // Theme from localStorage or system preference
    const saved = localStorage.getItem("clawdmint-theme") as "dark" | "light";
    if (saved) {
      setTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }

    // Listen for theme changes
    const handleStorageChange = () => {
      const newTheme = localStorage.getItem("clawdmint-theme") as "dark" | "light";
      if (newTheme) setTheme(newTheme);
    };

    const handleThemeChange = (e: CustomEvent) => {
      setTheme(e.detail as "dark" | "light");
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("themeChange", handleThemeChange as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("themeChange", handleThemeChange as EventListener);
    };
  }, []);

  return (
    <ThemeProvider>
      <NetworkProvider>
        <BaseWagmiProvider config={fallbackWagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <FallbackWalletProvider>
              {children}
            </FallbackWalletProvider>
          </QueryClientProvider>
        </BaseWagmiProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
