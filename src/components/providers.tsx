"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as PrivyWagmiProvider, createConfig as privyCreateConfig } from "@privy-io/wagmi";
import { WagmiProvider as BaseWagmiProvider, createConfig as baseCreateConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { PrivyProvider } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { ThemeProvider } from "./theme-provider";
import { PrivyWalletProvider, FallbackWalletProvider } from "./wallet-context";

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

// Privy-enhanced wagmi config (auto-injects Privy wallet connectors)
const privyWagmiConfig = privyCreateConfig({
  chains: [targetChain],
  transports: transportsConfig,
});

// Fallback wagmi config (for SSR/build when Privy is unavailable)
const fallbackWagmiConfig = baseCreateConfig({
  chains: [targetChain],
  transports: transportsConfig,
  ssr: true,
});

// Privy App ID
const PRIVY_APP_ID = process.env["NEXT_PUBLIC_PRIVY_APP_ID"] || "";

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

  const privyEnabled = mounted && !!PRIVY_APP_ID;

  // When Privy is available (client-side + valid app ID), use full Privy + Wagmi stack
  if (privyEnabled) {
    return (
      <ThemeProvider>
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            appearance: {
              theme: theme,
              accentColor: "#06b6d4",
              logo: "https://clawdmint.xyz/logo.png",
            },
            embeddedWallets: {
              ethereum: {
                createOnLogin: "users-without-wallets",
              },
            },
            defaultChain: targetChain,
            supportedChains: [targetChain],
          }}
        >
          <QueryClientProvider client={queryClient}>
            <PrivyWagmiProvider config={privyWagmiConfig}>
              <PrivyWalletProvider>
                {children}
              </PrivyWalletProvider>
            </PrivyWagmiProvider>
          </QueryClientProvider>
        </PrivyProvider>
      </ThemeProvider>
    );
  }

  // Fallback: during SSR/build or when Privy App ID is not set
  return (
    <ThemeProvider>
      <BaseWagmiProvider config={fallbackWagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <FallbackWalletProvider>
            {children}
          </FallbackWalletProvider>
        </QueryClientProvider>
      </BaseWagmiProvider>
    </ThemeProvider>
  );
}
