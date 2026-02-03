/**
 * Blockchain Event Listener for Clawdmint
 * Listens to CollectionDeployed events from the Factory contract
 * and syncs data to the database
 */

import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { baseSepolia, base } from "viem/chains";
import { prisma } from "./db";
import { clientEnv } from "./env";

// Factory ABI for events
const COLLECTION_DEPLOYED_EVENT = parseAbiItem(
  "event CollectionDeployed(address indexed agent, address indexed collection, string name, string symbol, string baseURI, uint256 mintPrice, uint256 maxSupply)"
);

// Create public client
const chain = clientEnv.isMainnet ? base : baseSepolia;
const rpcUrl = clientEnv.alchemyId
  ? clientEnv.isMainnet
    ? `https://base-mainnet.g.alchemy.com/v2/${clientEnv.alchemyId}`
    : `https://base-sepolia.g.alchemy.com/v2/${clientEnv.alchemyId}`
  : chain.rpcUrls.default.http[0];

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

/**
 * Process a CollectionDeployed event
 */
async function processCollectionDeployedEvent(log: Log) {
  try {
    const { args } = log as unknown as {
      args: {
        agent: `0x${string}`;
        collection: `0x${string}`;
        name: string;
        symbol: string;
        baseURI: string;
        mintPrice: bigint;
        maxSupply: bigint;
      };
    };

    console.log(`[EventListener] Processing CollectionDeployed:`, {
      agent: args.agent,
      collection: args.collection,
      name: args.name,
    });

    // Find the agent in our database
    const agent = await prisma.agent.findUnique({
      where: { eoa: args.agent.toLowerCase() },
    });

    if (!agent) {
      console.log(`[EventListener] Agent not found for EOA: ${args.agent}`);
      return;
    }

    // Check if collection already exists
    const existingCollection = await prisma.collection.findUnique({
      where: { address: args.collection.toLowerCase() },
    });

    if (existingCollection) {
      console.log(`[EventListener] Collection already exists: ${args.collection}`);
      
      // Update status if it was deploying
      if (existingCollection.status === "DEPLOYING") {
        await prisma.collection.update({
          where: { id: existingCollection.id },
          data: {
            status: "ACTIVE",
            deployedAt: new Date(),
          },
        });
      }
      return;
    }

    // Create collection in database
    await prisma.collection.create({
      data: {
        address: args.collection.toLowerCase(),
        deployTxHash: log.transactionHash || "",
        agentId: agent.id,
        agentEoa: args.agent.toLowerCase(),
        name: args.name,
        symbol: args.symbol,
        baseUri: args.baseURI,
        maxSupply: Number(args.maxSupply),
        mintPrice: args.mintPrice.toString(),
        royaltyBps: 500, // Default, can be updated later
        payoutAddress: args.agent.toLowerCase(),
        status: "ACTIVE",
        deployedAt: new Date(),
      },
    });

    console.log(`[EventListener] Created collection: ${args.collection}`);
  } catch (error) {
    console.error(`[EventListener] Error processing event:`, error);
  }
}

/**
 * Start listening to Factory events
 */
export async function startEventListener() {
  if (!clientEnv.factoryAddress) {
    console.log("[EventListener] Factory address not configured, skipping...");
    return;
  }

  console.log(`[EventListener] Starting on ${chain.name}...`);
  console.log(`[EventListener] Factory: ${clientEnv.factoryAddress}`);

  try {
    // Watch for new CollectionDeployed events
    const unwatch = publicClient.watchEvent({
      address: clientEnv.factoryAddress as `0x${string}`,
      event: COLLECTION_DEPLOYED_EVENT,
      onLogs: async (logs) => {
        for (const log of logs) {
          await processCollectionDeployedEvent(log);
        }
      },
      onError: (error) => {
        console.error("[EventListener] Watch error:", error);
      },
    });

    console.log("[EventListener] Watching for CollectionDeployed events...");

    // Return unwatch function for cleanup
    return unwatch;
  } catch (error) {
    console.error("[EventListener] Failed to start:", error);
  }
}

/**
 * Sync historical events from a specific block
 */
export async function syncHistoricalEvents(fromBlock: bigint = BigInt(0)) {
  if (!clientEnv.factoryAddress) {
    console.log("[EventListener] Factory address not configured");
    return;
  }

  console.log(`[EventListener] Syncing historical events from block ${fromBlock}...`);

  try {
    const logs = await publicClient.getLogs({
      address: clientEnv.factoryAddress as `0x${string}`,
      event: COLLECTION_DEPLOYED_EVENT,
      fromBlock,
      toBlock: "latest",
    });

    console.log(`[EventListener] Found ${logs.length} historical events`);

    for (const log of logs) {
      await processCollectionDeployedEvent(log);
    }

    console.log("[EventListener] Historical sync complete");
  } catch (error) {
    console.error("[EventListener] Historical sync error:", error);
  }
}

/**
 * Get current block number
 */
export async function getCurrentBlock(): Promise<bigint> {
  return publicClient.getBlockNumber();
}
