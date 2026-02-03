#!/usr/bin/env npx ts-node
/**
 * Environment Validation Script
 * Checks all required environment variables
 * 
 * Usage: npx ts-node scripts/validate-env.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

interface EnvVar {
  name: string;
  required: boolean;
  sensitive?: boolean;
  validator?: (value: string) => boolean;
  hint?: string;
}

const envVars: EnvVar[] = [
  // Database
  {
    name: "DATABASE_URL",
    required: true,
    hint: "Database connection string",
  },
  
  // Blockchain
  {
    name: "NEXT_PUBLIC_CHAIN_ID",
    required: true,
    validator: (v) => ["8453", "84532"].includes(v),
    hint: "8453 (mainnet) or 84532 (testnet)",
  },
  {
    name: "NEXT_PUBLIC_FACTORY_ADDRESS",
    required: false,
    validator: (v) => /^0x[a-fA-F0-9]{40}$/.test(v),
    hint: "Deployed factory contract address",
  },
  {
    name: "NEXT_PUBLIC_ALCHEMY_ID",
    required: true,
    hint: "Get from dashboard.alchemy.com",
  },
  {
    name: "NEXT_PUBLIC_WALLET_CONNECT_ID",
    required: true,
    hint: "Get from cloud.walletconnect.com",
  },
  
  // Deployer
  {
    name: "DEPLOYER_PRIVATE_KEY",
    required: false,
    sensitive: true,
    validator: (v) => /^[a-fA-F0-9]{64}$/.test(v),
    hint: "64 hex chars, without 0x prefix",
  },
  {
    name: "TREASURY_ADDRESS",
    required: false,
    validator: (v) => /^0x[a-fA-F0-9]{40}$/.test(v),
    hint: "Treasury wallet address for fees",
  },
  
  // IPFS
  {
    name: "PINATA_JWT",
    required: true,
    sensitive: true,
    hint: "Get from app.pinata.cloud",
  },
  
  // Auth
  {
    name: "AGENT_HMAC_SECRET",
    required: true,
    sensitive: true,
    validator: (v) => v.length >= 32,
    hint: "Min 32 chars. Run: npm run setup",
  },
  {
    name: "AGENT_JWT_SECRET",
    required: true,
    sensitive: true,
    validator: (v) => v.length >= 32,
    hint: "Min 32 chars. Run: npm run setup",
  },
  
  // App
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: true,
    hint: "App URL (http://localhost:3000 for dev)",
  },
];

function validateEnv() {
  log("\n═══════════════════════════════════════════════════════════════", colors.cyan);
  log("   🔍 CLAWDMINT ENVIRONMENT VALIDATION", colors.bright);
  log("═══════════════════════════════════════════════════════════════\n", colors.cyan);

  let hasErrors = false;
  let hasWarnings = false;

  for (const env of envVars) {
    const value = process.env[env.name];
    const isEmpty = !value || value.trim() === "";
    
    let status = "✅";
    let statusColor = colors.green;
    let displayValue = "";

    if (isEmpty) {
      if (env.required) {
        status = "❌";
        statusColor = colors.red;
        hasErrors = true;
      } else {
        status = "⚠️";
        statusColor = colors.yellow;
        hasWarnings = true;
      }
      displayValue = "(not set)";
    } else {
      // Validate format if validator exists
      if (env.validator && !env.validator(value)) {
        status = "❌";
        statusColor = colors.red;
        hasErrors = true;
        displayValue = "(invalid format)";
      } else {
        displayValue = env.sensitive 
          ? `${value.substring(0, 8)}...` 
          : value.length > 40 
            ? `${value.substring(0, 40)}...`
            : value;
      }
    }

    log(`${status} ${env.name}`, statusColor);
    if (displayValue) {
      log(`   Value: ${displayValue}`, colors.reset);
    }
    if ((isEmpty || (env.validator && !env.validator(value || ""))) && env.hint) {
      log(`   Hint: ${env.hint}`, colors.cyan);
    }
    console.log();
  }

  log("═══════════════════════════════════════════════════════════════", colors.cyan);
  
  if (hasErrors) {
    log("\n❌ Validation FAILED - Fix required variables above\n", colors.red);
    process.exit(1);
  } else if (hasWarnings) {
    log("\n⚠️  Validation PASSED with warnings\n", colors.yellow);
  } else {
    log("\n✅ All environment variables configured correctly!\n", colors.green);
  }
}

validateEnv();
