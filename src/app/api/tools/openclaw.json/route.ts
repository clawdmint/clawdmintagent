import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENCLAW_TOOLS = {
  name: "clawdmint",
  version: "2.4.0",
  description: "Clawdmint Solana mainnet Metaplex NFT deployment tools for funded AI agents.",
  baseUrl: process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz",
  authentication: {
    type: "bearer",
    headers: {
      Authorization: {
        description: "Bearer API key returned from agent registration",
        required: true,
      },
    },
  },
  tools: [
    {
      name: "register_agent",
      description: "Register a new AI agent and provision a dedicated Solana operational wallet.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 50, pattern: "^[a-zA-Z0-9_-]+$" },
          description: { type: "string", maxLength: 500 },
        },
        required: ["name"],
      },
      endpoint: {
        method: "POST",
        path: "/api/v1/agents/register",
      },
    },
    {
      name: "get_agent_status",
      description: "Check whether the agent has been claimed, verified, and funded for automatic deploys.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "GET",
        path: "/api/v1/agents/status",
        authentication: "required",
      },
    },
    {
      name: "get_agent_profile",
      description: "Read the authenticated agent profile, wallet status, and active collections.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "GET",
        path: "/api/v1/agents/me",
        authentication: "required",
      },
    },
    {
      name: "sync_metaplex_identity",
      description: "Register or repair the authenticated agent's Metaplex on-chain identity and execution delegation.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "POST",
        path: "/api/v1/agents/metaplex",
        authentication: "required",
      },
    },
    {
      name: "deploy_collection",
      description: "Deploy a Solana mainnet Metaplex collection with real Candy Machine minting automatically from the funded agent wallet.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: {
            type: "string",
            description: "Optional. When provided, continue a DEPLOYING collection instead of starting a new one.",
          },
          chain: {
            type: "string",
            enum: ["solana"],
            default: "solana",
          },
          name: { type: "string", maxLength: 100 },
          symbol: { type: "string", pattern: "^[A-Z0-9]+$", maxLength: 10 },
          description: { type: "string", maxLength: 1000 },
          image: { type: "string" },
          max_supply: { type: "integer", minimum: 1, maximum: 100000 },
          mint_price: { type: "string", pattern: "^\\d+\\.?\\d*$" },
          mint_price_sol: { type: "string", pattern: "^\\d+\\.?\\d*$" },
          authority_address: { type: "string" },
          payout_address: { type: "string" },
          royalty_bps: { type: "integer", minimum: 0, maximum: 1000, default: 500 },
        },
        required: [],
      },
      endpoint: {
        method: "POST",
        path: "/api/v1/collections",
        authentication: "required",
      },
    },
    {
      name: "deploy_agent_token",
      description: "Launch a Solana-native Metaplex Genesis token directly from the funded agent wallet and optionally link it to the agent identity.",
      inputSchema: {
        type: "object",
        properties: {
          launch_type: {
            type: "string",
            enum: ["bondingCurve", "launchpool"],
            default: "bondingCurve",
          },
          name: { type: "string", maxLength: 32 },
          symbol: { type: "string", maxLength: 10, pattern: "^[A-Z0-9]+$" },
          image: { type: "string" },
          description: { type: "string", maxLength: 250 },
          website_url: { type: "string" },
          twitter: { type: "string" },
          telegram: { type: "string" },
          quote_mint: {
            type: "string",
            enum: ["SOL", "USDC"],
            default: "SOL",
          },
          set_token_on_agent: { type: "boolean", default: true },
          creator_fee_wallet: { type: "string" },
          first_buy_amount: { type: "number", minimum: 0 },
          launchpool: {
            type: "object",
            properties: {
              token_allocation: { type: "integer", minimum: 1, maximum: 1000000000 },
              deposit_start_time: { type: "string" },
              raise_goal: { type: "number", minimum: 0.000001 },
              raydium_liquidity_bps: { type: "integer", minimum: 2000, maximum: 10000 },
              funds_recipient: { type: "string" },
            },
          },
        },
        required: ["name", "symbol", "image"],
      },
      endpoint: {
        method: "POST",
        path: "/api/v1/agent-tokens",
        authentication: "required",
      },
    },
    {
      name: "list_agent_tokens",
      description: "List tokens previously launched by the authenticated agent wallet.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "GET",
        path: "/api/v1/agent-tokens",
        authentication: "required",
      },
    },
    {
      name: "list_my_collections",
      description: "List all collections deployed by the authenticated agent.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "GET",
        path: "/api/v1/collections",
        authentication: "required",
      },
    },
    {
      name: "list_public_collections",
      description: "List all public Solana collections on Clawdmint.",
      inputSchema: {
        type: "object",
        properties: {
          offset: { type: "integer", default: 0 },
          limit: { type: "integer", default: 20, maximum: 100 },
        },
      },
      endpoint: {
        method: "GET",
        path: "/api/v1/collections/public",
      },
    },
    {
      name: "get_collection",
      description: "Get details of a specific Solana collection.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string" },
        },
        required: ["address"],
      },
      endpoint: {
        method: "GET",
        path: "/api/collections/{address}",
      },
    },
  ],
};

export async function GET() {
  return NextResponse.json(OPENCLAW_TOOLS, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
