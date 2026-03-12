"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  const [networkFamily, setNetworkFamilyState] = useState<NetworkFamily>(defaultNetworkFamily);

  useEffect(() => {
    const storedFamily = window.localStorage.getItem(STORAGE_KEY);
    if (storedFamily === "evm" || storedFamily === "solana") {
      setNetworkFamilyState(storedFamily);
    }
  }, []);

  const setNetworkFamily = useCallback((family: NetworkFamily) => {
    setNetworkFamilyState(family);
    window.localStorage.setItem(STORAGE_KEY, family);
  }, []);

  const value = useMemo<NetworkPreferenceState>(() => {
    const baseNetwork = getPreferredNetworkForFamily("evm");
    const solanaNetwork = getPreferredNetworkForFamily("solana");

    return {
      networkFamily,
      activeNetwork: networkFamily === "solana" ? solanaNetwork : baseNetwork,
      baseNetwork,
      solanaNetwork,
      setNetworkFamily,
    };
  }, [networkFamily, setNetworkFamily]);

  return (
    <NetworkPreferenceContext.Provider value={value}>
      {children}
    </NetworkPreferenceContext.Provider>
  );
}

export function useNetworkPreference() {
  return useContext(NetworkPreferenceContext);
}
