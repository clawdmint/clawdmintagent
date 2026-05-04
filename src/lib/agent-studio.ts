import { createHash, randomBytes } from "crypto";
import type { Agent, AgentSkillInstall, AgentStudioMessage, AgentStudioRun, AgentStudioSession } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { generateAgentOperationalWallet, getAgentOperationalKeypair, getAgentOperationalWalletAddress, getAgentWalletBalance } from "./agent-wallets";
import { ensureMetaplexAgentRegistration, getAgentMetaplexSummary, MetaplexAgentRegistryError } from "./metaplex-agent-registry";
import { AgentTokenLaunchError, launchMetaplexAgentToken } from "./metaplex-agent-tokens";
import { continueMetaplexCollectionDeploy, deployMetaplexCollection, METAPLEX_MINT_ENGINE, MetaplexMintError } from "./metaplex-core-candy-machine";
import { BaseDeployCollectionSchema, DeployCollectionSchema, prepareCollectionAssets, refineDeployCollectionInput } from "./collection-deploy";
import { ensureOpenClawWorkspace, sendOpenClawChat, OpenClawGatewayError } from "./openclaw-gateway";
import { formatCollectionMintPrice, getCollectionNativeToken } from "./collection-chains";

export const DEFAULT_STUDIO_SKILLS = [
  {
    key: "clawdmint-nft-launch",
    title: "NFT Launch",
    description: "Deploy Metaplex-powered NFT collections from the agent wallet.",
    sourceUrl: "/api/tools/openclaw.json",
  },
  {
    key: "clawdmint-token-launch",
    title: "Token Launch",
    description: "Launch Metaplex Genesis agent tokens from the same funded agent wallet.",
    sourceUrl: "/api/tools/openclaw.json",
  },
  {
    key: "clawdmint-registry",
    title: "Metaplex Identity",
    description: "Sync the agent into the Metaplex registry and keep execution delegation healthy.",
    sourceUrl: "/api/tools/openclaw.json",
  },
];

export const CreateStudioAgentSchema = z.object({
  owner_wallet_address: z.string().min(20).max(80),
  name: z.string().min(2).max(48),
  description: z.string().min(12).max(280),
  persona: z.string().min(20).max(1200),
  avatar_url: z.string().url().optional(),
  pfp_data_url: z.string().min(20).optional(),
  pfp_prompt_summary: z.string().max(280).optional(),
  x_handle: z.string().max(64).optional(),
  soul_archetype: z.string().max(64).optional(),
  tone: z.string().max(32).optional(),
  backstory: z.string().max(1200).optional(),
  boundaries: z.array(z.string().max(180)).max(12).default([]),
  skills: z.array(z.string()).max(12).default([]),
});

export const StudioLaunchCollectionSchema = BaseDeployCollectionSchema.pick({
  name: true,
  symbol: true,
  description: true,
  image: true,
  max_supply: true,
  mint_price: true,
  mint_price_sol: true,
  payout_address: true,
  royalty_bps: true,
  metadata: true,
}).extend({
  collection_id: z.string().optional(),
}).superRefine(refineDeployCollectionInput);

export const StudioLaunchTokenSchema = z.object({
  launch_type: z.enum(["bondingCurve", "launchpool"]).default("bondingCurve"),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/),
  image: z.string().url(),
  description: z.string().max(250).optional(),
  website_url: z.string().url().optional(),
  twitter: z.string().max(200).optional(),
  telegram: z.string().max(200).optional(),
  quote_mint: z.enum(["SOL", "USDC"]).default("SOL"),
  set_token_on_agent: z.boolean().default(true),
});

export class AgentStudioError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AgentStudioError";
    this.status = status;
    this.details = details;
  }
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function generateApiKey() {
  return `clawdmint_${randomBytes(24).toString("hex")}`;
}

function buildStudioSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function getAppUrl() {
  return process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
}

function getCanonicalSolanaChain(): "solana" | "solana-devnet" {
  return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana";
}

async function loadStudioAgent(agentId: string, ownerWalletAddress: string) {
  const agent = await prisma.agent.findFirst({
    where: {
      id: agentId,
      studioEnabled: true,
      ownerWalletAddress: {
        equals: ownerWalletAddress,
        mode: "insensitive",
      },
    },
    include: {
      studioSkills: {
        orderBy: { createdAt: "asc" },
      },
      studioSessions: {
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 30,
          },
        },
        take: 8,
      },
      studioRuns: {
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      collections: {
        where: { chain: { in: ["solana", "solana-devnet"] } },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      tokenLaunches: {
        where: { chain: { in: ["solana", "solana-devnet"] } },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  if (!agent) {
    throw new AgentStudioError(404, "Studio agent not found");
  }

  return agent;
}

async function buildWalletStatus(agent: Pick<Agent, "id" | "solanaWalletAddress" | "solanaWalletEncryptedKey">) {
  const address = getAgentOperationalWalletAddress(agent);
  const balance = await getAgentWalletBalance(address);
  return {
    address,
    balance_lamports: balance.lamports.toString(),
    balance_sol: balance.sol,
  };
}

function serializeRun(run: AgentStudioRun) {
  return {
    id: run.id,
    action_type: run.actionType,
    title: run.title,
    status: run.status,
    tx_hash: run.txHash,
    external_run_id: run.externalRunId,
    error: run.error,
    input: run.input,
    output: run.output,
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    completed_at: run.completedAt?.toISOString() || null,
  };
}

function serializeSession(session: AgentStudioSession & { messages?: AgentStudioMessage[] }) {
  return {
    id: session.id,
    title: session.title || "Main Session",
    status: session.status,
    openclaw_session_id: session.openclawSessionId,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
    last_message_at: session.lastMessageAt.toISOString(),
    messages:
      session.messages?.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        event_type: message.eventType,
        tool_name: message.toolName,
        metadata: message.metadata,
        created_at: message.createdAt.toISOString(),
      })) || [],
  };
}

export async function listStudioAgents(ownerWalletAddress: string) {
  const agents = await prisma.agent.findMany({
    where: {
      studioEnabled: true,
      ownerWalletAddress: {
        equals: ownerWalletAddress,
        mode: "insensitive",
      },
    },
    include: {
      collections: {
        where: { chain: { in: ["solana", "solana-devnet"] } },
        select: { id: true },
      },
      tokenLaunches: {
        where: { chain: { in: ["solana", "solana-devnet"] } },
        select: { id: true },
      },
      studioSkills: {
        where: { enabled: true },
        select: {
          skillKey: true,
          title: true,
        },
      },
      studioRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    agents.map(async (agent) => {
      const wallet = await buildWalletStatus(agent);
      const metaplex = await getAgentMetaplexSummary(agent.id);

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatar_url: agent.avatarUrl,
        owner_wallet_address: agent.ownerWalletAddress,
        wallet,
        metaplex,
        openclaw: {
          configured: agent.openclawStatus !== "workspace-only",
          agent_id: agent.openclawAgentId,
          status: agent.openclawStatus,
          chat_enabled: agent.openclawChatEnabled,
          workspace_version: agent.openclawWorkspaceVersion,
        },
        persona: agent.persona,
        soul_profile: agent.soulProfile,
        collections_count: agent.collections.length,
        token_launches_count: agent.tokenLaunches.length,
        skills: agent.studioSkills,
        latest_run: agent.studioRuns[0] ? serializeRun(agent.studioRuns[0]) : null,
        created_at: agent.createdAt.toISOString(),
      };
    })
  );
}

export async function createStudioAgent(input: z.infer<typeof CreateStudioAgentSchema>) {
  const apiKey = generateApiKey();
  const wallet = generateAgentOperationalWallet();
  const slug = buildStudioSlug(input.name);
  const openclawAgentId = `clawdmint-${slug}-${randomBytes(4).toString("hex")}`;

  const selectedCatalog = DEFAULT_STUDIO_SKILLS.filter(
    (skill) => input.skills.length === 0 || input.skills.includes(skill.key)
  );

  const agent = await prisma.$transaction(async (tx) => {
    const created = await tx.agent.create({
      data: {
        name: input.name,
        description: input.description,
        persona: input.persona,
        avatarUrl: input.avatar_url || input.pfp_data_url,
        xHandle: input.x_handle,
        eoa: `studio_${randomBytes(16).toString("hex")}`,
        ownerWalletAddress: input.owner_wallet_address,
        ownerWalletChain: "solana",
        studioEnabled: true,
        openclawAgentId,
        openclawStatus: "workspace-only",
        openclawChatEnabled: false,
        solanaWalletAddress: wallet.address,
        solanaWalletEncryptedKey: wallet.encryptedSecretKey,
        solanaWalletExportedAt: new Date(),
        hmacKeyHash: hashApiKey(apiKey),
        status: "VERIFIED",
        deployEnabled: true,
        verifiedAt: new Date(),
        soulProfile: {
          style: "premium-operator",
          persona: input.persona,
          archetype: input.soul_archetype || null,
          tone: input.tone || null,
          backstory: input.backstory || null,
          boundaries: input.boundaries,
          pfpPromptSummary: input.pfp_prompt_summary || null,
        },
      },
    });

    await tx.agentSkillInstall.createMany({
      data: selectedCatalog.map((skill) => ({
        agentId: created.id,
        skillKey: skill.key,
        title: skill.title,
        description: skill.description,
        sourceUrl: skill.sourceUrl,
      })),
    });

    await tx.agentStudioSession.create({
      data: {
        agentId: created.id,
        ownerWalletAddress: input.owner_wallet_address,
        title: "Main Session",
      },
    });

    return created;
  });

  const profileUrl = `${getAppUrl()}/studio/${agent.id}`;
  const openclawWorkspace = await ensureOpenClawWorkspace({
    agentId: openclawAgentId,
    name: agent.name,
    description: agent.description || "",
    persona: input.persona,
    walletAddress: wallet.address,
    ownerWalletAddress: input.owner_wallet_address,
    skills: selectedCatalog.map((skill) => ({
      key: skill.key,
      title: skill.title,
      description: skill.description,
    })),
    soulProfile: {
      archetype: input.soul_archetype || null,
      tone: input.tone || null,
      backstory: input.backstory || null,
      boundaries: input.boundaries,
      pfpPromptSummary: input.pfp_prompt_summary || null,
    },
    profileUrl,
  });

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      openclawWorkspacePath: openclawWorkspace.workspacePath,
      openclawStatus: openclawWorkspace.provisioned ? "cli-ready" : "workspace-only",
      openclawChatEnabled: openclawWorkspace.provisioned,
    },
  });

  return {
    id: agent.id,
    name: agent.name,
    owner_wallet_address: input.owner_wallet_address,
    wallet: {
      address: wallet.address,
      managed: true,
      network: getCanonicalSolanaChain(),
    },
    openclaw: {
      agent_id: openclawAgentId,
      configured: openclawWorkspace.provisioned,
      workspace_path: openclawWorkspace.workspacePath,
      chat_url: `${getAppUrl()}/studio/${agent.id}?tab=chat`,
    },
    next_url: profileUrl,
  };
}

export async function getStudioAgentDetail(agentId: string, ownerWalletAddress: string) {
  const agent = await loadStudioAgent(agentId, ownerWalletAddress);
  const wallet = await buildWalletStatus(agent);
  const metaplex = await getAgentMetaplexSummary(agent.id);

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatar_url: agent.avatarUrl,
    owner_wallet_address: agent.ownerWalletAddress,
    persona: agent.persona,
    soul_profile: agent.soulProfile,
    x_handle: agent.xHandle,
    status: agent.status,
    wallet,
    metaplex,
    openclaw: {
      configured: agent.openclawStatus !== "workspace-only",
      agent_id: agent.openclawAgentId,
      status: agent.openclawStatus,
      chat_enabled: agent.openclawChatEnabled,
      workspace_path: agent.openclawWorkspacePath,
      workspace_version: agent.openclawWorkspaceVersion,
    },
    skills: agent.studioSkills.map((skill) => ({
      id: skill.id,
      key: skill.skillKey,
      title: skill.title,
      description: skill.description,
      enabled: skill.enabled,
      source_url: skill.sourceUrl,
      created_at: skill.createdAt.toISOString(),
    })),
    sessions: agent.studioSessions.map(serializeSession),
    runs: agent.studioRuns.map(serializeRun),
    collections: agent.collections.map((collection) => ({
      id: collection.id,
      address: collection.address,
      name: collection.name,
      symbol: collection.symbol,
      image_url: collection.imageUrl,
      status: collection.status,
      collection_url: `${getAppUrl()}/collection/${collection.address}`,
      mint_price_native: formatCollectionMintPrice(collection.mintPrice, collection.chain),
      native_token: getCollectionNativeToken(collection.chain),
      created_at: collection.createdAt.toISOString(),
    })),
    token_launches: agent.tokenLaunches.map((launch) => ({
      id: launch.id,
      name: launch.tokenName,
      symbol: launch.tokenSymbol,
      token_address: launch.tokenAddress,
      launch_url: launch.launchUrl,
      tx_hash: launch.txHash,
      created_at: launch.createdAt.toISOString(),
    })),
    created_at: agent.createdAt.toISOString(),
  };
}

export async function createStudioSession(agentId: string, ownerWalletAddress: string, title?: string) {
  await loadStudioAgent(agentId, ownerWalletAddress);

  const session = await prisma.agentStudioSession.create({
    data: {
      agentId,
      ownerWalletAddress,
      title: title?.trim() || "New Session",
    },
  });

  return serializeSession(session);
}

export async function sendStudioChatMessage(input: {
  agentId: string;
  ownerWalletAddress: string;
  sessionId: string;
  content: string;
}) {
  const agent = await loadStudioAgent(input.agentId, input.ownerWalletAddress);
  const session = agent.studioSessions.find((item) => item.id === input.sessionId);
  if (!session) {
    throw new AgentStudioError(404, "Session not found");
  }

  const trimmed = input.content.trim();
  if (!trimmed) {
    throw new AgentStudioError(400, "Message cannot be empty");
  }

  await prisma.agentStudioMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: trimmed,
      eventType: "text",
    },
  });

  const contextMessages = await prisma.agentStudioMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 16,
  });

  let assistantText: string;

  try {
    const response = await sendOpenClawChat({
      agentId: agent.openclawAgentId || `clawdmint-${agent.id}`,
      sessionId: session.openclawSessionId || session.id,
      messages: [
        {
          role: "system",
          content: `You are ${agent.name}. You are a real OpenClaw runtime bridged through Clawdmint. Speak like a premium operator console. Help with NFT launches, token launches, wallet funding, and Metaplex identity health.`,
        },
        ...contextMessages.map((message) => ({
          role: message.role as "user" | "assistant" | "system",
          content: message.content,
        })),
      ],
    });
    assistantText = response.content;
    if (response.sessionId && response.sessionId !== session.openclawSessionId) {
      await prisma.agentStudioSession.update({
        where: { id: session.id },
        data: { openclawSessionId: response.sessionId },
      });
    }
  } catch (error) {
    if (error instanceof OpenClawGatewayError) {
      assistantText = `OpenClaw gateway is not reachable yet. Workspace is provisioned for this agent, but runtime chat is unavailable until the gateway is connected.`;
    } else {
      throw error;
    }
  }

  const assistantMessage = await prisma.agentStudioMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: assistantText,
      eventType: "text",
    },
  });

  await prisma.agentStudioSession.update({
    where: { id: session.id },
    data: {
      lastMessageAt: assistantMessage.createdAt,
    },
  });

  return {
    user: {
      role: "user",
      content: trimmed,
    },
    assistant: {
      id: assistantMessage.id,
      role: assistantMessage.role,
      content: assistantMessage.content,
      created_at: assistantMessage.createdAt.toISOString(),
    },
  };
}

export async function toggleStudioSkill(input: {
  agentId: string;
  ownerWalletAddress: string;
  skillKey: string;
  enabled: boolean;
}) {
  await loadStudioAgent(input.agentId, input.ownerWalletAddress);
  const skill = await prisma.agentSkillInstall.findFirst({
    where: {
      agentId: input.agentId,
      skillKey: input.skillKey,
    },
  });

  if (!skill) {
    throw new AgentStudioError(404, "Skill not found");
  }

  const updated = await prisma.agentSkillInstall.update({
    where: { id: skill.id },
    data: { enabled: input.enabled },
  });

  return {
    id: updated.id,
    key: updated.skillKey,
    enabled: updated.enabled,
  };
}

export async function runStudioAction(input: {
  agentId: string;
  ownerWalletAddress: string;
  action: "sync-metaplex" | "launch-collection" | "launch-token";
  payload: Record<string, unknown>;
}) {
  const agent = await loadStudioAgent(input.agentId, input.ownerWalletAddress);
  const run = await prisma.agentStudioRun.create({
    data: {
      agentId: agent.id,
      actionType: input.action,
      title:
        input.action === "sync-metaplex"
          ? "Sync Metaplex identity"
          : input.action === "launch-collection"
            ? "Launch NFT collection"
            : "Launch token",
      status: "running",
      input: input.payload as Prisma.InputJsonValue,
    },
  });

  try {
    let output: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined = undefined;
    let txHash: string | null = null;

    if (input.action === "sync-metaplex") {
      const metaplex = await ensureMetaplexAgentRegistration(agent.id);
      output = metaplex as unknown as Prisma.InputJsonValue;
    }

    if (input.action === "launch-collection") {
      const parsed = StudioLaunchCollectionSchema.safeParse({
        ...input.payload,
        chain: getCanonicalSolanaChain(),
        authority_address: getAgentOperationalWalletAddress(agent),
      });
      if (!parsed.success) {
        throw new AgentStudioError(400, "Invalid collection launch payload", parsed.error.flatten());
      }

      const data = parsed.data;
      const collection = await prisma.collection.create({
        data: {
          agentId: agent.id,
          agentEoa: agent.eoa,
          chain: getCanonicalSolanaChain(),
          authorityAddress: getAgentOperationalWalletAddress(agent),
          name: data.name,
          symbol: data.symbol,
          description: data.description,
          imageUrl: null,
          baseUri: "pending",
          mintEngine: METAPLEX_MINT_ENGINE,
          maxSupply: data.max_supply,
          mintPrice: "0",
          royaltyBps: data.royalty_bps,
          payoutAddress: data.payout_address,
          status: "DEPLOYING",
          address: `pending_${Date.now()}`,
          deployTxHash: "pending",
        },
      });

      const assets = await prepareCollectionAssets(parsed.data as any, agent.name);
      const initialDeployment = await deployMetaplexCollection(
        getAgentOperationalKeypair(agent),
        {
          authority: assets.authorityAddress,
          payoutAddress: data.payout_address,
          name: data.name,
          symbol: data.symbol,
          baseUri: assets.baseUri,
          maxSupply: data.max_supply,
          mintPriceLamports: BigInt(assets.mintPriceRaw),
          royaltyBps: data.royalty_bps,
        },
        { maxConfigBatchesPerRun: 1 }
      );

      const updated = await prisma.collection.update({
        where: { id: collection.id },
        data: {
          address: initialDeployment.collectionAddress,
          deployTxHash: initialDeployment.signature,
          mintAddress: initialDeployment.candyMachineAddress,
          baseUri: assets.baseUri,
          imageUrl: assets.imageHttpUrl,
          mintPrice: assets.mintPriceRaw,
          status: initialDeployment.isFullyLoaded ? "ACTIVE" : "DEPLOYING",
          deployedAt: initialDeployment.isFullyLoaded ? new Date() : null,
        },
      });

      txHash = initialDeployment.signature;
      output = {
        collectionId: updated.id,
        collectionAddress: updated.address,
        collectionUrl: `${getAppUrl()}/collection/${updated.address}`,
        status: updated.status,
      };
    }

    if (input.action === "launch-token") {
      const parsed = StudioLaunchTokenSchema.safeParse(input.payload);
      if (!parsed.success) {
        throw new AgentStudioError(400, "Invalid token launch payload", parsed.error.flatten());
      }

      const metaplex = await ensureMetaplexAgentRegistration(agent.id);
      const launched = await launchMetaplexAgentToken(agent, {
        launchType: parsed.data.launch_type,
        wallet: getAgentOperationalWalletAddress(agent),
        network: process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana-mainnet",
        quoteMint: parsed.data.quote_mint,
        token: {
          name: parsed.data.name,
          symbol: parsed.data.symbol,
          image: parsed.data.image,
          ...(parsed.data.description ? { description: parsed.data.description } : {}),
          ...(parsed.data.website_url || parsed.data.twitter || parsed.data.telegram
            ? {
                externalLinks: {
                  ...(parsed.data.website_url ? { website: parsed.data.website_url } : {}),
                  ...(parsed.data.twitter ? { twitter: parsed.data.twitter } : {}),
                  ...(parsed.data.telegram ? { telegram: parsed.data.telegram } : {}),
                },
              }
            : {}),
        },
        ...(parsed.data.set_token_on_agent && metaplex.asset_address
          ? {
              agent: {
                mint: metaplex.asset_address,
                setToken: true,
              },
            }
          : {}),
      } as any);

      const saved = await prisma.tokenLaunch.create({
        data: {
          agentId: agent.id,
          tokenName: parsed.data.name,
          tokenSymbol: parsed.data.symbol,
          tokenAddress: launched.mintAddress,
          txHash: launched.signature,
          launchType: parsed.data.launch_type,
          network: launched.network,
          genesisAccount: launched.genesisAccount,
          launchId: launched.launchId,
          launchUrl: launched.launchUrl,
          description: parsed.data.description,
          imageUrl: parsed.data.image,
          websiteUrl: parsed.data.website_url,
          tweetUrl: parsed.data.twitter,
          chain: launched.chain,
          launcherAddress: launched.launcherAddress,
          feeRecipient: launched.launcherAddress,
          setOnAgent: parsed.data.set_token_on_agent,
          simulated: false,
        },
      });

      txHash = saved.txHash;
      output = {
        tokenLaunchId: saved.id,
        tokenAddress: saved.tokenAddress,
        launchUrl: saved.launchUrl,
      };
    }

    const completed = await prisma.agentStudioRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        output,
        txHash,
        completedAt: new Date(),
      },
    });

    return serializeRun(completed);
  } catch (error) {
    const message =
      error instanceof AgentStudioError ||
      error instanceof MetaplexAgentRegistryError ||
      error instanceof AgentTokenLaunchError ||
      error instanceof MetaplexMintError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown studio action error";

    const failed = await prisma.agentStudioRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: message,
        completedAt: new Date(),
      },
    });

    if (
      error instanceof AgentStudioError ||
      error instanceof MetaplexAgentRegistryError ||
      error instanceof AgentTokenLaunchError ||
      error instanceof MetaplexMintError
    ) {
      throw error;
    }

    throw new AgentStudioError(500, failed.error || "Studio action failed");
  }
}




