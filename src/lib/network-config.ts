export type NetworkFamily = "evm" | "solana";
export type SupportedNetworkId = "base" | "base-sepolia" | "solana" | "solana-devnet";

export interface NetworkConfig {
  id: SupportedNetworkId;
  family: NetworkFamily;
  label: string;
  shortLabel: string;
  explorerName: string;
  explorerUrl: string;
  explorerQuery?: string;
  nativeToken: string;
}

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const NETWORKS: Record<SupportedNetworkId, NetworkConfig> = {
  base: {
    id: "base",
    family: "evm",
    label: "Base",
    shortLabel: "Base",
    explorerName: "Basescan",
    explorerUrl: "https://basescan.org",
    nativeToken: "ETH",
  },
  "base-sepolia": {
    id: "base-sepolia",
    family: "evm",
    label: "Base Sepolia",
    shortLabel: "Base Sepolia",
    explorerName: "Basescan",
    explorerUrl: "https://sepolia.basescan.org",
    nativeToken: "ETH",
  },
  solana: {
    id: "solana",
    family: "solana",
    label: "Solana",
    shortLabel: "Solana",
    explorerName: "Solscan",
    explorerUrl: "https://solscan.io",
    nativeToken: "SOL",
  },
  "solana-devnet": {
    id: "solana-devnet",
    family: "solana",
    label: "Solana Devnet",
    shortLabel: "Solana Devnet",
    explorerName: "Solscan",
    explorerUrl: "https://solscan.io",
    explorerQuery: "?cluster=devnet",
    nativeToken: "SOL",
  },
};

function normalizeNetworkKey(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function isEvmAddress(value?: string | null): value is `0x${string}` {
  return EVM_ADDRESS_REGEX.test((value || "").trim());
}

export function isSolanaAddress(value?: string | null): boolean {
  return SOLANA_ADDRESS_REGEX.test((value || "").trim());
}

export function isSupportedWalletAddress(value?: string | null): boolean {
  return isEvmAddress(value) || isSolanaAddress(value);
}

export function normalizeWalletAddress(value?: string | null): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return isEvmAddress(trimmed) ? trimmed.toLowerCase() : trimmed;
}

export function getAppNetworkFamily(): NetworkFamily {
  return process.env["NEXT_PUBLIC_NETWORK_FAMILY"] === "solana" ? "solana" : "evm";
}

export function getAppNetworkId(): SupportedNetworkId {
  return getPreferredNetworkForFamily(getAppNetworkFamily()).id;
}

export function getNetworkConfig(networkId?: SupportedNetworkId): NetworkConfig {
  return NETWORKS[networkId || getAppNetworkId()];
}

export function getAppNetwork(): NetworkConfig {
  return getNetworkConfig(getAppNetworkId());
}

export function getPreferredNetworkForFamily(family: NetworkFamily): NetworkConfig {
  if (family === "solana") {
    return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? NETWORKS["solana-devnet"] : NETWORKS.solana;
  }

  return process.env["NEXT_PUBLIC_CHAIN_ID"] === "84532" ? NETWORKS["base-sepolia"] : NETWORKS.base;
}

export function getPrimaryNetworkConfigs(): [NetworkConfig, NetworkConfig] {
  return [
    getPreferredNetworkForFamily("evm"),
    getPreferredNetworkForFamily("solana"),
  ];
}

export function detectNetworkFromAddress(value?: string | null): SupportedNetworkId | null {
  if (isEvmAddress(value)) {
    return process.env["NEXT_PUBLIC_CHAIN_ID"] === "84532" ? "base-sepolia" : "base";
  }

  if (isSolanaAddress(value)) {
    return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana";
  }

  return null;
}

export function getNetworkFromValue(value?: string | null): NetworkConfig {
  const normalized = normalizeNetworkKey(value);

  switch (normalized) {
    case "base":
    case "8453":
    case "base-mainnet":
      return NETWORKS.base;
    case "base sepolia":
    case "base-sepolia":
    case "84532":
      return NETWORKS["base-sepolia"];
    case "sol":
    case "solana":
    case "mainnet-beta":
      return NETWORKS.solana;
    case "solana-devnet":
    case "devnet":
      return NETWORKS["solana-devnet"];
    default: {
      const detected = detectNetworkFromAddress(value);
      return detected ? NETWORKS[detected] : getAppNetwork();
    }
  }
}

export function getExplorerBaseUrl(network?: string | null): string {
  return getNetworkFromValue(network).explorerUrl;
}

function withExplorerQuery(path: string, config: NetworkConfig): string {
  return config.explorerQuery ? `${path}${config.explorerQuery}` : path;
}

export function getAddressExplorerUrl(address: string, network?: string | null): string {
  const config = getNetworkFromValue(network || address);
  return withExplorerQuery(`${config.explorerUrl}/address/${address}`, config);
}

export function getTransactionExplorerUrl(txHash: string, network?: string | null): string {
  const config = getNetworkFromValue(network);
  return withExplorerQuery(`${config.explorerUrl}/tx/${txHash}`, config);
}

export function getTokenExplorerUrl(tokenAddress: string, network?: string | null): string {
  const config = getNetworkFromValue(network || tokenAddress);
  if (config.family === "solana") {
    return withExplorerQuery(`${config.explorerUrl}/address/${tokenAddress}`, config);
  }
  return withExplorerQuery(`${config.explorerUrl}/token/${tokenAddress}`, config);
}

export function getDexScreenerTokenUrl(tokenAddress: string, network?: string | null): string {
  const config = getNetworkFromValue(network || tokenAddress);
  return config.family === "solana"
    ? `https://dexscreener.com/solana/${tokenAddress}`
    : `https://dexscreener.com/base/${tokenAddress}`;
}

export function truncateAddress(address?: string | null, start = 6, end = 4): string | null {
  if (!address) return null;
  if (address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
