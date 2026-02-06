"use client";

import React, { createContext, useContext, useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

interface WalletState {
  ready: boolean;
  authenticated: boolean;
  address: `0x${string}` | undefined;
  displayAddress: string | null;
  isConnected: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  ready: false,
  authenticated: false,
  address: undefined,
  displayAddress: null,
  isConnected: false,
  login: () => {},
  logout: async () => {},
});

export const useWallet = () => useContext(WalletContext);

/**
 * Privy-powered wallet provider.
 * Renders inside PrivyProvider + WagmiProvider.
 * Provides unified wallet state from both Privy and Wagmi.
 */
export function PrivyWalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();

  const address = wagmiAddress || (user?.wallet?.address as `0x${string}` | undefined);
  const isConnected = wagmiConnected || authenticated;
  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  const stableLogin = useCallback(() => login(), [login]);
  const stableLogout = useCallback(() => logout(), [logout]);

  const value = useMemo<WalletState>(
    () => ({
      ready,
      authenticated,
      address,
      displayAddress,
      isConnected,
      login: stableLogin,
      logout: stableLogout,
    }),
    [ready, authenticated, address, displayAddress, isConnected, stableLogin, stableLogout]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Fallback wallet provider when Privy is not available (SSR/build).
 */
export function FallbackWalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WalletContext.Provider
      value={{
        ready: false,
        authenticated: false,
        address: undefined,
        displayAddress: null,
        isConnected: false,
        login: () => {},
        logout: async () => {},
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
