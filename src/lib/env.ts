/**
 * Type-safe environment variable access
 * Validates required variables at build/runtime
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT-SIDE VARIABLES (NEXT_PUBLIC_*)
// ═══════════════════════════════════════════════════════════════════════════════

export const clientEnv = {
  // Blockchain
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532"),
  factoryAddress: process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "",
  alchemyId: process.env.NEXT_PUBLIC_ALCHEMY_ID || "",
  walletConnectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "",
  
  // App
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Clawdmint",
  
  // Derived
  isMainnet: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532") === 8453,
  isTestnet: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532") === 84532,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE VARIABLES (Never exposed to client)
// ═══════════════════════════════════════════════════════════════════════════════

function getServerEnv() {
  // Only access server vars on server-side
  if (typeof window !== "undefined") {
    throw new Error("Server environment variables cannot be accessed on client");
  }
  
  return {
    // Database
    databaseUrl: process.env.DATABASE_URL || "file:./dev.db",
    
    // Deployer (sensitive)
    deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || "",
    treasuryAddress: process.env.TREASURY_ADDRESS || "",
    platformFeeBps: parseInt(process.env.PLATFORM_FEE_BPS || "250"),
    
    // IPFS
    pinataApiKey: process.env.PINATA_API_KEY || "",
    pinataSecretKey: process.env.PINATA_SECRET_KEY || "",
    pinataJwt: process.env.PINATA_JWT || "",
    
    // Auth secrets
    agentHmacSecret: process.env.AGENT_HMAC_SECRET || "",
    agentJwtSecret: process.env.AGENT_JWT_SECRET || "",
    
    // External APIs
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || "",
    basescanApiKey: process.env.BASESCAN_API_KEY || "",
    
    // Environment
    nodeEnv: process.env.NODE_ENV || "development",
    isDev: process.env.NODE_ENV === "development",
    isProd: process.env.NODE_ENV === "production",
  } as const;
}

// Lazy-load server env to avoid client-side errors
let _serverEnv: ReturnType<typeof getServerEnv> | null = null;

export const serverEnv = new Proxy({} as ReturnType<typeof getServerEnv>, {
  get(_, prop: string) {
    if (_serverEnv === null) {
      _serverEnv = getServerEnv();
    }
    return _serverEnv[prop as keyof ReturnType<typeof getServerEnv>];
  },
});

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
  
  // Check required
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
  
  // Warnings
  if (!process.env.NEXT_PUBLIC_WALLET_CONNECT_ID) {
    warnings.push("NEXT_PUBLIC_WALLET_CONNECT_ID not set - wallet connection may not work");
  }
  
  if (!process.env.PINATA_JWT && !process.env.PINATA_API_KEY) {
    warnings.push("Pinata not configured - IPFS uploads will fail");
  }
  
  if (process.env.AGENT_HMAC_SECRET && process.env.AGENT_HMAC_SECRET.length < 32) {
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
  const alchemyId = clientEnv.alchemyId;
  
  if (clientEnv.isMainnet) {
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
  return clientEnv.isMainnet 
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
