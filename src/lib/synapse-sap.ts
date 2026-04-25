import { Connection, Keypair } from "@solana/web3.js";
import {
  getClawdmintInternalBaseUrl,
  getMetaplexCoreRpcUrl,
  getSynapseSapPricePerCallLamports,
  getSynapseSapRateLimit,
  getSynapseSapTimeoutMs,
  getSynapseSapToken,
  getSynapseSapX402Endpoint,
  isSynapseSapEnabled,
  isSynapseSapIndexingEnabled,
  isSynapseSapOnchainEnabled,
} from "./env";
import { getSolanaRpcUrl } from "./solana-collections";

const DEFAULT_COMMITMENT = "confirmed" as const;
const SAP_CAPABILITIES = [
  {
    id: "clawdmint:nft-launch",
    protocol: "metaplex",
    version: "1.0.0",
    description: "Deploy Metaplex Core NFT collections through Clawdmint launch flows.",
  },
  {
    id: "clawdmint:token-launch",
    protocol: "metaplex",
    version: "1.0.0",
    description: "Launch agent-linked Solana tokens through Clawdmint token flows.",
  },
  {
    id: "clawdmint:agent-registry",
    protocol: "metaplex-agent-registry",
    version: "1.0.0",
    description: "Expose Metaplex-backed agent identity, execution delegation, and launch readiness.",
  },
] as const;
const SAP_PROTOCOLS = ["A2A", "MCP", "x402", "metaplex", "clawdmint"] as const;

export type SynapseSapAgentRegistrationSummary = {
  enabled: boolean;
  registered: boolean;
  skipped?: boolean;
  already_registered?: boolean;
  indexed?: boolean;
  tx_signature?: string | null;
  agent_pda?: string | null;
  stats_pda?: string | null;
  agent_id?: string | null;
  agent_uri?: string | null;
  x402_endpoint?: string | null;
  warning?: string | null;
};

export type EnsureSynapseSapAgentRegistrationInput = {
  agentId: string;
  name: string;
  description: string | null;
  agentUri: string;
  walletKeypair: InstanceType<typeof Keypair>;
};

/**
 * Server-side Solana `Connection` for product flows (deploy, Metaplex launch, agent registry, mint).
 * If `SYNAPSE_SAP_TOKEN` is set, JSON-RPC is proxied through this app (`/api/synapse-sap/rpc`) to the optional
 * merchant HTTP gateway. If unset, traffic uses the configured Solana RPC. The official SAP stack uses the
 * on-chain program + `@oobe-protocol-labs/synapse-sap-sdk` and x402; a bearer token is not required for that path.
 */
export function getSynapseSapProxyUrl() {
  return `${getClawdmintInternalBaseUrl()}/api/synapse-sap/rpc`;
}

function chainFetch(
  info: RequestInfo,
  init: RequestInit | undefined,
  next: (i: RequestInfo, u?: RequestInit) => void
) {
  if (!isSynapseSapEnabled() || !getSynapseSapToken()) {
    next(info, init);
    return;
  }
  next(getSynapseSapProxyUrl(), init);
}

export function createSynapseSapFetchMiddleware() {
  return chainFetch;
}

export function getLaunchSolanaConnection(
  config?: NonNullable<ConstructorParameters<typeof Connection>[1]> extends infer O
    ? O extends string | undefined
      ? never
      : Partial<Exclude<O, string | undefined>>
    : never
) {
  const baseConfig = {
    commitment: DEFAULT_COMMITMENT,
    fetchMiddleware: createSynapseSapFetchMiddleware(),
  };

  return new Connection(getSolanaRpcUrl(), {
    ...baseConfig,
    ...config,
  } as NonNullable<ConstructorParameters<typeof Connection>[1]>);
}

/**
 * Connection used for Metaplex Core / Candy Machine / agent registry mints. Always prefers a
 * dedicated full node (`SOLANA_METAPLEX_RPC_URL` or public mainnet) so high-cost on-chain
 * confirmations do not flow through the slower Synapse SAP staging gateway. Mixing slow
 * `sendAndConfirm` confirmations with serverless function timeouts is what caused the duplicate
 * mint regressions seen in production.
 */
export function getMetaplexCoreConnection(
  config?: NonNullable<ConstructorParameters<typeof Connection>[1]> extends infer O
    ? O extends string | undefined
      ? never
      : Partial<Exclude<O, string | undefined>>
    : never
) {
  const baseConfig = {
    commitment: DEFAULT_COMMITMENT,
  };

  return new Connection(getMetaplexCoreRpcUrl(), {
    ...baseConfig,
    ...config,
  } as NonNullable<ConstructorParameters<typeof Connection>[1]>);
}

function limitText(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function getSapCluster(): "devnet" | "mainnet-beta" {
  const cluster = process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] || "mainnet-beta";
  return cluster === "devnet" ? "devnet" : "mainnet-beta";
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown Synapse SAP error";
}

async function initSapIndex(client: Awaited<ReturnType<typeof createSapClient>>["client"]): Promise<boolean> {
  if (!isSynapseSapIndexingEnabled()) {
    return false;
  }

  let indexed = false;
  for (const capability of SAP_CAPABILITIES) {
    try {
      await client.indexing.initCapabilityIndex(capability.id);
      indexed = true;
    } catch {
      try {
        await client.indexing.addToCapabilityIndex(capability.id);
        indexed = true;
      } catch {
        // Discovery indexes are helpful, but launch identity must not fail if an index already exists or is unavailable.
      }
    }
  }

  for (const protocol of SAP_PROTOCOLS) {
    try {
      await client.indexing.initProtocolIndex(protocol);
      indexed = true;
    } catch {
      try {
        await client.indexing.addToProtocolIndex(protocol);
        indexed = true;
      } catch {
        // Best-effort only. The agent account remains the source of truth.
      }
    }
  }

  return indexed;
}

async function createSapClient(walletKeypair: InstanceType<typeof Keypair>) {
  const { SapConnection } = await import("@oobe-protocol-labs/synapse-sap-sdk");
  // SAP register/lookup queries the on-chain SAP program; the RPC node only needs to relay the
  // transaction. The Synapse staging gateway exposed via `SYNAPSE_SOLANA_RPC_URL` reliably
  // exceeds the 8s timeout, so prefer the dedicated full-node URL we already use for Metaplex
  // Core mints (override via `SOLANA_METAPLEX_RPC_URL`).
  return SapConnection.fromKeypair(getMetaplexCoreRpcUrl(), walletKeypair, {
    commitment: DEFAULT_COMMITMENT,
    cluster: getSapCluster(),
  });
}

function buildSynapseSapTimeoutSummary(
  input: EnsureSynapseSapAgentRegistrationInput,
  timeoutMs: number
): SynapseSapAgentRegistrationSummary {
  return {
    enabled: true,
    registered: false,
    skipped: true,
    tx_signature: null,
    agent_id: `did:sap:clawdmint:${input.agentId}`,
    agent_uri: input.agentUri,
    x402_endpoint: getSynapseSapX402Endpoint(),
    warning: `Synapse SAP registration timed out after ${timeoutMs}ms. Retry /api/v1/agents/metaplex later.`,
  };
}

async function withSynapseSapTimeout(
  input: EnsureSynapseSapAgentRegistrationInput,
  operation: Promise<SynapseSapAgentRegistrationSummary>
): Promise<SynapseSapAgentRegistrationSummary> {
  const timeoutMs = getSynapseSapTimeoutMs();
  if (timeoutMs <= 0) {
    return operation;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<SynapseSapAgentRegistrationSummary>((resolve) => {
    timeout = setTimeout(() => resolve(buildSynapseSapTimeoutSummary(input, timeoutMs)), timeoutMs);
  });

  return Promise.race([operation, timeoutResult]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export async function ensureSynapseSapAgentRegistration(
  input: EnsureSynapseSapAgentRegistrationInput
): Promise<SynapseSapAgentRegistrationSummary> {
  if (!isSynapseSapOnchainEnabled()) {
    return { enabled: false, registered: false, skipped: true };
  }

  return withSynapseSapTimeout(input, performSynapseSapAgentRegistration(input));
}

async function performSynapseSapAgentRegistration(
  input: EnsureSynapseSapAgentRegistrationInput
): Promise<SynapseSapAgentRegistrationSummary> {
  if (!isSynapseSapOnchainEnabled()) {
    return { enabled: false, registered: false, skipped: true };
  }

  const { deriveAgent, deriveAgentStats } = await import("@oobe-protocol-labs/synapse-sap-sdk");
  const sap = await createSapClient(input.walletKeypair);
  const agentWallet = input.walletKeypair.publicKey;
  const [agentPda] = deriveAgent(agentWallet, sap.programId);
  const [statsPda] = deriveAgentStats(agentPda, sap.programId);
  const agentId = `did:sap:clawdmint:${input.agentId}`;
  const x402Endpoint = getSynapseSapX402Endpoint();

  try {
    const existing = await sap.client.agent.fetch(agentWallet);
    const indexed = await initSapIndex(sap.client);
    return {
      enabled: true,
      registered: true,
      already_registered: true,
      indexed,
      tx_signature: null,
      agent_pda: agentPda.toBase58(),
      stats_pda: statsPda.toBase58(),
      agent_id: existing.agentId || agentId,
      agent_uri: existing.agentUri || input.agentUri,
      x402_endpoint: existing.x402Endpoint || x402Endpoint,
    };
  } catch {
    // Missing account is expected for first-time SAP registration. Register below.
  }

  try {
    let builder = sap.client.builder
      .agent(limitText(input.name || "Clawdmint Agent", 64))
      .description(
        limitText(
          input.description || "Clawdmint agent with Metaplex-backed identity and Solana launch capabilities.",
          256
        )
      )
      .agentId(agentId)
      .agentUri(input.agentUri)
      .x402Endpoint(x402Endpoint);

    for (const capability of SAP_CAPABILITIES) {
      builder = builder.addCapability(capability.id, {
        protocol: capability.protocol,
        version: capability.version,
        description: capability.description,
      });
    }

    builder = builder.addPricingTier({
      tierId: "clawdmint-launch",
      pricePerCall: getSynapseSapPricePerCallLamports(),
      rateLimit: getSynapseSapRateLimit(),
      tokenType: "sol",
      settlementMode: "x402",
    });

    for (const protocol of SAP_PROTOCOLS) {
      builder = builder.addProtocol(protocol);
    }

    const result = await builder.register();
    const indexed = await initSapIndex(sap.client);

    return {
      enabled: true,
      registered: true,
      indexed,
      tx_signature: result.txSignature,
      agent_pda: result.agentPda.toBase58(),
      stats_pda: result.statsPda.toBase58(),
      agent_id: agentId,
      agent_uri: input.agentUri,
      x402_endpoint: x402Endpoint,
    };
  } catch (error) {
    return {
      enabled: true,
      registered: false,
      tx_signature: null,
      agent_pda: agentPda.toBase58(),
      stats_pda: statsPda.toBase58(),
      agent_id: agentId,
      agent_uri: input.agentUri,
      x402_endpoint: x402Endpoint,
      warning: readErrorMessage(error),
    };
  }
}
