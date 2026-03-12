"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import {
  getAppNetworkFamily,
  getPreferredNetworkForFamily,
  type NetworkConfig,
  type NetworkFamily,
} from "@/lib/network-config";

const STORAGE_KEY = "clawdmint-network-family";

interface NetworkPreferenceState {
  networkFamily: NetworkFamily;
  activeNetwork: NetworkConfig;
  baseNetwork: NetworkConfig;
  solanaNetwork: NetworkConfig;
  setNetworkFamily: (family: NetworkFamily) => void;
}

const defaultNetworkFamily = getAppNetworkFamily();

const NetworkPreferenceContext = createContext<NetworkPreferenceState>({
  networkFamily: defaultNetworkFamily,
  activeNetwork: getPreferredNetworkForFamily(defaultNetworkFamily),
  baseNetwork: getPreferredNetworkForFamily("evm"),
  solanaNetwork: getPreferredNetworkForFamily("solana"),
  setNetworkFamily: () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const storedFamily = window.localStorage.getItem(STORAGE_KEY);
    if (storedFamily !== "solana") {
      window.localStorage.setItem(STORAGE_KEY, "solana");
    }
  }, []);

  const setNetworkFamily = useCallback((_family: NetworkFamily) => {
    window.localStorage.setItem(STORAGE_KEY, "solana");
  }, []);

  const value = useMemo<NetworkPreferenceState>(() => {
    const baseNetwork = getPreferredNetworkForFamily("evm");
    const solanaNetwork = getPreferredNetworkForFamily("solana");

    return {
      networkFamily: "solana",
      activeNetwork: solanaNetwork,
      baseNetwork,
      solanaNetwork,
      setNetworkFamily,
    };
  }, [setNetworkFamily]);

  return (
    <NetworkPreferenceContext.Provider value={value}>
      {children}
    </NetworkPreferenceContext.Provider>
  );
}

export function useNetworkPreference() {
  return useContext(NetworkPreferenceContext);
}
