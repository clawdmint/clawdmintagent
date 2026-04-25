import {
  create,
  createCollection,
  fetchCollectionV1,
  mplCore,
  updatePlugin,
  safeFetchAssetV1,
  safeFetchCollectionV1,
} from "@metaplex-foundation/mpl-core";
import { mplAgentIdentity, mplAgentTools } from "@metaplex-foundation/mpl-agent-registry";
import {
  findAgentIdentityV1Pda,
  registerIdentityV1,
  safeFetchAgentIdentityV1FromSeeds,
} from "@metaplex-foundation/mpl-agent-registry/dist/src/generated/identity";
import {
  delegateExecutionV1,
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
  registerExecutiveV1,
  safeFetchExecutionDelegateRecordV1FromSeeds,
  safeFetchExecutiveProfileV1FromSeeds,
} from "@metaplex-foundation/mpl-agent-registry/dist/src/generated/tools";
import { generateSigner, keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { prisma } from "./db";
import { getAgentOperationalKeypair, type AgentWalletError } from "./agent-wallets";
import { getA2AVersion, getMCPVersion } from "./agent-protocols";
import { getEnv, getSynapseSapX402Endpoint } from "./env";
import { uploadJson } from "./ipfs";
import {
  ensureSynapseSapAgentRegistration,
  getMetaplexCoreConnection,
  type SynapseSapAgentRegistrationSummary,
} from "./synapse-sap";

type AgentRegistryRecord = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  xHandle: string | null;
  status: string;
  deployEnabled: boolean;
  solanaWalletAddress: string | null;
  solanaWalletEncryptedKey: string | null;
  metaplexCollectionAddress: string | null;
  metaplexCollectionUri: string | null;
  metaplexAssetAddress: string | null;
  metaplexAssetUri: string | null;
  metaplexRegistrationUri: string | null;
  metaplexIdentityPda: string | null;
  metaplexExecutiveProfilePda: string | null;
  metaplexExecutionDelegatePda: string | null;
  metaplexRegisteredAt: Date | null;
  metaplexDelegatedAt: Date | null;
  synapseSapAgentPda: string | null;
  synapseSapStatsPda: string | null;
  synapseSapTxSignature: string | null;
  synapseSapRegisteredAt: Date | null;
};

const AGENT_REGISTRY_SELECT = {
  id: true,
  name: true,
  description: true,
  avatarUrl: true,
  xHandle: true,
  status: true,
  deployEnabled: true,
  solanaWalletAddress: true,
  solanaWalletEncryptedKey: true,
  metaplexCollectionAddress: true,
  metaplexCollectionUri: true,
  metaplexAssetAddress: true,
  metaplexAssetUri: true,
  metaplexRegistrationUri: true,
  metaplexIdentityPda: true,
  metaplexExecutiveProfilePda: true,
  metaplexExecutionDelegatePda: true,
  metaplexRegisteredAt: true,
  metaplexDelegatedAt: true,
  synapseSapAgentPda: true,
  synapseSapStatsPda: true,
  synapseSapTxSignature: true,
  synapseSapRegisteredAt: true,
} as const;

export class MetaplexAgentRegistryError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "MetaplexAgentRegistryError";
    this.status = status;
    this.details = details;
  }
}

export type AgentMetaplexSyncStatus = "SYNCING" | "ACTIVE";

export type AgentMetaplexSyncStepSummary = AgentMetaplexSummary & {
  sync_status: AgentMetaplexSyncStatus;
  next_action: string | null;
  retry_after_seconds: number | null;
};
export interface AgentMetaplexSummary {
  collection_address: string | null;
  asset_address: string | null;
  registration_uri: string | null;
  collection_uri: string | null;
  asset_uri: string | null;
  identity_pda: string | null;
  executive_profile_pda: string | null;
  execution_delegate_pda: string | null;
  registered: boolean;
  delegated: boolean;
  registered_at: string | null;
  delegated_at: string | null;
  synapse_sap?: SynapseSapAgentRegistrationSummary | null;
}

function getAppUrl(): string {
  return getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz");
}

const REGISTRATION_DOC_VERSION = "2026-04-13-a2a-mcp-x402";

function toGatewayUrl(uploadUrl?: string, cid?: string): string {
  if (uploadUrl) {
    return uploadUrl;
  }
  if (cid) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  throw new MetaplexAgentRegistryError(500, "IPFS upload completed without a usable URL");
}

function buildAgentImageUrl(agent: AgentRegistryRecord): string {
  return agent.avatarUrl || `${getAppUrl()}/logo.png`;
}

function buildAgentCollectionMetadata(agent: AgentRegistryRecord) {
  return {
    name: `${agent.name} Agent Identity`,
    description:
      agent.description ||
      `Metaplex-registered identity collection for the verified Clawdmint agent ${agent.name}.`,
    image: buildAgentImageUrl(agent),
    external_url: `${getAppUrl()}/agents/${agent.id}`,
  };
}

function buildAgentAssetMetadata(agent: AgentRegistryRecord) {
  return {
    name: agent.name,
    description:
      agent.description ||
      `${agent.name} is a verified Clawdmint agent with an on-chain Metaplex identity.`,
    image: buildAgentImageUrl(agent),
    external_url: `${getAppUrl()}/agents/${agent.id}`,
    attributes: [
      { trait_type: "Platform", value: "Clawdmint" },
      { trait_type: "Chain", value: "Solana" },
      { trait_type: "Status", value: agent.status },
      { trait_type: "Deploy Enabled", value: agent.deployEnabled ? "true" : "false" },
    ],
  };
}

function getAgentRegistrationUri(agentId: string): string {
  return `${getAppUrl()}/api/agents/${agentId}/registration?v=${REGISTRATION_DOC_VERSION}`;
}

function buildAgentRegistrationDocument(input: {
  agent: AgentRegistryRecord;
  collectionAddress: string;
  assetAddress: string;
  identityPda: string;
  executiveProfilePda: string;
  executionDelegatePda: string;
}) {
  const appUrl = getAppUrl();

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.agent.name,
    description:
      input.agent.description ||
      `${input.agent.name} is a verified Clawdmint agent with Solana deploy capability.`,
    image: buildAgentImageUrl(input.agent),
    active: input.agent.status === "VERIFIED" && input.agent.deployEnabled,
    services: [
      {
        name: "web",
        endpoint: `${appUrl}/agents/${input.agent.id}`,
        domains: ["solana", "nft-launch"],
        version: "1.0.0",
      },
      {
        name: "A2A",
        endpoint: `${appUrl}/api/agents/${input.agent.id}/a2a`,
        version: getA2AVersion(),
        domains: ["solana", "nft-launch", "agent"],
      },
      {
        name: "MCP",
        endpoint: `${appUrl}/api/mcp`,
        version: getMCPVersion(),
        domains: ["solana", "nft-launch", "agent"],
      },
      {
        name: "skill",
        endpoint: `${appUrl}/skill.md`,
        version: "2.4.0",
        skills: ["solana-nft-deploy", "metaplex-candy-machine", "agent-wallet-automation"],
        domains: ["solana", "nft-launch"],
      },
      {
        name: "openclaw",
        endpoint: `${appUrl}/api/tools/openclaw.json`,
        version: "2.4.0",
        skills: ["register_agent", "deploy_collection", "get_agent_profile"],
        domains: ["solana", "nft-launch"],
      },
      {
        name: "x402",
        endpoint: `${appUrl}/api/x402/pricing`,
        version: "2.0.0",
        skills: ["x402_register_agent", "x402_market_data", "x402_launch_access"],
        domains: ["payments", "solana", "nft-launch"],
      },
      {
        name: "Synapse SAP",
        endpoint: `${appUrl}/api/x402/pricing`,
        version: "0.9.2",
        skills: ["sap_agent_registration", "sap_discovery", "x402_launch_access"],
        domains: ["sap", "synapse", "x402", "solana", "nft-launch"],
      },
    ],
    registrations: [
      {
        agentId: input.assetAddress,
        agentRegistry: "solana:101:metaplex",
      },
    ],
    supportedTrust: ["reputation", "crypto-economic", "synapse-sap"],
    links: {
      profile: `${appUrl}/agents/${input.agent.id}`,
      tools: `${appUrl}/api/tools/openclaw.json`,
      skill: `${appUrl}/skill.md`,
      a2a: `${appUrl}/api/agents/${input.agent.id}/a2a`,
      mcp: `${appUrl}/api/mcp`,
      x402: `${appUrl}/api/x402/pricing`,
      sap: "https://explorer.oobeprotocol.ai/docs",
    },
    owner: {
      wallet: input.agent.solanaWalletAddress,
      chain: "solana",
    },
    onchain: {
      collection: input.collectionAddress,
      asset: input.assetAddress,
      identity_pda: input.identityPda,
      executive_profile_pda: input.executiveProfilePda,
      execution_delegate_record_pda: input.executionDelegatePda,
    },
  };
}

function createRegistryUmi(agent: AgentRegistryRecord) {
  const signer = getAgentOperationalKeypair(agent);
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(mplAgentIdentity());
  umi.use(mplAgentTools());
  umi.use(keypairIdentity(fromWeb3JsKeypair(signer)));
  return { umi, signer };
}

function createReadOnlyRegistryUmi() {
  const umi = createUmi(getMetaplexCoreConnection());
  umi.use(mplCore());
  umi.use(mplAgentIdentity());
  umi.use(mplAgentTools());
  return umi;
}

function getMetaplexSyncStepSummary(
  agent: AgentRegistryRecord,
  syncStatus: AgentMetaplexSyncStatus,
  nextAction: string | null,
  synapseSap?: SynapseSapAgentRegistrationSummary | null
): AgentMetaplexSyncStepSummary {
  return {
    ...getMetaplexSummary(agent, synapseSap),
    sync_status: syncStatus,
    next_action: nextAction,
    retry_after_seconds: syncStatus === "SYNCING" ? 8 : null,
  };
}
function buildPersistedSynapseSapSummary(
  agent: AgentRegistryRecord
): SynapseSapAgentRegistrationSummary | null {
  if (!agent.synapseSapAgentPda || !agent.synapseSapRegisteredAt) {
    return null;
  }
  return {
    enabled: true,
    registered: true,
    already_registered: true,
    tx_signature: agent.synapseSapTxSignature,
    agent_pda: agent.synapseSapAgentPda,
    stats_pda: agent.synapseSapStatsPda,
    agent_id: `did:sap:clawdmint:${agent.id}`,
    agent_uri: agent.metaplexRegistrationUri,
    x402_endpoint: getSynapseSapX402Endpoint(),
  };
}

async function ensureSynapseSapPersisted(
  agent: AgentRegistryRecord
): Promise<{ agent: AgentRegistryRecord; synapseSap: SynapseSapAgentRegistrationSummary | null }> {
  // If we have a cached registration in the DB, trust it and skip the SDK fetch entirely.
  // The on-chain SAP PDA is permanent once created, so this is safe and avoids long
  // SDK timeouts when the staging RPC is slow.
  const cached = buildPersistedSynapseSapSummary(agent);
  if (cached) {
    return { agent, synapseSap: cached };
  }

  let synapseSap: SynapseSapAgentRegistrationSummary | null = null;
  try {
    synapseSap = await ensureSynapseSapAgentRegistration({
      agentId: agent.id,
      name: agent.name,
      description: agent.description,
      agentUri: agent.metaplexRegistrationUri || getAgentRegistrationUri(agent.id),
      walletKeypair: getAgentOperationalKeypair(agent),
    });
  } catch (sapError) {
    return {
      agent,
      synapseSap: {
        enabled: true,
        registered: false,
        warning: sapError instanceof Error ? sapError.message : "Unknown Synapse SAP registration error",
      },
    };
  }

  if (synapseSap?.registered && synapseSap.agent_pda) {
    try {
      const updated = await updateAgent(agent.id, {
        synapseSapAgentPda: synapseSap.agent_pda,
        synapseSapStatsPda: synapseSap.stats_pda ?? null,
        synapseSapTxSignature: synapseSap.tx_signature ?? null,
        synapseSapRegisteredAt: agent.synapseSapRegisteredAt ?? new Date(),
      });
      return { agent: updated, synapseSap };
    } catch (persistError) {
      console.error("Failed to persist Synapse SAP registration", persistError);
      return { agent, synapseSap };
    }
  }

  return { agent, synapseSap };
}

function getMetaplexSummary(
  agent: AgentRegistryRecord,
  synapseSap?: SynapseSapAgentRegistrationSummary | null
): AgentMetaplexSummary {
  const synapseSapSummary = synapseSap ?? buildPersistedSynapseSapSummary(agent);
  return {
    collection_address: agent.metaplexCollectionAddress,
    asset_address: agent.metaplexAssetAddress,
    registration_uri: agent.metaplexRegistrationUri,
    collection_uri: agent.metaplexCollectionUri,
    asset_uri: agent.metaplexAssetUri,
    identity_pda: agent.metaplexIdentityPda,
    executive_profile_pda: agent.metaplexExecutiveProfilePda,
    execution_delegate_pda: agent.metaplexExecutionDelegatePda,
    registered: Boolean(agent.metaplexAssetAddress && agent.metaplexIdentityPda),
    delegated: Boolean(agent.metaplexExecutionDelegatePda),
    registered_at: agent.metaplexRegisteredAt?.toISOString() || null,
    delegated_at: agent.metaplexDelegatedAt?.toISOString() || null,
    synapse_sap: synapseSapSummary,
  };
}

async function loadAgent(agentId: string): Promise<AgentRegistryRecord> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: AGENT_REGISTRY_SELECT,
  });

  if (!agent) {
    throw new MetaplexAgentRegistryError(404, "Agent not found");
  }

  return agent;
}

async function updateAgent(agentId: string, data: Partial<AgentRegistryRecord>): Promise<AgentRegistryRecord> {
  return prisma.agent.update({
    where: { id: agentId },
    data,
    select: AGENT_REGISTRY_SELECT,
  });
}

async function ensureMetadataUris(agent: AgentRegistryRecord): Promise<AgentRegistryRecord> {
  let current = agent;

  if (!current.metaplexCollectionUri) {
    const uploaded = await uploadJson(
      buildAgentCollectionMetadata(current),
      `${current.name}-metaplex-collection`
    );
    if (!uploaded.success) {
      throw new MetaplexAgentRegistryError(502, "Failed to upload Metaplex collection metadata", uploaded.error);
    }

    current = await updateAgent(current.id, {
      metaplexCollectionUri: toGatewayUrl(uploaded.url, uploaded.cid),
    });
  }

  if (!current.metaplexAssetUri) {
    const uploaded = await uploadJson(
      buildAgentAssetMetadata(current),
      `${current.name}-metaplex-asset`
    );
    if (!uploaded.success) {
      throw new MetaplexAgentRegistryError(502, "Failed to upload Metaplex asset metadata", uploaded.error);
    }

    current = await updateAgent(current.id, {
      metaplexAssetUri: toGatewayUrl(uploaded.url, uploaded.cid),
    });
  }

  return current;
}

async function ensureCollectionAndAsset(agent: AgentRegistryRecord): Promise<AgentRegistryRecord> {
  let current = await ensureMetadataUris(agent);
  const { umi } = createRegistryUmi(current);

  if (current.metaplexCollectionAddress) {
    const existingCollection = await safeFetchCollectionV1(umi, publicKey(current.metaplexCollectionAddress));
    if (!existingCollection) {
      current = await updateAgent(current.id, {
        metaplexCollectionAddress: null,
      });
    }
  }

  if (!current.metaplexCollectionAddress) {
    // Idempotency guard: persist the keypair BEFORE submitting the mint so a Vercel function
    // timeout between `sendAndConfirm` and the database write cannot leak duplicate collection
    // mints on retry. If the mint actually fails on-chain, the next retry will detect the
    // missing account via `safeFetchCollectionV1` and rotate the keypair.
    const collectionSigner = generateSigner(umi);
    current = await updateAgent(current.id, {
      metaplexCollectionAddress: collectionSigner.publicKey,
    });

    try {
      await createCollection(umi, {
        collection: collectionSigner,
        name: `${current.name} Agent Identity`,
        uri: current.metaplexCollectionUri!,
        updateAuthority: umi.identity.publicKey,
      })
        .useLegacyVersion()
        .sendAndConfirm(umi, {
          confirm: { commitment: "confirmed" },
        });
    } catch (mintError) {
      const onchain = await safeFetchCollectionV1(umi, publicKey(collectionSigner.publicKey));
      if (!onchain) {
        await updateAgent(current.id, { metaplexCollectionAddress: null });
        throw mintError;
      }
    }
  }

  if (current.metaplexAssetAddress) {
    const existingAsset = await safeFetchAssetV1(umi, publicKey(current.metaplexAssetAddress));
    if (!existingAsset) {
      current = await updateAgent(current.id, {
        metaplexAssetAddress: null,
      });
    }
  }

  if (!current.metaplexAssetAddress) {
    const collectionAccount = await fetchCollectionV1(umi, publicKey(current.metaplexCollectionAddress!));
    const assetSigner = generateSigner(umi);

    current = await updateAgent(current.id, {
      metaplexAssetAddress: assetSigner.publicKey,
    });

    try {
      await create(umi, {
        asset: assetSigner,
        collection: collectionAccount,
        owner: umi.identity.publicKey,
        name: current.name,
        uri: current.metaplexAssetUri!,
      })
        .useLegacyVersion()
        .sendAndConfirm(umi, {
          confirm: { commitment: "confirmed" },
        });
    } catch (mintError) {
      const onchain = await safeFetchAssetV1(umi, publicKey(assetSigner.publicKey));
      if (!onchain) {
        await updateAgent(current.id, { metaplexAssetAddress: null });
        throw mintError;
      }
    }
  }

  return current;
}

async function ensureRegistrationUri(agent: AgentRegistryRecord): Promise<AgentRegistryRecord> {
  const registrationUri = getAgentRegistrationUri(agent.id);
  if (agent.metaplexRegistrationUri === registrationUri) {
    return agent;
  }

  return updateAgent(agent.id, {
    metaplexRegistrationUri: registrationUri,
  });
}

async function ensureIdentityAndDelegation(agent: AgentRegistryRecord): Promise<AgentRegistryRecord> {
  let current = agent;
  const { umi } = createRegistryUmi(current);
  const assetPublicKey = publicKey(current.metaplexAssetAddress!);
  const collectionPublicKey = publicKey(current.metaplexCollectionAddress!);
  const authorityPublicKey = publicKey(current.solanaWalletAddress!);
  const identityPda = findAgentIdentityV1Pda(umi, { asset: assetPublicKey })[0];
  const executiveProfilePda = findExecutiveProfileV1Pda(umi, { authority: authorityPublicKey })[0];
  const delegateRecordPda = findExecutionDelegateRecordV1Pda(umi, {
    executiveProfile: publicKey(executiveProfilePda),
    agentAsset: assetPublicKey,
  })[0];

  const existingIdentity = await safeFetchAgentIdentityV1FromSeeds(umi, { asset: assetPublicKey });
  if (!existingIdentity) {
    await registerIdentityV1(umi, {
      asset: assetPublicKey,
      collection: collectionPublicKey,
      authority: umi.identity,
      payer: umi.identity,
      agentRegistrationUri: current.metaplexRegistrationUri!,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "confirmed" },
      });
  }

  const assetAccount = await safeFetchAssetV1(umi, assetPublicKey);
  const agentIdentityPluginUri = assetAccount?.agentIdentities?.[0]?.uri || null;
  if (agentIdentityPluginUri !== current.metaplexRegistrationUri) {
    await updatePlugin(umi, {
      asset: assetPublicKey,
      collection: collectionPublicKey,
      authority: umi.identity,
      payer: umi.identity,
      plugin: {
        type: "AgentIdentity",
        key: { type: "AgentIdentity" },
        uri: current.metaplexRegistrationUri!,
      },
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "confirmed" },
      });
  }

  const existingExecutive = await safeFetchExecutiveProfileV1FromSeeds(umi, {
    authority: authorityPublicKey,
  });
  if (!existingExecutive) {
    await registerExecutiveV1(umi, {
      authority: umi.identity,
      payer: umi.identity,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "confirmed" },
      });
  }

  const existingDelegate = await safeFetchExecutionDelegateRecordV1FromSeeds(umi, {
    executiveProfile: publicKey(executiveProfilePda),
    agentAsset: assetPublicKey,
  });
  if (!existingDelegate) {
    await delegateExecutionV1(umi, {
      executiveProfile: publicKey(executiveProfilePda),
      agentAsset: assetPublicKey,
      agentIdentity: publicKey(identityPda),
      authority: umi.identity,
      payer: umi.identity,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "confirmed" },
      });
  }

  current = await updateAgent(current.id, {
    metaplexIdentityPda: identityPda,
    metaplexExecutiveProfilePda: executiveProfilePda,
    metaplexExecutionDelegatePda: delegateRecordPda,
    metaplexRegisteredAt: current.metaplexRegisteredAt || new Date(),
    metaplexDelegatedAt: new Date(),
  });

  return current;
}

export async function getAgentRegistrationDocument(agentId: string) {
  const agent = await loadAgent(agentId);

  if (
    !agent.metaplexCollectionAddress ||
    !agent.metaplexAssetAddress ||
    !agent.solanaWalletAddress
  ) {
    throw new MetaplexAgentRegistryError(404, "Metaplex registration is not active for this agent");
  }

  const umi = createReadOnlyRegistryUmi();
  const identityPda = findAgentIdentityV1Pda(umi, {
    asset: publicKey(agent.metaplexAssetAddress),
  })[0];
  const executiveProfilePda = findExecutiveProfileV1Pda(umi, {
    authority: publicKey(agent.solanaWalletAddress),
  })[0];
  const delegateRecordPda = findExecutionDelegateRecordV1Pda(umi, {
    executiveProfile: publicKey(executiveProfilePda),
    agentAsset: publicKey(agent.metaplexAssetAddress),
  })[0];

  return buildAgentRegistrationDocument({
    agent,
    collectionAddress: agent.metaplexCollectionAddress,
    assetAddress: agent.metaplexAssetAddress,
    identityPda,
    executiveProfilePda,
    executionDelegatePda: delegateRecordPda,
  });
}

export async function ensureMetaplexAgentRegistrationStep(
  agentId: string
): Promise<AgentMetaplexSyncStepSummary> {
  let agent = await loadAgent(agentId);

  if (!agent.solanaWalletAddress || !agent.solanaWalletEncryptedKey) {
    throw new MetaplexAgentRegistryError(400, "Agent wallet is not configured");
  }

  try {
    if (!agent.metaplexCollectionAddress || !agent.metaplexAssetAddress) {
      agent = await ensureCollectionAndAsset(agent);
      return getMetaplexSyncStepSummary(agent, "SYNCING", "retry_metaplex_identity");
    }

    const previousRegistrationUri = agent.metaplexRegistrationUri;
    agent = await ensureRegistrationUri(agent);
    if (agent.metaplexRegistrationUri !== previousRegistrationUri) {
      return getMetaplexSyncStepSummary(agent, "SYNCING", "retry_metaplex_identity");
    }

    if (!agent.metaplexIdentityPda || !agent.metaplexExecutionDelegatePda) {
      agent = await ensureIdentityAndDelegation(agent);
      return getMetaplexSyncStepSummary(agent, "SYNCING", "retry_synapse_sap");
    }

    const sapResult = await ensureSynapseSapPersisted(agent);
    agent = sapResult.agent;

    return getMetaplexSyncStepSummary(agent, "ACTIVE", null, sapResult.synapseSap);
  } catch (error) {
    if (error instanceof MetaplexAgentRegistryError) {
      throw error;
    }
    if ((error as AgentWalletError)?.name === "AgentWalletError") {
      const walletError = error as AgentWalletError;
      throw new MetaplexAgentRegistryError(walletError.status, walletError.message, walletError.details);
    }
    const message = error instanceof Error ? error.message : "Unknown Metaplex agent registry error";
    throw new MetaplexAgentRegistryError(500, message);
  }
}
export async function ensureMetaplexAgentRegistration(agentId: string): Promise<AgentMetaplexSummary> {
  let agent = await loadAgent(agentId);

  if (!agent.solanaWalletAddress || !agent.solanaWalletEncryptedKey) {
    throw new MetaplexAgentRegistryError(400, "Agent wallet is not configured");
  }

  try {
    agent = await ensureCollectionAndAsset(agent);
    agent = await ensureRegistrationUri(agent);
    agent = await ensureIdentityAndDelegation(agent);

    const sapResult = await ensureSynapseSapPersisted(agent);
    agent = sapResult.agent;

    return getMetaplexSummary(agent, sapResult.synapseSap);
  } catch (error) {
    if (error instanceof MetaplexAgentRegistryError) {
      throw error;
    }
    if ((error as AgentWalletError)?.name === "AgentWalletError") {
      const walletError = error as AgentWalletError;
      throw new MetaplexAgentRegistryError(walletError.status, walletError.message, walletError.details);
    }
    const message = error instanceof Error ? error.message : "Unknown Metaplex agent registry error";
    throw new MetaplexAgentRegistryError(500, message);
  }
}

export async function getAgentMetaplexSummary(agentId: string): Promise<AgentMetaplexSummary | null> {
  const agent = await loadAgent(agentId);
  if (!agent.metaplexAssetAddress && !agent.metaplexIdentityPda && !agent.metaplexRegistrationUri) {
    return null;
  }

  return getMetaplexSummary(agent);
}
