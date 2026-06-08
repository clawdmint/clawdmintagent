import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENCLAW_TOOLS = {
  name: "clawdmint",
  version: "2.6.0",
  description: "Clawdmint Solana mainnet Metaplex deployment tools for funded AI agents. Supports edition and curated PFP NFT launches. Use direct authenticated tools for owner agent operations; x402 is only for paid third-party API access.",
  baseUrl: process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz",
  payments: {
    x402: {
      enabled: true,
      network: "solana",
      settlement: "spl-usdc",
      pricingPath: "/api/x402/pricing",
      openapiPath: "/api/x402/openapi.json",
      paymentHeaders: ["PAYMENT-REQUIRED", "X-PAYMENT", "PAYMENT-RESPONSE"],
    },
  },
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
      name: "x402_pricing",
      description: "Discover Solana x402 USDC prices, settlement wallet, mint, and paid Clawdmint resources.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "GET",
        path: "/api/x402/pricing",
      },
    },
    {
      name: "x402_openapi",
      description: "Read the Pay.sh-compatible OpenAPI document for Clawdmint Solana x402 paid resources. Do not use this for direct owner-agent token deploys.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      endpoint: {
        method: "GET",
        path: "/api/x402/openapi.json",
      },
    },
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
      name: "x402_register_agent",
      description: "Register a new AI agent through the Solana x402 paid endpoint. Requires an X-PAYMENT header carrying a signed USDC transfer transaction.",
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
        path: "/api/x402/register",
        payment: "x402",
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
      name: "x402_deploy_collection",
      description: "Deploy a Solana collection through the Solana x402 paid endpoint. Requires X-PAYMENT plus a verified agent_api_key.",
      inputSchema: {
        type: "object",
        properties: {
          agent_api_key: { type: "string" },
          chain: {
            type: "string",
            enum: ["solana"],
            default: "solana",
          },
          name: { type: "string", maxLength: 100 },
          symbol: { type: "string", pattern: "^[A-Z0-9]+$", maxLength: 10 },
          description: { type: "string", maxLength: 1000 },
          image: { type: "string" },
          launch_style: {
            type: "string",
            enum: ["edition", "curated_pfp"],
            default: "edition",
            description: "edition uses one artwork for every NFT; curated_pfp uses unique item metadata.",
          },
          assets_manifest_url: {
            type: "string",
            description: "HTTPS or IPFS JSON manifest for curated_pfp item metadata.",
          },
          items: {
            type: "array",
            maxItems: 10000,
            description: "Inline curated_pfp items. Length must match max_supply.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                image: { type: "string" },
                attributes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      trait_type: { type: "string" },
                      value: { oneOf: [{ type: "string" }, { type: "number" }] },
                    },
                    required: ["trait_type", "value"],
                  },
                },
                external_url: { type: "string" },
              },
              required: ["image"],
            },
          },
          max_supply: { type: "integer", minimum: 1, maximum: 100000 },
          mint_price: { type: "string", pattern: "^\\d+\\.?\\d*$" },
          mint_price_sol: { type: "string", pattern: "^\\d+\\.?\\d*$" },
          authority_address: { type: "string" },
          payout_address: { type: "string" },
          royalty_bps: { type: "integer", minimum: 0, maximum: 1000, default: 500 },
        },
        required: ["agent_api_key", "name", "symbol", "image", "max_supply", "payout_address"],
      },
      endpoint: {
        method: "POST",
        path: "/api/x402/deploy",
        payment: "x402",
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
          launch_style: {
            type: "string",
            enum: ["edition", "curated_pfp"],
            default: "edition",
            description: "edition uses one artwork for every NFT; curated_pfp uses unique item metadata.",
          },
          assets_manifest_url: {
            type: "string",
            description: "HTTPS or IPFS JSON manifest for curated_pfp item metadata.",
          },
          items: {
            type: "array",
            maxItems: 10000,
            description: "Inline curated_pfp items. Length must match max_supply.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", maxLength: 100 },
                description: { type: "string", maxLength: 1000 },
                image: { type: "string" },
                attributes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      trait_type: { type: "string" },
                      value: { oneOf: [{ type: "string" }, { type: "number" }] },
                    },
                    required: ["trait_type", "value"],
                  },
                },
                external_url: { type: "string" },
              },
              required: ["image"],
            },
          },
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
      description: "Launch a Solana-native Metaplex Genesis token directly from the funded agent wallet and optionally link it to the agent identity. Use this for owner-agent token deploys. It uses the agent wallet for Solana network costs and does not require AgentCash, x402, or USDC payment.",
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
