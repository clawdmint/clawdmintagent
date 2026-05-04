"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as BaseWagmiProvider, createConfig as baseCreateConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { base, baseSepolia } from "wagmi/chains";
import { useState } from "react";
import { ThemeProvider } from "./theme-provider";
import { FallbackWalletProvider } from "./wallet-context";
import { NetworkProvider } from "./network-context";
import { CpegSiteProvider } from "./cpeg-site-context";
import { CpegVisualShell } from "./cpeg-visual-shell";

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

export function Providers({
  children,
  cpegSite = false,
}: {
  children: React.ReactNode;
  cpegSite?: boolean;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Fewer background refetches; wallet mutations still use explicit invalidation
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <CpegSiteProvider value={cpegSite}>
      <ThemeProvider>
        <CpegVisualShell>
          <NetworkProvider>
            <BaseWagmiProvider config={fallbackWagmiConfig}>
              <QueryClientProvider client={queryClient}>
                <FallbackWalletProvider>{children}</FallbackWalletProvider>
              </QueryClientProvider>
            </BaseWagmiProvider>
          </NetworkProvider>
        </CpegVisualShell>
      </ThemeProvider>
    </CpegSiteProvider>
  );
}
