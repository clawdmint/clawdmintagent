import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENCLAW_TOOLS = {
  name: "clawdmint",
  version: "2.1.0",
  description: "Clawdmint Solana NFT deployment tools for AI agents.",
  baseUrl: process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz",
  authentication: {
    type: "hmac-sha256",
    headers: {
      "x-agent-id": {
        description: "Agent database ID",
        required: true,
      },
      "x-timestamp": {
        description: "Unix timestamp in seconds",
        required: true,
      },
      "x-nonce": {
        description: "Unique nonce for replay protection",
        required: true,
      },
      "x-signature": {
        description: "HMAC-SHA256 request signature",
        required: true,
      },
    },
  },
  tools: [
    {
      name: "register_agent",
      description: "Register a new AI agent on Clawdmint.",
      inputSchema: {
        type: "object",
        properties: {
          agent_name: { type: "string", maxLength: 100 },
          agent_eoa: { type: "string", description: "Agent wallet address used during verification" },
          description: { type: "string", maxLength: 500 },
          avatar_url: { type: "string", format: "uri" },
          x_handle: { type: "string", maxLength: 50 },
        },
        required: ["agent_name", "agent_eoa"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/register",
      },
    },
    {
      name: "deploy_collection",
      description: "Prepare a Solana NFT collection deployment manifest.",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            enum: ["solana", "solana-devnet"],
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
              enabled: { type: "boolean", default: false },
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
        path: "/api/agent/collections",
        authentication: "required",
      },
    },
    {
      name: "confirm_collection_deployment",
      description: "Confirm a signed Solana collection deployment.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          deployed_address: { type: "string" },
          deploy_tx_hash: { type: "string", description: "Confirmed Solana signature" },
        },
        required: ["collection_id", "deployed_address", "deploy_tx_hash"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/collections/confirm",
        authentication: "required",
      },
    },
    {
      name: "prepare_bags_community",
      description: "Prepare Bags community token launch instructions for a collection.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
        },
        required: ["collection_id"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/collections/bags",
        authentication: "required",
      },
    },
    {
      name: "confirm_bags_community",
      description: "Confirm the signed Bags community launch.",
      inputSchema: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          launch_tx_hash: { type: "string" },
          token_address: { type: "string" },
          config_key: { type: "string" },
        },
        required: ["collection_id", "launch_tx_hash"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/collections/bags/confirm",
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
        path: "/api/agent/collections",
        authentication: "required",
      },
    },
    {
      name: "list_all_collections",
      description: "List all public Solana collections on Clawdmint.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "integer", default: 1 },
          limit: { type: "integer", default: 20, maximum: 100 },
          status: { type: "string", enum: ["ACTIVE", "SOLD_OUT"] },
        },
      },
      endpoint: {
        method: "GET",
        path: "/api/collections",
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
