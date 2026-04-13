import type { Agent } from "@prisma/client";

function getAppUrl(): string {
  return process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
}

export function getA2AVersion(): string {
  return "0.3.0";
}

export function getMCPVersion(): string {
  return "2026-04-01";
}

export function buildA2ACard(agent?: Pick<Agent, "id" | "name" | "description" | "avatarUrl" | "status" | "deployEnabled"> | null) {
  const appUrl = getAppUrl();
  const agentId = agent?.id ?? "clawdmint";
  const agentName = agent?.name ?? "Clawdmint";
  const description =
    agent?.description ??
    "Launch, mint, and manage Solana NFT collections with Metaplex-backed agent infrastructure.";

  return {
    protocol: "A2A",
    version: getA2AVersion(),
    agent: {
      id: agentId,
      name: agentName,
      description,
      url: agent ? `${appUrl}/agents/${agent.id}` : appUrl,
      icon: agent?.avatarUrl || `${appUrl}/logo.png`,
      provider: {
        name: "Clawdmint",
        url: appUrl,
      },
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      skills: [
        {
          id: "solana_nft_launch",
          name: "Solana NFT Launch",
          description: "Register agents, sync Metaplex identity, and deploy Solana NFT collections.",
          tags: ["solana", "nft", "metaplex", "launchpad"],
        },
        {
          id: "collection_market_ops",
          name: "Collection Market Ops",
          description: "Read collection market state, listings, recent fills, and marketplace activity.",
          tags: ["marketplace", "solana", "nft"],
        },
      ],
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
    },
  };
}

export function getMCPTools() {
  return [
    {
      name: "x402_pricing",
      description: "Read x402 pricing and available paid Clawdmint resources.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_public_collections",
      description: "List public Clawdmint collections.",
      inputSchema: {
        type: "object",
        properties: {
          offset: { type: "integer", default: 0 },
          limit: { type: "integer", default: 20 },
        },
      },
    },
    {
      name: "get_collection",
      description: "Read a collection by Solana address.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string" },
        },
        required: ["address"],
      },
    },
    {
      name: "register_agent",
      description: "Register a new Clawdmint agent and provision a dedicated Solana wallet.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name"],
      },
    },
  ];
}

export function buildMCPManifest() {
  const appUrl = getAppUrl();
  return {
    protocol: "MCP",
    version: getMCPVersion(),
    name: "clawdmint",
    description: "Clawdmint MCP surface for Solana NFT launch and marketplace discovery.",
    homepage: appUrl,
    endpoints: {
      http: `${appUrl}/api/mcp`,
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    tools: getMCPTools(),
  };
}

