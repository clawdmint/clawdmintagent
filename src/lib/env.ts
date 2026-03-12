/**
 * Type-safe environment variable access
 * Uses bracket notation to prevent webpack inlining
 * All secrets are read dynamically at runtime
 */

import { getAddressExplorerUrl, getExplorerBaseUrl, getTransactionExplorerUrl } from "./network-config";

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC ENV READER (prevents webpack inlining)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read environment variable using bracket notation
 * This prevents webpack from inlining the value at build time
 */
export function getEnv(key: string, defaultValue = ""): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Require an environment variable - throws if missing
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT-SIDE VARIABLES (NEXT_PUBLIC_* - safe to inline)
// These are PUBLIC and intentionally exposed to the client
// ═══════════════════════════════════════════════════════════════════════════════

export function getClientEnv() {
  const networkFamily = getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana");
  return {
    networkFamily,
    chainId: networkFamily === "solana" ? 0 : parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")),
    solanaCluster: getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta"),
    solanaRpcUrl: getEnv("NEXT_PUBLIC_SOLANA_RPC_URL", ""),
    solanaCollectionProgramId: getEnv("NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID", ""),
    bagsAppUrl: getEnv("NEXT_PUBLIC_BAGS_APP_URL", "https://bags.fm"),
    factoryAddress: getEnv("NEXT_PUBLIC_FACTORY_ADDRESS", ""),
    alchemyId: getEnv("NEXT_PUBLIC_ALCHEMY_ID", ""),
    walletConnectId: getEnv("NEXT_PUBLIC_WALLET_CONNECT_ID", ""),
    appUrl: getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz"),
    appName: getEnv("NEXT_PUBLIC_APP_NAME", "Clawdmint"),
  };
}

// Derived values
export function isMainnet(): boolean {
  if (getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana") === "solana") {
    return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") !== "devnet";
  }

  return parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")) === 8453;
}

export function isTestnet(): boolean {
  if (getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana") === "solana") {
    return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet";
  }

  return parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")) === 84532;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE VARIABLES (Never exposed to client - lazy loaded)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get server environment variables
 * Call this function ONLY in server-side code (API routes, server components)
 */
export function getServerEnv() {
  // Only access server vars on server-side
  if (typeof window !== "undefined") {
    throw new Error("Server environment variables cannot be accessed on client");
  }
  
  return {
    // Database
    databaseUrl: getEnv("DATABASE_URL", "file:./dev.db"),
    
    // Deployer (sensitive)
    deployerPrivateKey: getEnv("DEPLOYER_PRIVATE_KEY", ""),
    treasuryAddress: getEnv("TREASURY_ADDRESS", ""),
    platformFeeBps: parseInt(getEnv("PLATFORM_FEE_BPS", "250")),
    
    // IPFS (sensitive)
    pinataApiKey: getEnv("PINATA_API_KEY", ""),
    pinataSecretKey: getEnv("PINATA_SECRET_KEY", ""),
    pinataJwt: getEnv("PINATA_JWT", ""),
    
    // Auth secrets (sensitive)
    agentHmacSecret: getEnv("AGENT_HMAC_SECRET", ""),
    agentJwtSecret: getEnv("AGENT_JWT_SECRET", ""),
    agentWalletEncryptionKey: getEnv("AGENT_WALLET_ENCRYPTION_KEY", ""),
    
    // External APIs
    twitterBearerToken: getEnv("TWITTER_BEARER_TOKEN", ""),
    basescanApiKey: getEnv("BASESCAN_API_KEY", ""),
    bagsApiKey: getEnv("BAGS_API_KEY", ""),
    bagsApiBaseUrl: getEnv("BAGS_API_BASE_URL", "https://public-api-v2.bags.fm"),
    
    // Environment
    nodeEnv: getEnv("NODE_ENV", "development"),
    isDev: getEnv("NODE_ENV") === "development",
    isProd: getEnv("NODE_ENV") === "production",
    
    // x402 Payment Protocol
    x402PayToAddress: getEnv("X402_PAY_TO_ADDRESS", ""),
    x402FacilitatorUrl: getEnv("X402_FACILITATOR_URL", ""),
    cdpApiKeyId: getEnv("CDP_API_KEY_ID", ""),
    cdpApiKeySecret: getEnv("CDP_API_KEY_SECRET", ""),
    solanaCollectionProgramId: getEnv("SOLANA_COLLECTION_PROGRAM_ID", ""),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(forProduction = false): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const networkFamily = process.env["NEXT_PUBLIC_NETWORK_FAMILY"] || "solana";
  
  // Required for all environments
  const requiredClient = ["NEXT_PUBLIC_APP_URL"];
  if (networkFamily === "solana") {
    requiredClient.push("NEXT_PUBLIC_SOLANA_CLUSTER");
  } else {
    requiredClient.push("NEXT_PUBLIC_CHAIN_ID");
  }
  
  // Required for production
  const requiredProd = [
    "NEXT_PUBLIC_WALLET_CONNECT_ID",
    "DEPLOYER_PRIVATE_KEY",
    "TREASURY_ADDRESS",
    "PINATA_JWT",
    "AGENT_HMAC_SECRET",
    "AGENT_JWT_SECRET",
  ];
  if (networkFamily !== "solana") {
    requiredProd.push("NEXT_PUBLIC_FACTORY_ADDRESS", "NEXT_PUBLIC_ALCHEMY_ID");
  }
  
  // Check required using bracket notation
  for (const key of requiredClient) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  if (forProduction) {
    for (const key of requiredProd) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }
  
  // Warnings using bracket notation
  if (!process.env["NEXT_PUBLIC_WALLET_CONNECT_ID"]) {
    warnings.push("NEXT_PUBLIC_WALLET_CONNECT_ID not set - wallet connection may not work");
  }
  
  if (!process.env["PINATA_JWT"] && !process.env["PINATA_API_KEY"]) {
    warnings.push("Pinata not configured - IPFS uploads will fail");
  }

  const solanaProgramId =
    process.env["SOLANA_COLLECTION_PROGRAM_ID"] ||
    process.env["NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID"];
  const hasSolanaConfig =
    Boolean(process.env["NEXT_PUBLIC_SOLANA_CLUSTER"]) ||
    Boolean(process.env["NEXT_PUBLIC_SOLANA_RPC_URL"]) ||
    Boolean(solanaProgramId);

  if (hasSolanaConfig && !solanaProgramId) {
    warnings.push("SOLANA_COLLECTION_PROGRAM_ID not set - Solana collection deploys will fail");
  }

  const solanaCluster = process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] || "mainnet-beta";
  const solanaRpcUrl = process.env["NEXT_PUBLIC_SOLANA_RPC_URL"] || "";
  if (solanaRpcUrl) {
    const rpcLooksDevnet = /devnet/i.test(solanaRpcUrl);
    const rpcLooksMainnet = /mainnet/i.test(solanaRpcUrl);

    if (solanaCluster === "devnet" && rpcLooksMainnet) {
      warnings.push("NEXT_PUBLIC_SOLANA_CLUSTER is devnet but NEXT_PUBLIC_SOLANA_RPC_URL points to mainnet");
    }

    if (solanaCluster === "mainnet-beta" && rpcLooksDevnet) {
      warnings.push("NEXT_PUBLIC_SOLANA_CLUSTER is mainnet-beta but NEXT_PUBLIC_SOLANA_RPC_URL points to devnet");
    }
  }

  if (!process.env["BAGS_API_KEY"]) {
    warnings.push("BAGS_API_KEY not set - Bags token launch and analytics features will be disabled");
  }
  
  const hmacSecret = process.env["AGENT_HMAC_SECRET"];
  if (hmacSecret && hmacSecret.length < 32) {
    warnings.push("AGENT_HMAC_SECRET should be at least 32 characters");
  }

  const walletEncryptionKey = process.env["AGENT_WALLET_ENCRYPTION_KEY"];
  if (!walletEncryptionKey && !process.env["AGENT_HMAC_SECRET"]) {
    warnings.push("AGENT_WALLET_ENCRYPTION_KEY not set - agent wallet encryption will fall back to AGENT_HMAC_SECRET");
  }

  if (walletEncryptionKey && walletEncryptionKey.length < 32) {
    warnings.push("AGENT_WALLET_ENCRYPTION_KEY should be at least 32 characters");
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get RPC URL for the configured chain
 */
export function getRpcUrl(): string {
  if (getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana") === "solana") {
    const customSolanaRpc = getEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "");
    if (customSolanaRpc) {
      return customSolanaRpc;
    }

    return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com";
  }

  const alchemyId = getEnv("NEXT_PUBLIC_ALCHEMY_ID", "");
  const chainId = parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453"));
  
  if (chainId === 8453) {
    return alchemyId 
      ? `https://base-mainnet.g.alchemy.com/v2/${alchemyId}`
      : "https://mainnet.base.org";
  }
  
  return alchemyId
    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyId}`
    : "https://sepolia.base.org";
}

/**
 * Get block explorer URL
 */
export function getExplorerUrl(): string {
  if (getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana") === "solana") {
    return getExplorerBaseUrl(getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta"));
  }

  return getExplorerBaseUrl(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453"));
}

/**
 * Get explorer URL for address
 */
export function getAddressUrl(address: string): string {
  return getAddressExplorerUrl(
    address,
    getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana") === "solana"
      ? getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta")
      : getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")
  );
}

/**
 * Get explorer URL for transaction
 */
export function getTxUrl(txHash: string): string {
  return getTransactionExplorerUrl(
    txHash,
    getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana") === "solana"
      ? getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta")
      : getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBLE EXPORTS (lazy-loaded proxies)
// ═══════════════════════════════════════════════════════════════════════════════

type ClientEnvType = ReturnType<typeof getClientEnv> & { isMainnet: boolean };
type ServerEnvType = ReturnType<typeof getServerEnv>;

// Lazy proxy for clientEnv
export const clientEnv: ClientEnvType = new Proxy({} as ClientEnvType, {
  get(_, prop: string) {
    if (prop === "isMainnet") {
      return isMainnet();
    }
    const env = getClientEnv();
    return env[prop as keyof ReturnType<typeof getClientEnv>];
  },
});

// Lazy proxy for serverEnv
export const serverEnv: ServerEnvType = new Proxy({} as ServerEnvType, {
  get(_, prop: string) {
    const env = getServerEnv();
    return env[prop as keyof ServerEnvType];
  },
});
