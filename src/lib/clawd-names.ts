/**
 * ClawdNames (.clawd name service) contract interaction helpers
 * 
 * Provides read functions for name resolution, availability checks, 
 * and pricing — usable from both client and server.
 */
import { createPublicClient, http, parseEther, formatEther } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getEnv } from "./env";

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

function getChainId(): number {
  return parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453"));
}

function getClawdNamesAddress(): `0x${string}` {
  return getEnv("NEXT_PUBLIC_CLAWD_NAMES_ADDRESS", "") as `0x${string}`;
}

function getRpcUrl(): string {
  const chainId = getChainId();
  const alchemyId = getEnv("NEXT_PUBLIC_ALCHEMY_ID", "");
  if (chainId === 8453) {
    return alchemyId
      ? `https://base-mainnet.g.alchemy.com/v2/${alchemyId}`
      : "https://mainnet.base.org";
  }
  return alchemyId
    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyId}`
    : "https://sepolia.base.org";
}

function getPublicClient() {
  const chainId = getChainId();
  return createPublicClient({
    chain: chainId === 8453 ? base : baseSepolia,
    transport: http(getRpcUrl()),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ABI (only the functions we need)
// ═══════════════════════════════════════════════════════════════════════

export const CLAWD_NAMES_ABI = [
  // Registration
  {
    name: "register",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  // Primary name
  {
    name: "setPrimaryName",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  // Resolution
  {
    name: "resolve",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "reverseResolve",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  // Availability & pricing
  {
    name: "isAvailable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Token data
  {
    name: "fullName",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "tokenIdToName",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "primaryName",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // ERC721 standard
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Pricing tiers
  {
    name: "tierPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "NameRegistered",
    type: "event",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PrimaryNameSet",
    type: "event",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
    ],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// PRICING (client-side calculation — mirrors contract logic)
// ═══════════════════════════════════════════════════════════════════════

export const CLAWD_PRICING = {
  THREE_CHARS: parseEther("0.01"),    // 3 chars — premium
  FOUR_CHARS: parseEther("0.005"),    // 4 chars
  FIVE_PLUS: parseEther("0.001"),     // 5+ chars
};

export function getNamePrice(name: string): bigint {
  const len = name.length;
  if (len <= 3) return CLAWD_PRICING.THREE_CHARS;
  if (len === 4) return CLAWD_PRICING.FOUR_CHARS;
  return CLAWD_PRICING.FIVE_PLUS;
}

export function getNamePriceFormatted(name: string): string {
  return formatEther(getNamePrice(name));
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION (client-side — mirrors contract logic)
// ═══════════════════════════════════════════════════════════════════════

export function validateName(name: string): { valid: boolean; error?: string } {
  if (name.length < 3) return { valid: false, error: "Name must be at least 3 characters" };
  if (name.length > 32) return { valid: false, error: "Name must be 32 characters or less" };
  if (/^-|-$/.test(name)) return { valid: false, error: "Name cannot start or end with a hyphen" };
  if (!/^[a-z0-9-]+$/.test(name.toLowerCase())) {
    return { valid: false, error: "Only letters, numbers, and hyphens allowed" };
  }
  return { valid: true };
}

export function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

// ═══════════════════════════════════════════════════════════════════════
// ON-CHAIN READ HELPERS
// ═══════════════════════════════════════════════════════════════════════

export async function checkNameAvailability(name: string): Promise<boolean> {
  const address = getClawdNamesAddress();
  if (!address) return false;

  const client = getPublicClient();
  try {
    const available = await client.readContract({
      address,
      abi: CLAWD_NAMES_ABI,
      functionName: "isAvailable",
      args: [normalizeName(name)],
    });
    return available as boolean;
  } catch {
    return false;
  }
}

export async function resolveClawdName(name: string): Promise<string | null> {
  const address = getClawdNamesAddress();
  if (!address) return null;

  const client = getPublicClient();
  try {
    const owner = await client.readContract({
      address,
      abi: CLAWD_NAMES_ABI,
      functionName: "resolve",
      args: [normalizeName(name)],
    });
    const addr = owner as string;
    return addr === "0x0000000000000000000000000000000000000000" ? null : addr;
  } catch {
    return null;
  }
}

export async function reverseResolveAddress(addr: `0x${string}`): Promise<string | null> {
  const contractAddr = getClawdNamesAddress();
  if (!contractAddr) return null;

  const client = getPublicClient();
  try {
    const name = await client.readContract({
      address: contractAddr,
      abi: CLAWD_NAMES_ABI,
      functionName: "reverseResolve",
      args: [addr],
    });
    const result = name as string;
    return result ? `${result}.clawd` : null;
  } catch {
    return null;
  }
}

export async function getUserNames(addr: `0x${string}`): Promise<Array<{ tokenId: bigint; name: string }>> {
  const contractAddr = getClawdNamesAddress();
  if (!contractAddr) return [];

  const client = getPublicClient();
  try {
    const balance = await client.readContract({
      address: contractAddr,
      abi: CLAWD_NAMES_ABI,
      functionName: "balanceOf",
      args: [addr],
    }) as bigint;

    const names: Array<{ tokenId: bigint; name: string }> = [];
    for (let i = BigInt(0); i < balance; i++) {
      const tokenId = await client.readContract({
        address: contractAddr,
        abi: CLAWD_NAMES_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [addr, i],
      }) as bigint;

      const name = await client.readContract({
        address: contractAddr,
        abi: CLAWD_NAMES_ABI,
        functionName: "tokenIdToName",
        args: [tokenId],
      }) as string;

      names.push({ tokenId, name });
    }
    return names;
  } catch {
    return [];
  }
}

export async function getTotalRegistered(): Promise<number> {
  const contractAddr = getClawdNamesAddress();
  if (!contractAddr) return 0;

  const client = getPublicClient();
  try {
    const total = await client.readContract({
      address: contractAddr,
      abi: CLAWD_NAMES_ABI,
      functionName: "totalSupply",
    }) as bigint;
    return Number(total);
  } catch {
    return 0;
  }
}
