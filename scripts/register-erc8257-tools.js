#!/usr/bin/env node

const { config } = require("dotenv");
const { ethers } = require("ethers");

config({ path: ".env.local" });
config({ path: ".env" });

const REGISTRY_ADDRESS = "0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1";
const OPEN_ACCESS_PREDICATE = "0x0000000000000000000000000000000000000000";

const BASE_RPCS = {
  base: "https://mainnet.base.org",
  "base-mainnet": "https://mainnet.base.org",
  ethereum: "https://ethereum-rpc.publicnode.com",
  mainnet: "https://ethereum-rpc.publicnode.com",
};

const TOOL_SLUGS = [
  "clawdmint-deploy-collection",
  "clawdmint-prepare-mint",
  "clawdmint-confirm-mint",
  "clawdmint-prepare-buy",
  "clawdmint-prepare-list",
  "clawdmint-cancel-listing",
  "clawdmint-launch-agent-token",
];

const REGISTRY_ABI = [
  "function registerTool(string metadataURI, bytes32 manifestHash, address accessPredicate) external returns (uint256 toolId)",
  "event ToolRegistered(uint256 indexed toolId, address indexed creator, string metadataURI, bytes32 manifestHash, address accessPredicate)",
];

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getRpcUrl(network) {
  return (
    process.env.ERC8257_RPC_URL?.trim() ||
    BASE_RPCS[network] ||
    BASE_RPCS.base
  );
}

async function fetchManifest(uri) {
  const response = await fetch(uri, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${uri}: HTTP ${response.status}`);
  }

  return response.json();
}

function resolveManifestUris(appUrl, requestedSlugs) {
  const base = appUrl.replace(/\/+$/, "");
  const slugs = requestedSlugs.length > 0 ? requestedSlugs : TOOL_SLUGS;
  return slugs.map((slug) => {
    const normalized = slug.replace(/\.json$/i, "");
    return `${base}/.well-known/ai-tool/${normalized}.json`;
  });
}

async function registerOne({ contract, walletAddress, uri, dryRun }) {
  const manifest = await fetchManifest(uri);
  const manifestCreator = manifest.creatorAddress;

  if (!manifestCreator) {
    throw new Error(`${uri} does not include creatorAddress. Set ERC8257_CREATOR_ADDRESS in production and redeploy.`);
  }

  if (walletAddress && manifestCreator.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error(
      `${uri} creatorAddress ${manifestCreator} does not match signing wallet ${walletAddress}`
    );
  }

  const canonicalManifest = canonicalize(manifest);
  const manifestHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalManifest));

  console.log(`\nTool: ${manifest.name}`);
  console.log(`URI: ${uri}`);
  console.log(`Hash: ${manifestHash}`);

  if (dryRun) {
    console.log("Dry run: skipped transaction");
    return;
  }

  if (!contract) {
    throw new Error("Registry contract is required outside dry-run mode");
  }

  const tx = await contract.registerTool(uri, manifestHash, OPEN_ACCESS_PREDICATE);
  console.log(`Tx: ${tx.hash}`);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "ToolRegistered");

  if (event) {
    console.log(`Tool ID: ${event.args.toolId.toString()}`);
  }
}

async function main() {
  const network = (process.env.ERC8257_NETWORK || "base").trim();
  const appUrl = (process.env.ERC8257_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://clawdmint.xyz").trim();
  const dryRun = process.argv.includes("--dry-run");
  const requestedSlugs = process.argv
    .filter((arg) => arg.startsWith("--slug="))
    .map((arg) => arg.slice("--slug=".length));

  const privateKey = dryRun ? process.env.ERC8257_REGISTRY_PRIVATE_KEY?.trim() : requiredEnv("ERC8257_REGISTRY_PRIVATE_KEY");
  const provider = privateKey ? new ethers.JsonRpcProvider(getRpcUrl(network)) : null;
  const wallet = privateKey ? new ethers.Wallet(privateKey, provider) : null;
  const contract = wallet ? new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet) : null;
  const walletAddress = wallet ? await wallet.getAddress() : null;

  console.log(`Network: ${network}`);
  console.log(`Registry: ${REGISTRY_ADDRESS}`);
  console.log(`Creator: ${walletAddress ?? "dry-run manifest validation only"}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "register"}`);

  for (const uri of resolveManifestUris(appUrl, requestedSlugs)) {
    await registerOne({ contract, walletAddress, uri, dryRun });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
