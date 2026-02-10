import { config } from "../config";
import { log } from "../logger";
import type { CollectionTheme } from "../themes";

interface DeployResult {
  success: boolean;
  address?: string;
  txHash?: string;
  mintUrl?: string;
  error?: string;
}

interface AgentProfile {
  id: string;
  name: string;
  status: string;
  can_deploy: boolean;
  collections: Array<{
    address: string;
    name: string;
    total_minted: number;
    max_supply: number;
  }>;
}

const headers = () => ({
  "Authorization": `Bearer ${config.apiKey}`,
  "Content-Type": "application/json",
});

/**
 * Check agent status - is it verified and ready to deploy?
 */
export async function checkStatus(): Promise<{ status: string; canDeploy: boolean }> {
  const res = await fetch(`${config.apiBase}/agents/status`, { headers: headers() });
  const data = (await res.json()) as { error?: string; status: string; can_deploy: boolean };

  if (!res.ok) {
    throw new Error(data.error || `Status check failed: ${res.status}`);
  }

  return {
    status: data.status,
    canDeploy: data.can_deploy,
  };
}

/**
 * Get the agent's profile including collections
 */
export async function getProfile(): Promise<AgentProfile> {
  const res = await fetch(`${config.apiBase}/agents/me`, { headers: headers() });
  const data = (await res.json()) as { success: boolean; error?: string; agent: AgentProfile };

  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to get profile");
  }

  return data.agent;
}

/**
 * Deploy a new NFT collection on Base via Clawdmint API
 */
export async function deployCollection(
  theme: CollectionTheme,
  imageDataUri: string
): Promise<DeployResult> {
  log.deploy(`Deploying "${theme.name}" (${theme.symbol}) — supply: ${theme.maxSupply}, price: ${theme.mintPriceEth} ETH`);

  try {
    const res = await fetch(`${config.apiBase}/collections`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: theme.name,
        symbol: theme.symbol,
        description: theme.description,
        image: imageDataUri,
        max_supply: theme.maxSupply,
        mint_price_eth: theme.mintPriceEth,
        payout_address: config.payoutAddress,
        royalty_bps: 500, // 5% royalty
      }),
    });

    const data = (await res.json()) as { success: boolean; error?: string; collection: { address: string; tx_hash: string; mint_url: string } };

    if (!res.ok || !data.success) {
      log.error(`Deploy failed: ${data.error || res.statusText}`);
      return { success: false, error: data.error || res.statusText };
    }

    const collection = data.collection;
    log.deploy(`✓ Collection deployed at ${collection.address}`);
    log.deploy(`  TX: ${collection.tx_hash}`);
    log.deploy(`  Mint URL: ${collection.mint_url}`);

    return {
      success: true,
      address: collection.address,
      txHash: collection.tx_hash,
      mintUrl: collection.mint_url,
    };
  } catch (err) {
    log.error("Deploy request failed", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Get all public collections (for monitoring ecosystem activity)
 */
export async function getPublicCollections(): Promise<Array<{ address: string; name: string; total_minted: number }>> {
  try {
    const res = await fetch(`${config.apiBase}/collections/public`);
    const data = (await res.json()) as { collections?: Array<{ address: string; name: string; total_minted: number }> };
    return data.collections || [];
  } catch {
    return [];
  }
}
