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
        payments: {
          x402: true,
          network: "solana",
          settlement: "spl-usdc",
          pricingUrl: `${appUrl}/api/x402/pricing`,
          openapiUrl: `${appUrl}/api/x402/openapi.json`,
        },
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
        {
          id: "agent_token_launch",
          name: "Agent Token Launch",
          description: "Launch Solana-native Metaplex Genesis tokens directly from the verified agent wallet and attach them to agent identity. This owner-agent path does not use AgentCash or x402.",
          tags: ["solana", "metaplex", "token", "genesis"],
        },
        {
          id: "solana_x402_payments",
          name: "Solana x402 Payments",
          description: "Discover and call Clawdmint paid API surfaces with Solana SPL USDC x402 payment headers.",
          tags: ["solana", "x402", "pay.sh", "usdc", "payments"],
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
      description: "Read Solana x402 pricing, settlement metadata, and available paid Clawdmint resources.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "x402_openapi",
      description: "Read the Pay.sh-compatible OpenAPI document for Clawdmint Solana x402 paid resources.",
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
      name: "get_agent_status",
      description: "Read the authenticated agent wallet, funding, verification, and Metaplex readiness status.",
      inputSchema: {
        type: "object",
        properties: {
          agent_api_key: { type: "string", description: "Optional when Authorization: Bearer is already present" },
        },
      },
    },
    {
      name: "get_agent_profile",
      description: "Read the authenticated agent profile, wallet status, collections, and token launches.",
      inputSchema: {
        type: "object",
        properties: {
          agent_api_key: { type: "string", description: "Optional when Authorization: Bearer is already present" },
        },
      },
    },
    {
      name: "sync_metaplex_identity",
      description: "Register or repair the authenticated agent Metaplex identity and delegation from the funded agent wallet.",
      inputSchema: {
        type: "object",
        properties: {
          agent_api_key: { type: "string", description: "Optional when Authorization: Bearer is already present" },
        },
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
    {
      name: "deploy_agent_token",
      description: "Launch a Metaplex Genesis token directly from the authenticated funded agent wallet. Use this for owner-agent token deploys. It does not require AgentCash, x402, or USDC payment; do not ask for supply when launch_type is bondingCurve.",
      inputSchema: {
        type: "object",
        properties: {
          agent_api_key: { type: "string", description: "Optional when Authorization: Bearer is already present" },
          launch_type: { type: "string", enum: ["bondingCurve", "launchpool"] },
          name: { type: "string" },
          symbol: { type: "string" },
          image: { type: "string" },
          description: { type: "string" },
          website_url: { type: "string" },
          twitter: { type: "string" },
          telegram: { type: "string" },
          quote_mint: { type: "string", enum: ["SOL", "USDC"] },
          set_token_on_agent: { type: "boolean" },
          creator_fee_wallet: { type: "string" },
          first_buy_amount: { type: "number" },
        },
        required: ["name", "symbol", "image"],
      },
    },
    {
      name: "list_agent_tokens",
      description: "List Metaplex Genesis tokens launched by the authenticated agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_api_key: { type: "string", description: "Optional when Authorization: Bearer is already present" },
        },
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
