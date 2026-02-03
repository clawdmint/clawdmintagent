#!/usr/bin/env npx ts-node
/**
 * Environment Setup Script
 * Generates secure secrets and validates configuration
 * 
 * Usage: npx ts-node scripts/setup-env.ts
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const ENV_FILE = path.join(process.cwd(), ".env.local");

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

function generateSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  log("\n═══════════════════════════════════════════════════════════════", colors.cyan);
  log("   🦞 CLAWDMINT ENVIRONMENT SETUP", colors.bright);
  log("═══════════════════════════════════════════════════════════════\n", colors.cyan);

  // Check if .env.local exists
  const envExists = fs.existsSync(ENV_FILE);
  
  if (envExists) {
    const overwrite = await prompt("⚠️  .env.local exists. Overwrite secrets? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      log("\n✅ Keeping existing configuration.", colors.green);
      process.exit(0);
    }
  }

  // Read current env or template
  let envContent = "";
  if (envExists) {
    envContent = fs.readFileSync(ENV_FILE, "utf-8");
  } else {
    const examplePath = path.join(process.cwd(), ".env.example");
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, "utf-8");
    }
  }

  log("🔐 Generating secure secrets...\n", colors.cyan);

  // Generate secrets
  const hmacSecret = generateSecret(32);
  const jwtSecret = generateSecret(32);

  log(`   AGENT_HMAC_SECRET: ${hmacSecret.substring(0, 16)}...`, colors.yellow);
  log(`   AGENT_JWT_SECRET:  ${jwtSecret.substring(0, 16)}...`, colors.yellow);

  // Update or add secrets
  const updates: Record<string, string> = {
    AGENT_HMAC_SECRET: hmacSecret,
    AGENT_JWT_SECRET: jwtSecret,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  // Write back
  fs.writeFileSync(ENV_FILE, envContent);

  log("\n✅ Secrets generated and saved to .env.local\n", colors.green);

  // Show next steps
  log("═══════════════════════════════════════════════════════════════", colors.cyan);
  log("   📋 NEXT STEPS", colors.bright);
  log("═══════════════════════════════════════════════════════════════\n", colors.cyan);

  log("1. Get Alchemy API Key:", colors.yellow);
  log("   → https://dashboard.alchemy.com\n");

  log("2. Get WalletConnect Project ID:", colors.yellow);
  log("   → https://cloud.walletconnect.com\n");

  log("3. Get Pinata API Keys:", colors.yellow);
  log("   → https://app.pinata.cloud/developers/api-keys\n");

  log("4. Create a test wallet for deploying:", colors.yellow);
  log("   → Run: cast wallet new");
  log("   → Get Base Sepolia ETH from faucet\n");

  log("5. Update .env.local with your values\n", colors.yellow);

  log("6. Validate configuration:", colors.yellow);
  log("   → Run: npm run dev");
  log("   → Visit: http://localhost:3000/api/health\n");

  log("═══════════════════════════════════════════════════════════════\n", colors.cyan);
}

main().catch(console.error);
