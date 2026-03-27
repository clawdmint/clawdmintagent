import {
  create,
  createCollection,
  fetchCollectionV1,
  mplCore,
  safeFetchAssetV1,
  safeFetchCollectionV1,
} from "@metaplex-foundation/mpl-core";
import {
  IDENTITY_ID,
  mplAgentIdentity,
  mplAgentTools,
} from "@metaplex-foundation/mpl-agent-registry";
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
import { getEnv } from "./env";
import { uploadJson } from "./ipfs";
import { getSolanaRpcUrl } from "./solana-collections";

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
};

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
}

function getAppUrl(): string {
  return getEnv("NEXT_PUBLIC_APP_URL", "https://clawdmint.xyz");
}

function getSolanaCluster(): "devnet" | "mainnet-beta" {
  return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet" ? "devnet" : "mainnet-beta";
}

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

function buildAgentRegistrationDocument(input: {
  agent: AgentRegistryRecord;
  collectionAddress: string;
  assetAddress: string;
  identityPda: string;
  executiveProfilePda: string;
  executionDelegatePda: string;
}) {
  const appUrl = getAppUrl();
  const cluster = getSolanaCluster();

  return {
    standard: "ERC-8004",
    version: "1.0",
    name: input.agent.name,
    description:
      input.agent.description ||
      `${input.agent.name} is a verified Clawdmint agent with Solana deploy capability.`,
    image: buildAgentImageUrl(input.agent),
    external_url: `${appUrl}/agents/${input.agent.id}`,
    owner: {
      wallet: input.agent.solanaWalletAddress,
      chain: cluster,
    },
    onchain: {
      collection: input.collectionAddress,
      asset: input.assetAddress,
      identity_pda: input.identityPda,
      executive_profile_pda: input.executiveProfilePda,
      execution_delegate_record_pda: input.executionDelegatePda,
    },
    services: [
      {
        name: "web",
        endpoint: `${appUrl}/agents/${input.agent.id}`,
      },
      {
        name: "skill",
        endpoint: `${appUrl}/skill.md`,
        capabilities: ["solana-nft-deploy", "metaplex-candy-machine", "agent-wallet-automation"],
      },
      {
        name: "openclaw",
        endpoint: `${appUrl}/api/tools/openclaw.json`,
        capabilities: ["register_agent", "deploy_collection", "get_agent_profile"],
      },
    ],
    registrations: [
      {
        address: input.identityPda,
        registry: `solana:${cluster}:${IDENTITY_ID}`,
      },
    ],
  };
}

function createRegistryUmi(agent: AgentRegistryRecord) {
  const signer = getAgentOperationalKeypair(agent);
  const umi = createUmi(getSolanaRpcUrl());
  umi.use(mplCore());
  umi.use(mplAgentIdentity());
  umi.use(mplAgentTools());
  umi.use(keypairIdentity(fromWeb3JsKeypair(signer)));
  return { umi, signer };
}

function getMetaplexSummary(agent: AgentRegistryRecord): AgentMetaplexSummary {
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
  };
}

async function loadAgent(agentId: string): Promise<AgentRegistryRecord> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
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
    },
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
    select: {
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
    },
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
    const collectionSigner = generateSigner(umi);
    await createCollection(umi, {
      collection: collectionSigner,
      name: `${current.name} Agent Identity`,
      uri: current.metaplexCollectionUri!,
      updateAuthority: umi.identity.publicKey,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "finalized" },
      });

    current = await updateAgent(current.id, {
      metaplexCollectionAddress: collectionSigner.publicKey,
    });
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

    await create(umi, {
      asset: assetSigner,
      collection: collectionAccount,
      owner: umi.identity.publicKey,
      updateAuthority: umi.identity.publicKey,
      name: current.name,
      uri: current.metaplexAssetUri!,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "finalized" },
      });

    current = await updateAgent(current.id, {
      metaplexAssetAddress: assetSigner.publicKey,
    });
  }

  return current;
}

async function ensureRegistrationUri(agent: AgentRegistryRecord): Promise<AgentRegistryRecord> {
  if (agent.metaplexRegistrationUri) {
    return agent;
  }

  const { umi } = createRegistryUmi(agent);
  const identityPda = findAgentIdentityV1Pda(umi, {
    asset: publicKey(agent.metaplexAssetAddress!),
  })[0];
  const executiveProfilePda = findExecutiveProfileV1Pda(umi, {
    authority: publicKey(agent.solanaWalletAddress!),
  })[0];
  const delegateRecordPda = findExecutionDelegateRecordV1Pda(umi, {
    executiveProfile: publicKey(executiveProfilePda),
    agentAsset: publicKey(agent.metaplexAssetAddress!),
  })[0];

  const uploaded = await uploadJson(
    buildAgentRegistrationDocument({
      agent,
      collectionAddress: agent.metaplexCollectionAddress!,
      assetAddress: agent.metaplexAssetAddress!,
      identityPda,
      executiveProfilePda,
      executionDelegatePda: delegateRecordPda,
    }),
    `${agent.name}-metaplex-registration`
  );

  if (!uploaded.success) {
    throw new MetaplexAgentRegistryError(502, "Failed to upload Metaplex agent registration document", uploaded.error);
  }

  return updateAgent(agent.id, {
    metaplexRegistrationUri: toGatewayUrl(uploaded.url, uploaded.cid),
  });
}

async function ensureIdentityAndDelegation(agent: AgentRegistryRecord): Promise<AgentRegistryRecord> {
  let current = agent;
  const { umi } = createRegistryUmi(current);
  const assetPublicKey = publicKey(current.metaplexAssetAddress!);
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
      collection: publicKey(current.metaplexCollectionAddress!),
      authority: umi.identity,
      payer: umi.identity,
      agentRegistrationUri: current.metaplexRegistrationUri!,
    })
      .useLegacyVersion()
      .sendAndConfirm(umi, {
        confirm: { commitment: "finalized" },
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
        confirm: { commitment: "finalized" },
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
        confirm: { commitment: "finalized" },
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

export async function ensureMetaplexAgentRegistration(agentId: string): Promise<AgentMetaplexSummary> {
  let agent = await loadAgent(agentId);

  if (!agent.solanaWalletAddress || !agent.solanaWalletEncryptedKey) {
    throw new MetaplexAgentRegistryError(400, "Agent wallet is not configured");
  }

  try {
    agent = await ensureCollectionAndAsset(agent);
    agent = await ensureRegistrationUri(agent);
    agent = await ensureIdentityAndDelegation(agent);
    return getMetaplexSummary(agent);
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
