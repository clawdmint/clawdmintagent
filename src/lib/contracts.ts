import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453");
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const ALCHEMY_ID = process.env.NEXT_PUBLIC_ALCHEMY_ID || "";

// Determine chain based on ID
export const chain = CHAIN_ID === 8453 ? base : baseSepolia;

// RPC URL with Alchemy
const rpcUrl = CHAIN_ID === 8453
  ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_ID}`
  : `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_ID}`;

// ═══════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

/**
 * Create a wallet client for server-side transactions
 * Used by platform deployer for collection deployment
 */
export function createDeployerWalletClient() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  }

  // Add 0x prefix if not present
  const formattedKey = privateKey.startsWith("0x") 
    ? privateKey 
    : `0x${privateKey}` as `0x${string}`;

  const account = privateKeyToAccount(formattedKey);
  
  return {
    client: createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }),
    account,
    address: account.address,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CONTRACT ABIS
// ═══════════════════════════════════════════════════════════════════════

export const FACTORY_ABI = [
  // Events
  {
    type: "event",
    name: "AgentAllowlistUpdated",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "allowed", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CollectionDeployed",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "collection", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "baseURI", type: "string", indexed: false },
      { name: "mintPrice", type: "uint256", indexed: false },
      { name: "maxSupply", type: "uint256", indexed: false },
    ],
  },
  // Read functions
  {
    type: "function",
    name: "isAgentAllowed",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "platformFeeBps",
    inputs: [],
    outputs: [{ type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "treasury",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCollections",
    inputs: [],
    outputs: [{ type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentCollections",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalCollections",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  // Write functions
  {
    type: "function",
    name: "setAgentAllowed",
    inputs: [
      { name: "agent", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deployCollection",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "baseURI", type: "string" },
          { name: "maxSupply", type: "uint256" },
          { name: "mintPrice", type: "uint256" },
          { name: "payoutAddress", type: "address" },
          { name: "royaltyBps", type: "uint96" },
        ],
      },
    ],
    outputs: [{ type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;

export const COLLECTION_ABI = [
  // Events
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "minter", type: "address", indexed: true },
      { name: "startTokenId", type: "uint256", indexed: true },
      { name: "quantity", type: "uint256", indexed: false },
    ],
  },
  // Read functions
  {
    type: "function",
    name: "agent",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "mintPrice",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalMinted",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "remainingSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isSoldOut",
    inputs: [],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "payoutAddress",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "contractURI",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  // Write functions
  {
    type: "function",
    name: "publicMint",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════
// CONTRACT INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if an agent is on the factory allowlist
 */
export async function isAgentAllowedOnChain(agentAddress: `0x${string}`): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "isAgentAllowed",
      args: [agentAddress],
    });
    return result as boolean;
  } catch (error) {
    console.error("Error checking agent allowlist:", error);
    return false;
  }
}

/**
 * Add agent to factory allowlist (admin only)
 */
export async function addAgentToAllowlist(agentAddress: `0x${string}`): Promise<string> {
  const { client } = createDeployerWalletClient();
  
  const hash = await client.writeContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "setAgentAllowed",
    args: [agentAddress, true],
  });

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash });
  
  return hash;
}

/**
 * Deploy a collection on-chain via Factory contract
 * Returns the deployed collection address and tx hash
 */
export interface DeployCollectionParams {
  name: string;
  symbol: string;
  baseURI: string;
  maxSupply: bigint;
  mintPrice: bigint;
  payoutAddress: `0x${string}`;
  royaltyBps: number;
}

export interface DeployCollectionResult {
  success: boolean;
  collectionAddress?: string;
  txHash?: string;
  error?: string;
}

export async function deployCollectionOnChain(
  params: DeployCollectionParams
): Promise<DeployCollectionResult> {
  try {
    const { client, address: deployerAddress } = createDeployerWalletClient();
    
    console.log("[Deploy] Starting on-chain deployment...");
    console.log("[Deploy] Deployer address:", deployerAddress);
    console.log("[Deploy] Factory address:", FACTORY_ADDRESS);

    // Check if deployer is on allowlist
    const isAllowed = await isAgentAllowedOnChain(deployerAddress);
    if (!isAllowed) {
      console.log("[Deploy] Deployer not on allowlist, adding...");
      // Note: This assumes the deployer is also the owner who can add to allowlist
      // In production, this should be handled separately
    }

    // Deploy collection
    console.log("[Deploy] Calling deployCollection with params:", {
      name: params.name,
      symbol: params.symbol,
      baseURI: params.baseURI,
      maxSupply: params.maxSupply.toString(),
      mintPrice: params.mintPrice.toString(),
      payoutAddress: params.payoutAddress,
      royaltyBps: params.royaltyBps,
    });

    const hash = await client.writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "deployCollection",
      args: [{
        name: params.name,
        symbol: params.symbol,
        baseURI: params.baseURI,
        maxSupply: params.maxSupply,
        mintPrice: params.mintPrice,
        payoutAddress: params.payoutAddress,
        royaltyBps: BigInt(params.royaltyBps),
      }],
    });

    console.log("[Deploy] Transaction submitted:", hash);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      confirmations: 1,
    });

    console.log("[Deploy] Transaction confirmed, block:", receipt.blockNumber);

    // Parse logs to get collection address
    let collectionAddress: string | undefined;
    
    for (const log of receipt.logs) {
      // CollectionDeployed event topic
      if (log.topics[0] === "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0") {
        continue; // Skip OwnershipTransferred
      }
      
      // Check for CollectionDeployed event - collection address is indexed (topics[2])
      if (log.topics.length >= 3) {
        const potentialAddress = "0x" + log.topics[2]?.slice(26);
        if (potentialAddress && potentialAddress.length === 42) {
          collectionAddress = potentialAddress;
          console.log("[Deploy] Found collection address:", collectionAddress);
          break;
        }
      }
    }

    // Alternative: Try to decode the logs properly
    if (!collectionAddress) {
      // Get the address from the return value or events
      const collections = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "getCollections",
      });
      
      // The newest collection should be the last one
      const allCollections = collections as string[];
      if (allCollections.length > 0) {
        collectionAddress = allCollections[allCollections.length - 1];
        console.log("[Deploy] Got collection from factory:", collectionAddress);
      }
    }

    if (!collectionAddress) {
      return {
        success: false,
        txHash: hash,
        error: "Could not find deployed collection address",
      };
    }

    return {
      success: true,
      collectionAddress,
      txHash: hash,
    };
  } catch (error) {
    console.error("[Deploy] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Deployment failed",
    };
  }
}

/**
 * Check deployer balance
 */
export async function getDeployerBalance(): Promise<string> {
  const { address } = createDeployerWalletClient();
  const balance = await publicClient.getBalance({ address });
  return formatEther(balance);
}

/**
 * Get collection data from on-chain
 */
export async function getCollectionData(collectionAddress: `0x${string}`) {
  const [name, symbol, maxSupply, mintPrice, totalMinted, agent, isSoldOut] = await Promise.all([
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "name",
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "maxSupply",
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "mintPrice",
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "totalMinted",
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "agent",
    }),
    publicClient.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "isSoldOut",
    }),
  ]);

  return {
    name: name as string,
    symbol: symbol as string,
    maxSupply: (maxSupply as bigint).toString(),
    mintPrice: (mintPrice as bigint).toString(),
    mintPriceEth: formatEther(mintPrice as bigint),
    totalMinted: (totalMinted as bigint).toString(),
    agent: agent as string,
    isSoldOut: isSoldOut as boolean,
  };
}

/**
 * Get all collections from factory
 */
export async function getAllCollections(): Promise<string[]> {
  const collections = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "getCollections",
  });
  return collections as string[];
}

/**
 * Parse ETH amount to Wei
 */
export { parseEther, formatEther };

// Export factory address
export { FACTORY_ADDRESS };
