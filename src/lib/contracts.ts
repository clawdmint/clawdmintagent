/**
 * Smart contract interactions
 * 
 * IMPORTANT: All env vars are read dynamically to prevent webpack inlining
 * NOTE: server-only removed because this is imported by pages
 */
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getEnv } from "./env";

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION (lazy loaded functions)
// ═══════════════════════════════════════════════════════════════════════

function getChainId(): number {
  return parseInt(getEnv("NEXT_PUBLIC_CHAIN_ID", "8453"));
}

function getFactoryAddress(): `0x${string}` {
  return getEnv("NEXT_PUBLIC_FACTORY_ADDRESS") as `0x${string}`;
}

function getAlchemyId(): string {
  return getEnv("NEXT_PUBLIC_ALCHEMY_ID", "");
}

function getRpcUrl(): string {
  const chainId = getChainId();
  const alchemyId = getAlchemyId();
  
  if (chainId === 8453) {
    return alchemyId 
      ? `https://base-mainnet.g.alchemy.com/v2/${alchemyId}`
      : "https://mainnet.base.org";
  }
  
  return alchemyId
    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyId}`
    : "https://sepolia.base.org";
}

function getChain() {
  return getChainId() === 8453 ? base : baseSepolia;
}

// ═══════════════════════════════════════════════════════════════════════
// CLIENTS (lazy created)
// ═══════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _publicClient: any = null;

export function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: getChain(),
      transport: http(getRpcUrl()),
    });
  }
  return _publicClient;
}

// Alias for backward compatibility
export const publicClient = {
  get readContract() {
    return getPublicClient().readContract.bind(getPublicClient());
  },
  get getBalance() {
    return getPublicClient().getBalance.bind(getPublicClient());
  },
  get waitForTransactionReceipt() {
    return getPublicClient().waitForTransactionReceipt.bind(getPublicClient());
  },
};

/**
 * Create a wallet client for server-side transactions
 * Used by platform deployer for collection deployment
 */
export function createDeployerWalletClient() {
  const privateKey = getEnv("DEPLOYER_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  }

  // Add 0x prefix if not present
  const formattedKey = privateKey.startsWith("0x") 
    ? privateKey as `0x${string}`
    : `0x${privateKey}` as `0x${string}`;

  const account = privateKeyToAccount(formattedKey);
  
  return {
    client: createWalletClient({
      account,
      chain: getChain(),
      transport: http(getRpcUrl()),
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
    name: "mintStartTime",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setMintStartTime",
    inputs: [{ name: "_startTime", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
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
    const client = getPublicClient();
    const factoryAddress = getFactoryAddress();
    
    const result = await client.readContract({
      address: factoryAddress,
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
  const factoryAddress = getFactoryAddress();
  const publicClientInstance = getPublicClient();
  
  const hash = await client.writeContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "setAgentAllowed",
    args: [agentAddress, true],
  });

  // Wait for confirmation
  await publicClientInstance.waitForTransactionReceipt({ hash });
  
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
    const factoryAddress = getFactoryAddress();
    const publicClientInstance = getPublicClient();
    
    console.log("[Deploy] Starting on-chain deployment...");
    console.log("[Deploy] Deployer address:", deployerAddress);
    console.log("[Deploy] Factory address:", factoryAddress);

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
      address: factoryAddress,
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
    const receipt = await publicClientInstance.waitForTransactionReceipt({ 
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
      const collections = await publicClientInstance.readContract({
        address: factoryAddress,
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
  const client = getPublicClient();
  const balance = await client.getBalance({ address });
  return formatEther(balance);
}

/**
 * Get collection data from on-chain
 */
export async function getCollectionData(collectionAddress: `0x${string}`) {
  const client = getPublicClient();
  
  const [name, symbol, maxSupply, mintPrice, totalMinted, agent, isSoldOut] = await Promise.all([
    client.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "name",
    }),
    client.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "symbol",
    }),
    client.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "maxSupply",
    }),
    client.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "mintPrice",
    }),
    client.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "totalMinted",
    }),
    client.readContract({
      address: collectionAddress,
      abi: COLLECTION_ABI,
      functionName: "agent",
    }),
    client.readContract({
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
  const client = getPublicClient();
  const factoryAddress = getFactoryAddress();
  
  const collections = await client.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: "getCollections",
  });
  return collections as string[];
}

/**
 * Parse ETH amount to Wei
 */
export { parseEther, formatEther };

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

// Export getters for lazy evaluation
export { getChain, getFactoryAddress as FACTORY_ADDRESS_GETTER };
