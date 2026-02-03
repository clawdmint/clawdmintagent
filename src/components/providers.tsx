"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { RainbowKitProvider, darkTheme, lightTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { useState, useEffect } from "react";
import { ThemeProvider } from "./theme-provider";

// Determine which chain to use based on environment
// Note: NEXT_PUBLIC_ vars are intentionally client-side exposed
const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const targetChain = chainId === 8453 ? base : baseSepolia;
const alchemyId = process.env["NEXT_PUBLIC_ALCHEMY_ID"] || "";
const walletConnectId = process.env["NEXT_PUBLIC_WALLET_CONNECT_ID"] || "demo";

const config = getDefaultConfig({
  appName: "Clawdmint",
  projectId: walletConnectId,
  chains: [targetChain],
  transports: {
    [base.id]: http(
      alchemyId ? `https://base-mainnet.g.alchemy.com/v2/${alchemyId}` : "https://mainnet.base.org"
    ),
    [baseSepolia.id]: http(
      alchemyId ? `https://base-sepolia.g.alchemy.com/v2/${alchemyId}` : "https://sepolia.base.org"
    ),
  },
  ssr: true,
});

// Separate component that uses its own theme state synced with localStorage
function RainbowKitWrapper({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Initial theme from localStorage or system preference
    const saved = localStorage.getItem("clawdmint-theme") as "dark" | "light";
    if (saved) {
      setTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }

    // Listen for theme changes from localStorage (syncs with ThemeProvider)
    const handleStorageChange = () => {
      const newTheme = localStorage.getItem("clawdmint-theme") as "dark" | "light";
      if (newTheme) {
        setTheme(newTheme);
      }
    };

    // Custom event listener for same-tab storage changes
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
    <RainbowKitProvider
      theme={theme === "dark" 
        ? darkTheme({
            accentColor: "#06b6d4",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
          })
        : lightTheme({
            accentColor: "#0891b2",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
          })
      }
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
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

  return (
    <ThemeProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWrapper>
            {children}
          </RainbowKitWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
