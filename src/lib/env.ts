/**
 * Type-safe environment variable access
 * Uses bracket notation to prevent webpack inlining
 * All secrets are read dynamically at runtime
 */

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
  return {
    chainId: parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")),
    factoryAddress: getEnv("NEXT_PUBLIC_FACTORY_ADDRESS", ""),
    alchemyId: getEnv("NEXT_PUBLIC_ALCHEMY_ID", ""),
    walletConnectId: getEnv("NEXT_PUBLIC_WALLET_CONNECT_ID", ""),
    appUrl: getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz"),
    appName: getEnv("NEXT_PUBLIC_APP_NAME", "Clawdmint"),
  };
}

// Derived values
export function isMainnet(): boolean {
  return parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453")) === 8453;
}

export function isTestnet(): boolean {
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
    
    // External APIs
    twitterBearerToken: getEnv("TWITTER_BEARER_TOKEN", ""),
    basescanApiKey: getEnv("BASESCAN_API_KEY", ""),
    
    // Environment
    nodeEnv: getEnv("NODE_ENV", "development"),
    isDev: getEnv("NODE_ENV") === "development",
    isProd: getEnv("NODE_ENV") === "production",
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
  
  // Required for all environments
  const requiredClient = [
    "NEXT_PUBLIC_CHAIN_ID",
    "NEXT_PUBLIC_APP_URL",
  ];
  
  // Required for production
  const requiredProd = [
    "NEXT_PUBLIC_FACTORY_ADDRESS",
    "NEXT_PUBLIC_ALCHEMY_ID",
    "NEXT_PUBLIC_WALLET_CONNECT_ID",
    "DEPLOYER_PRIVATE_KEY",
    "TREASURY_ADDRESS",
    "PINATA_JWT",
    "AGENT_HMAC_SECRET",
    "AGENT_JWT_SECRET",
  ];
  
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
  
  const hmacSecret = process.env["AGENT_HMAC_SECRET"];
  if (hmacSecret && hmacSecret.length < 32) {
    warnings.push("AGENT_HMAC_SECRET should be at least 32 characters");
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
  return isMainnet() 
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
}

/**
 * Get explorer URL for address
 */
export function getAddressUrl(address: string): string {
  return `${getExplorerUrl()}/address/${address}`;
}

/**
 * Get explorer URL for transaction
 */
export function getTxUrl(txHash: string): string {
  return `${getExplorerUrl()}/tx/${txHash}`;
}
