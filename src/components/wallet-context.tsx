"use client";

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useDisconnect } from "wagmi";
import { getAppNetworkFamily, truncateAddress, type NetworkFamily } from "@/lib/network-config";
import { useNetworkPreference } from "./network-context";

interface WalletState {
  ready: boolean;
  authenticated: boolean;
  address: string | undefined;
  displayAddress: string | null;
  isConnected: boolean;
  evmAddress: `0x${string}` | undefined;
  solanaAddress: string | undefined;
  evmConnected: boolean;
  solanaConnected: boolean;
  solanaAvailable: boolean;
  networkFamily: NetworkFamily;
  login: () => void;
  logout: () => Promise<void>;
  connectSolana: () => Promise<void>;
  disconnectSolana: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  ready: false,
  authenticated: false,
  address: undefined,
  displayAddress: null,
  isConnected: false,
  evmAddress: undefined,
  solanaAddress: undefined,
  evmConnected: false,
  solanaConnected: false,
  solanaAvailable: false,
  networkFamily: getAppNetworkFamily(),
  login: () => {},
  logout: async () => {},
  connectSolana: async () => {},
  disconnectSolana: async () => {},
});

export const useWallet = () => useContext(WalletContext);

export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.phantom?.solana?.isPhantom) {
    return window.phantom.solana;
  }

  if (window.solana?.isPhantom) {
    return window.solana;
  }

  return null;
}

function useSolanaWalletState() {
  const [solanaReady, setSolanaReady] = useState(false);
  const [solanaAddress, setSolanaAddress] = useState<string | undefined>(undefined);
  const [solanaAvailable, setSolanaAvailable] = useState(false);
  const providerRef = useRef<PhantomProvider | null>(null);

  useEffect(() => {
    let cleanupProviderListeners: (() => void) | null = null;

    const attachProvider = (provider: PhantomProvider | null) => {
      if (providerRef.current === provider) {
        setSolanaReady(true);
        setSolanaAvailable(!!provider);
        return;
      }

      cleanupProviderListeners?.();
      cleanupProviderListeners = null;
      providerRef.current = provider;
      setSolanaReady(true);
      setSolanaAvailable(!!provider);

      if (!provider) {
        setSolanaAddress(undefined);
        return;
      }

      const syncAddress = (publicKey?: PhantomPublicKeyLike | null) => {
        setSolanaAddress(publicKey?.toString());
      };

      const handleConnect = (...args: unknown[]) => {
        const nextPublicKey = args[0] as PhantomPublicKeyLike | undefined;
        syncAddress(nextPublicKey ?? provider.publicKey ?? null);
      };

      const handleDisconnect = () => {
        setSolanaAddress(undefined);
      };

      const handleAccountChanged = (...args: unknown[]) => {
        const nextPublicKey = (args[0] as PhantomPublicKeyLike | null | undefined) ?? null;
        syncAddress(nextPublicKey ?? null);
      };

      syncAddress(provider.publicKey ?? null);
      provider.on?.("connect", handleConnect);
      provider.on?.("disconnect", handleDisconnect);
      provider.on?.("accountChanged", handleAccountChanged);

      void provider.connect({ onlyIfTrusted: true }).then(
        result => syncAddress(result.publicKey),
        () => {}
      );

      cleanupProviderListeners = () => {
        provider.off?.("connect", handleConnect);
        provider.off?.("disconnect", handleDisconnect);
        provider.off?.("accountChanged", handleAccountChanged);
      };
    };

    const syncProvider = () => {
      attachProvider(getPhantomProvider());
    };

    const intervalId = window.setInterval(syncProvider, 400);
    const timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 5000);

    syncProvider();
    window.addEventListener("load", syncProvider);
    window.addEventListener("solana#initialized", syncProvider as EventListener);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("load", syncProvider);
      window.removeEventListener("solana#initialized", syncProvider as EventListener);
      cleanupProviderListeners?.();
    };
  }, []);

  const connectSolana = useCallback(async () => {
    const provider = providerRef.current ?? getPhantomProvider();
    if (!provider) {
      setSolanaAvailable(false);
      return;
    }

    providerRef.current = provider;
    setSolanaAvailable(true);
    const result = await provider.connect().catch(() => null);
    if (!result) {
      return;
    }

    setSolanaAddress(result.publicKey.toString());
  }, []);

  const disconnectSolana = useCallback(async () => {
    const provider = providerRef.current ?? getPhantomProvider();
    providerRef.current = provider;

    if (provider) {
      await provider.disconnect().catch(() => {});
    }

    setSolanaAddress(undefined);
  }, []);

  return {
    solanaReady,
    solanaAddress,
    solanaDisplayAddress: truncateAddress(solanaAddress),
    solanaConnected: !!solanaAddress,
    solanaAvailable,
    connectSolana,
    disconnectSolana,
  };
}

/**
 * Privy-powered wallet provider.
 * Renders inside PrivyProvider + WagmiProvider.
 * Provides unified wallet state from both Privy and Wagmi.
 */
export function PrivyWalletProvider({ children }: { children: React.ReactNode }) {
  const { networkFamily } = useNetworkPreference();
  const { ready: privyReady, user, logout } = usePrivy();
  const { address: wagmiAddress } = useAccount();
  const { solanaReady, solanaAddress, solanaDisplayAddress, solanaConnected, solanaAvailable, connectSolana, disconnectSolana } = useSolanaWalletState();

  const evmAddress = wagmiAddress || (user?.wallet?.address as `0x${string}` | undefined);
  const address = solanaAddress;
  const authenticated = solanaConnected;
  const isConnected = solanaConnected;
  const displayAddress = solanaDisplayAddress;

  const handleLogin = useCallback(() => {
    void connectSolana();
  }, [connectSolana]);

  const stableLogout = useCallback(async () => {
    await Promise.allSettled([
      logout(),
      disconnectSolana(),
    ]);
  }, [disconnectSolana, logout]);

  const value = useMemo<WalletState>(
    () => ({
      ready: privyReady && solanaReady,
      authenticated,
      address,
      displayAddress,
      isConnected,
      evmAddress,
      solanaAddress,
      evmConnected: false,
      solanaConnected,
      solanaAvailable,
      networkFamily,
      login: handleLogin,
      logout: stableLogout,
      connectSolana,
      disconnectSolana,
    }),
    [
      privyReady,
      solanaReady,
      authenticated,
      address,
      displayAddress,
      isConnected,
      evmAddress,
      solanaAddress,
      solanaConnected,
      solanaAvailable,
      networkFamily,
      handleLogin,
      stableLogout,
      connectSolana,
      disconnectSolana,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Fallback wallet provider when Privy is not available.
 * Uses wagmi directly for wallet connection (MetaMask, injected wallets).
 */
export function FallbackWalletProvider({ children }: { children: React.ReactNode }) {
  const { networkFamily } = useNetworkPreference();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const { solanaReady, solanaAddress, solanaDisplayAddress, solanaConnected, solanaAvailable, connectSolana, disconnectSolana } = useSolanaWalletState();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const primaryAddress = solanaAddress;
  const displayAddress = solanaDisplayAddress;

  const handleLogin = useCallback(() => {
    void connectSolana();
  }, [connectSolana]);

  const handleLogout = useCallback(async () => {
    disconnect();
    await disconnectSolana();
  }, [disconnect, disconnectSolana]);

  const value = useMemo<WalletState>(
    () => ({
      ready: mounted && solanaReady,
      authenticated: solanaConnected,
      address: primaryAddress,
      displayAddress,
      isConnected: solanaConnected,
      evmAddress: address,
      solanaAddress,
      evmConnected: false,
      solanaConnected,
      solanaAvailable,
      networkFamily,
      login: handleLogin,
      logout: handleLogout,
      connectSolana,
      disconnectSolana,
    }),
    [
      mounted,
      solanaReady,
      solanaConnected,
      primaryAddress,
      displayAddress,
      address,
      solanaAddress,
      solanaAvailable,
      networkFamily,
      handleLogin,
      handleLogout,
      connectSolana,
      disconnectSolana,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
