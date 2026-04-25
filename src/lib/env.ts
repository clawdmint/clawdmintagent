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

function appendApiKeyToRpcUrl(endpoint: string, apiKey: string): string {
  if (!endpoint) return "";
  if (!apiKey || endpoint.includes("api_key=") || endpoint.includes("api-key=") || endpoint.includes("x-api-key=")) {
    return endpoint;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

export function getSynapseSolanaRpcUrl(): string {
  const endpoint =
    getEnv("SYNAPSE_SOLANA_RPC_URL", "") ||
    getEnv("SYNAPSE_RPC_ENDPOINT", "") ||
    getEnv("SYNAPSE_RPC_URL", "");
  const apiKey = getEnv("SYNAPSE_API_KEY", "");

  if (!endpoint) {
    return "";
  }

  return appendApiKeyToRpcUrl(endpoint, apiKey);
}

export function getFairscaleAgentApiBaseUrl(): string {
  return (
    getEnv("FAIRSCALE_AGENT_API_BASE_URL", "") ||
    getEnv("FAIRSCALE_API_BASE_URL", "") ||
    "https://agent-api.fairscale.xyz"
  ).replace(/\/+$/, "");
}

export function getFairscaleHumanApiBaseUrl(): string {
  return (
    getEnv("FAIRSCALE_HUMAN_API_BASE_URL", "") ||
    getEnv("FAIRSCALE_API_BASE_URL", "") ||
    "https://api.fairscale.xyz"
  ).replace(/\/+$/, "");
}

export function getFairscaleAgentApiKey(): string {
  return getEnv("FAIRSCALE_AGENT_API_KEY", "") || getEnv("FAIRSCALE_API_KEY", "");
}

export function getFairscaleHumanApiKey(): string {
  return getEnv("FAIRSCALE_HUMAN_API_KEY", "") || getEnv("FAIRSCALE_API_KEY", "");
}

export function getSynapseSapBaseUrl(): string {
  return getEnv("SYNAPSE_SAP_BASE_URL", "https://merchant.synapse.network").replace(/\/+$/, "");
}

/** Optional bearer for the legacy JSON-RPC-to-HTTP merchant path only. Official SAP does not require this. */
export function getSynapseSapToken(): string {
  return getEnv("SYNAPSE_SAP_TOKEN", "").trim();
}

export function isSynapseSapEnabled(): boolean {
  return Boolean(getSynapseSapToken());
}

export function isSynapseSapOnchainEnabled(): boolean {
  return getEnv("SYNAPSE_SAP_ONCHAIN_ENABLED", "false").toLowerCase() === "true";
}

export function getSynapseSapX402Endpoint(): string {
  return (
    getEnv("SYNAPSE_SAP_X402_ENDPOINT", "") ||
    `${getClawdmintInternalBaseUrl()}/api/x402/pricing`
  ).replace(/\/+$/, "");
}

export function getSynapseSapPricePerCallLamports(): number {
  const parsed = Number.parseInt(getEnv("SYNAPSE_SAP_PRICE_PER_CALL_LAMPORTS", "1000"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

export function getSynapseSapRateLimit(): number {
  const parsed = Number.parseInt(getEnv("SYNAPSE_SAP_RATE_LIMIT", "60"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}
export function getSynapseSapTimeoutMs(): number {
  const parsed = Number.parseInt(getEnv("SYNAPSE_SAP_TIMEOUT_MS", "8000"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 8000;
}

export function isSynapseSapIndexingEnabled(): boolean {
  return getEnv("SYNAPSE_SAP_INDEXING_ENABLED", "true").toLowerCase() !== "false";
}

export function shouldFallbackFromSynapseSap(): boolean {
  return getEnv("SYNAPSE_SAP_FALLBACK_TO_RPC", "true").toLowerCase() !== "false";
}

export function getClawdmintInternalBaseUrl(): string {
  return (
    getEnv("CLAWDMINT_INTERNAL_BASE_URL", "") ||
    getEnv("NEXT_PUBLIC_APP_URL", "") ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
}

export function getPreferredSolanaRpcUrl(): string {
  const synapseRpc = getSynapseSolanaRpcUrl();
  if (synapseRpc) {
    return synapseRpc;
  }

  const customSolanaRpc = getEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "");
  if (customSolanaRpc) {
    return customSolanaRpc;
  }

  return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";
}

/**
 * JSON-RPC `getProgramAccounts` (e.g. Metaplex `getAssetV1GpaBuilder`) requires a full node.
 * Many brokered RPCs (including some Synapse gateway tiers) return "Method not found" for that method.
 * When `SYNAPSE_SOLANA_RPC_URL` is set and this value is empty, the public cluster URL for the
 * current `NEXT_PUBLIC_SOLANA_CLUSTER` is used so GPA works without extra config.
 * Override with `SOLANA_GPA_RPC_URL` (server) or `NEXT_PUBLIC_SOLANA_GPA_RPC_URL` if you use a
 * dedicated full node (Helius, Triton, etc.) for index scans.
 */
export function getGpaCapableSolanaRpcUrl(): string {
  const explicit =
    getEnv("SOLANA_GPA_RPC_URL", "").trim() || getEnv("NEXT_PUBLIC_SOLANA_GPA_RPC_URL", "").trim();
  if (explicit) {
    return explicit;
  }

  if (getSynapseSolanaRpcUrl()) {
    return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com";
  }

  return getPreferredSolanaRpcUrl();
}

/**
 * RPC for high-throughput on-chain transactions (Metaplex Core, Candy Machine, agent registry mints
 * and delegations). The Synapse staging RPC at `SYNAPSE_SOLANA_RPC_URL` is too slow for
 * `sendAndConfirm` flows running inside serverless function timeouts; always prefer a dedicated full
 * node here. Override with `SOLANA_METAPLEX_RPC_URL` (server) or
 * `NEXT_PUBLIC_SOLANA_METAPLEX_RPC_URL` to point at Helius / Triton / QuickNode for better
 * confirmation latency.
 */
export function getMetaplexCoreRpcUrl(): string {
  const explicit =
    getEnv("SOLANA_METAPLEX_RPC_URL", "").trim() ||
    getEnv("NEXT_PUBLIC_SOLANA_METAPLEX_RPC_URL", "").trim();
  if (explicit) {
    return explicit;
  }

  const customSolanaRpc = getEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "").trim();
  if (customSolanaRpc) {
    return customSolanaRpc;
  }

  return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";
}
// ═══════════════════════════════════════════════════════════════════════════════

export function getClientEnv() {
  const networkFamily = getEnv("NEXT_PUBLIC_NETWORK_FAMILY", "solana");
  return {
    networkFamily,
    chainId: networkFamily === "solana" ? 0 : parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")),
    solanaCluster: getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta"),
    solanaRpcUrl: getEnv("NEXT_PUBLIC_SOLANA_RPC_URL", ""),
    solanaCollectionProgramId: getEnv("NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID", ""),
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
    platformFeeBps: parseInt(getEnv("PLATFORM_FEE_BPS", "200")),
    solanaPlatformFeeRecipient: getEnv("SOLANA_PLATFORM_FEE_RECIPIENT", getEnv("SOLANA_DEPLOYER_ADDRESS", "")),
    moonPayPublishableKey: getEnv("MOONPAY_PUBLISHABLE_KEY", ""),
    moonPaySecretKey: getEnv("MOONPAY_SECRET_KEY", ""),
    moonPayEnvironment: getEnv("MOONPAY_ENVIRONMENT", "production"),
    
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
    fairscaleApiKey: getEnv("FAIRSCALE_API_KEY", ""),
    fairscaleApiBaseUrl: getEnv("FAIRSCALE_API_BASE_URL", ""),
    fairscaleAgentApiKey: getFairscaleAgentApiKey(),
    fairscaleAgentApiBaseUrl: getFairscaleAgentApiBaseUrl(),
    fairscaleHumanApiKey: getFairscaleHumanApiKey(),
    fairscaleHumanApiBaseUrl: getFairscaleHumanApiBaseUrl(),
    synapseSapOnchainEnabled: isSynapseSapOnchainEnabled(),
    synapseSapX402Endpoint: getSynapseSapX402Endpoint(),
    synapseSapPricePerCallLamports: getSynapseSapPricePerCallLamports(),
    synapseSapRateLimit: getSynapseSapRateLimit(),
    synapseSapTimeoutMs: getSynapseSapTimeoutMs(),
    synapseSapIndexingEnabled: isSynapseSapIndexingEnabled(),
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
  const solanaRpcUrl = process.env["NEXT_PUBLIC_SOLANA_RPC_URL"] || process.env["SYNAPSE_SOLANA_RPC_URL"] || process.env["SYNAPSE_RPC_ENDPOINT"] || process.env["SYNAPSE_RPC_URL"] || "";
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

  const platformFeeBps = parseInt(process.env["PLATFORM_FEE_BPS"] || "200");
  const solanaFeeRecipient =
    process.env["SOLANA_PLATFORM_FEE_RECIPIENT"] || process.env["SOLANA_DEPLOYER_ADDRESS"] || "";
  if (
    (process.env["NEXT_PUBLIC_NETWORK_FAMILY"] || "solana") === "solana" &&
    platformFeeBps > 0 &&
    !solanaFeeRecipient
  ) {
    warnings.push("SOLANA_PLATFORM_FEE_RECIPIENT not set - Solana platform fee collection will be disabled");
  }

  const moonPayPublishableKey = process.env["MOONPAY_PUBLISHABLE_KEY"] || "";
  const moonPaySecretKey = process.env["MOONPAY_SECRET_KEY"] || "";
  if ((moonPayPublishableKey && !moonPaySecretKey) || (!moonPayPublishableKey && moonPaySecretKey)) {
    warnings.push("MoonPay is partially configured - set both MOONPAY_PUBLISHABLE_KEY and MOONPAY_SECRET_KEY");
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
    return getPreferredSolanaRpcUrl();
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
