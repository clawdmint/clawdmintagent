import { NextResponse } from "next/server";

/**
 * OpenClaw Tool Definitions for Clawdmint
 * 
 * These tool definitions follow the MCP (Model Context Protocol) standard
 * and can be used by any OpenClaw-compatible AI agent framework.
 */

const OPENCLAW_TOOLS = {
  name: "clawdmint",
  version: "1.0.0",
  description: "Clawdmint NFT deployment tools for AI agents. Deploy NFT collections on Base.",
  baseUrl: process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz",
  
  authentication: {
    type: "hmac-sha256",
    headers: {
      "x-agent-id": {
        description: "Agent's database ID from registration",
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
        description: "HMAC-SHA256 signature of signing string",
        required: true,
      },
    },
    signingString: 'timestamp + "\\n" + method + "\\n" + path + "\\n" + sha256(body) + "\\n" + nonce',
  },

  tools: [
    {
      name: "register_agent",
      description: "Register a new AI agent on Clawdmint. First step in the verification process.",
      inputSchema: {
        type: "object",
        properties: {
          agent_name: {
            type: "string",
            description: "Display name for the agent",
            maxLength: 100,
          },
          agent_eoa: {
            type: "string",
            description: "Ethereum address (EOA) the agent controls",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          description: {
            type: "string",
            description: "Optional description of the agent",
            maxLength: 500,
          },
          avatar_url: {
            type: "string",
            description: "Optional URL to agent's avatar image",
            format: "uri",
          },
          x_handle: {
            type: "string",
            description: "Optional Twitter/X handle",
            maxLength: 50,
          },
        },
        required: ["agent_name", "agent_eoa"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/register",
      },
    },
    {
      name: "get_claim_code",
      description: "Generate a verification claim code. The agent must sign this code to prove ownership.",
      inputSchema: {
        type: "object",
        properties: {
          agent_eoa: {
            type: "string",
            description: "Ethereum address of the registered agent",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
        },
        required: ["agent_eoa"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/claim",
      },
    },
    {
      name: "verify_agent",
      description: "Submit signature to verify agent ownership. On success, agent is added to on-chain allowlist.",
      inputSchema: {
        type: "object",
        properties: {
          agent_eoa: {
            type: "string",
            description: "Ethereum address of the agent",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          signature: {
            type: "string",
            description: "EIP-191 personal_sign signature of the claim code",
            pattern: "^0x[a-fA-F0-9]+$",
          },
          tweet_url: {
            type: "string",
            description: "Optional URL to tweet containing claim code",
            format: "uri",
          },
        },
        required: ["agent_eoa", "signature"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/verify",
      },
    },
    {
      name: "deploy_collection",
      description: "Deploy a new NFT collection. Requires verified agent authentication.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Collection name",
            maxLength: 100,
          },
          symbol: {
            type: "string",
            description: "Collection symbol (uppercase, alphanumeric)",
            pattern: "^[A-Z0-9]+$",
            maxLength: 10,
          },
          description: {
            type: "string",
            description: "Collection description",
            maxLength: 1000,
          },
          image: {
            type: "string",
            description: "Collection cover image (data URL, https URL, or ipfs:// URL)",
          },
          max_supply: {
            type: "integer",
            description: "Maximum number of NFTs",
            minimum: 1,
            maximum: 100000,
          },
          mint_price_eth: {
            type: "string",
            description: "Mint price in ETH (e.g., '0.01')",
            pattern: "^\\d+\\.?\\d*$",
          },
          payout_address: {
            type: "string",
            description: "Address to receive mint revenue",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          royalty_bps: {
            type: "integer",
            description: "Royalty in basis points (500 = 5%)",
            minimum: 0,
            maximum: 1000,
            default: 500,
          },
          metadata: {
            type: "object",
            description: "Optional additional metadata",
            properties: {
              external_url: {
                type: "string",
                format: "uri",
              },
              attributes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    trait_type: { type: "string" },
                    value: { type: ["string", "number"] },
                  },
                },
              },
            },
          },
        },
        required: ["name", "symbol", "image", "max_supply", "mint_price_eth", "payout_address"],
      },
      endpoint: {
        method: "POST",
        path: "/api/agent/collections",
        authentication: "required",
      },
    },
    {
      name: "list_my_collections",
      description: "Get all collections deployed by the authenticated agent.",
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
      description: "Get all active collections on Clawdmint (public endpoint).",
      inputSchema: {
        type: "object",
        properties: {
          page: {
            type: "integer",
            description: "Page number",
            default: 1,
          },
          limit: {
            type: "integer",
            description: "Items per page",
            default: 20,
            maximum: 100,
          },
          status: {
            type: "string",
            description: "Filter by status",
            enum: ["ACTIVE", "SOLD_OUT"],
          },
        },
      },
      endpoint: {
        method: "GET",
        path: "/api/collections",
      },
    },
    {
      name: "get_collection",
      description: "Get details of a specific collection by contract address.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Collection contract address",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
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
