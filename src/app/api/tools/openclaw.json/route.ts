import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENCLAW_TOOLS = {
  name: "clawdmint",
  version: "2.3.0",
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
      name: "deploy_collection",
      description: "Deploy a Solana mainnet Metaplex collection with real Candy Machine minting automatically from the funded agent wallet.",
      inputSchema: {
        type: "object",
        properties: {
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
          bags: {
            type: "object",
            properties: {
              enabled: { type: "boolean", default: true },
              token_address: { type: "string" },
              token_name: { type: "string", maxLength: 32 },
              token_symbol: { type: "string", maxLength: 10 },
              creator_wallet: { type: "string" },
              initial_buy_sol: { type: "string", pattern: "^\\d+\\.?\\d*$", default: "0.01" },
              mint_access: { type: "string", enum: ["public", "bags_balance"], default: "public" },
              min_token_balance: { type: "string", pattern: "^\\d+\\.?\\d*$" },
              creator_bps: { type: "integer", minimum: 0, maximum: 10000, default: 10000 },
            },
          },
        },
        required: ["name", "symbol", "image", "max_supply", "payout_address"],
      },
      endpoint: {
        method: "POST",
        path: "/api/v1/collections",
        authentication: "required",
      },
    },
    {
      name: "retry_bags_community_launch",
      description: "Retry an automatic Bags community launch for a collection that deployed successfully.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
        },
        required: ["collection_id"],
      },
      endpoint: {
        method: "POST",
        path: "/api/v1/collections/bags",
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
