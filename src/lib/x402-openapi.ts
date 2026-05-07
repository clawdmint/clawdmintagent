/**
 * Shared OpenAPI document builder for the Clawdmint Solana x402 surface.
 *
 * Compatible with:
 *  - AgentCash discovery (`@agentcash/discovery`) used by x402scan
 *    https://www.x402scan.com/discovery
 *  - Pay.sh / x402 v1 + v2 facilitators
 *
 * Each paid operation declares `x-payment-info` with `protocols` and a `price`
 * object, alongside an explicit `responses["402"]` and full request/response
 * JSON schemas, which is what x402scan's parser requires.
 */

import { getX402OwnershipProofs, getX402PricingInfo } from "@/lib/x402";

interface OpenApiPaymentInfo {
  price: {
    mode: "fixed";
    currency: "USD";
    amount: string;
  };
  protocols: Array<Record<string, unknown>>;
}

function priceForPath(path: string): string {
  const pricing = getX402PricingInfo();
  const raw = pricing.endpoints.find((endpoint) => endpoint.path === path)?.price;
  if (!raw) return "0.01";
  return raw.replace(/^\$/, "");
}

function buildPaymentInfo(path: string, fallback: string): OpenApiPaymentInfo {
  const amount = priceForPath(path) || fallback;
  return {
    price: { mode: "fixed", currency: "USD", amount },
    protocols: [{ x402: {} }],
  };
}

function jsonContent(schema: Record<string, unknown>, example?: unknown) {
  return {
    "application/json": example !== undefined ? { schema, example } : { schema },
  };
}

const PAYMENT_REQUIRED_RESPONSE = {
  description: "Payment Required",
  content: jsonContent({
    type: "object",
    properties: {
      x402Version: { type: "integer" },
      accepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scheme: { type: "string" },
            network: { type: "string" },
            maxAmountRequired: { type: "string" },
            resource: { type: "string" },
            description: { type: "string" },
            mimeType: { type: "string" },
            payTo: { type: "string" },
            maxTimeoutSeconds: { type: "integer" },
            asset: { type: "string" },
            extra: { type: "object" },
            outputSchema: { type: "object" },
            extensions: { type: "object" },
          },
          required: ["scheme", "network", "maxAmountRequired", "payTo", "asset"],
        },
      },
      payment: { type: "object" },
    },
    required: ["x402Version", "accepts"],
  }),
};

export function buildClawdmintOpenApiDocument(appUrl: string) {
  const pricing = getX402PricingInfo();
  const ownershipProofs = getX402OwnershipProofs();

  const registerInputSchema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 50,
        description: "Unique agent handle (alphanumeric, _ or -)",
      },
      description: {
        type: "string",
        maxLength: 500,
        description: "Optional human-readable description of the agent",
      },
    },
    required: ["name"],
  };

  const registerOutputSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payment_method: { type: "string" },
      settlement_network: { type: "string" },
      agent: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          api_key: { type: "string" },
          claim_url: { type: "string" },
          verification_code: { type: "string" },
          wallet: {
            type: "object",
            properties: {
              address: { type: "string" },
              network: { type: "string" },
            },
          },
        },
      },
    },
    required: ["success"],
  };

  const deployInputSchema = {
    type: "object",
    properties: {
      agent_api_key: { type: "string", description: "Verified Clawdmint agent API key" },
      name: { type: "string" },
      symbol: { type: "string" },
      description: { type: "string" },
      image: { type: "string", format: "uri" },
      max_supply: { type: "integer", minimum: 1 },
      mint_price_sol: { type: "string" },
      payout_address: { type: "string" },
      royalty_bps: { type: "integer", minimum: 0, maximum: 10000 },
    },
    required: ["agent_api_key", "name", "symbol", "image", "max_supply", "payout_address"],
  };

  const deployOutputSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payment_method: { type: "string" },
      settlement_network: { type: "string" },
      collection: {
        type: "object",
        properties: {
          address: { type: "string" },
          chain: { type: "string" },
          status: { type: "string" },
        },
      },
    },
    required: ["success"],
  };

  const agentTokenInputSchema = {
    type: "object",
    properties: {
      agent_api_key: { type: "string" },
      name: { type: "string" },
      symbol: { type: "string" },
      description: { type: "string" },
      image: { type: "string", format: "uri" },
      launch_type: { type: "string", enum: ["bondingCurve", "launchpool"] },
      quote_mint: { type: "string", enum: ["SOL", "USDC"] },
      set_token_on_agent: { type: "boolean" },
    },
    required: ["agent_api_key", "name", "symbol", "image"],
  };

  const agentTokenOutputSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payment_method: { type: "string" },
      settlement_network: { type: "string" },
      token: {
        type: "object",
        properties: {
          mint: { type: "string" },
          chain: { type: "string" },
        },
      },
    },
    required: ["success"],
  };

  const collectionsListSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payment_method: { type: "string" },
      settlement_network: { type: "string" },
      collections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            address: { type: "string" },
            chain: { type: "string" },
            name: { type: "string" },
            symbol: { type: "string" },
            total_minted: { type: "integer" },
            max_supply: { type: "integer" },
            status: { type: "string" },
          },
        },
      },
      pagination: {
        type: "object",
        properties: {
          total: { type: "integer" },
          limit: { type: "integer" },
          offset: { type: "integer" },
          has_more: { type: "boolean" },
        },
      },
    },
    required: ["success", "collections"],
  };

  const agentsListSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payment_method: { type: "string" },
      settlement_network: { type: "string" },
      agents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            solana_wallet_address: { type: "string" },
            avatar_url: { type: "string" },
            status: { type: "string" },
            collection_count: { type: "integer" },
          },
        },
      },
      pagination: {
        type: "object",
        properties: {
          total: { type: "integer" },
          limit: { type: "integer" },
          offset: { type: "integer" },
          has_more: { type: "boolean" },
        },
      },
    },
    required: ["success", "agents"],
  };

  const statsOutputSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payment_method: { type: "string" },
      settlement_network: { type: "string" },
      stats: {
        type: "object",
        properties: {
          agents: { type: "object" },
          collections: { type: "object" },
          mints: { type: "object" },
          network: { type: "object" },
        },
      },
      leaderboard: { type: "object" },
      recent_collections: { type: "array", items: { type: "object" } },
      timestamp: { type: "string" },
    },
    required: ["success", "stats"],
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Clawdmint Solana x402 API",
      version: "1.0.0",
      description:
        "Solana USDC x402 payment-gated API for Clawdmint agent registration, Solana NFT collection deployment, agent token launch, and paid discovery.",
      contact: { name: "Clawdmint", url: appUrl },
      "x-guidance":
        "Clawdmint is a Solana-native x402 service. Pay USDC on Solana mainnet to call paid endpoints. Use POST /api/x402/register first to provision an agent and API key, then call POST /api/x402/deploy to publish a Metaplex NFT collection or POST /api/x402/agent-token to launch a Metaplex Genesis token. Read-only discovery endpoints (/api/x402/agents, /api/x402/collections, /api/x402/stats) are also paid in USDC. Every paid call expects an X-PAYMENT header carrying a signed SPL USDC transfer; the 402 challenge body lists the exact payTo address, mint, and amount.",
    },
    servers: [{ url: appUrl }],
    "x-discovery": {
      protocol: "x402",
      settlement: "solana-spl-usdc",
      wellKnown: `${appUrl}/.well-known/x402`,
      pricing: `${appUrl}/api/x402/pricing`,
      ownershipProofs,
    },
    paths: {
      "/api/x402/pricing": {
        get: {
          summary: "Read Solana x402 pricing metadata",
          operationId: "getSolanaX402Pricing",
          tags: ["discovery"],
          responses: {
            "200": {
              description: "Pricing and settlement metadata",
              content: jsonContent({
                type: "object",
                properties: {
                  protocol: { type: "string" },
                  version: { type: "integer" },
                  network: { type: "string" },
                  settlement: { type: "string" },
                  payTo: { type: "string" },
                  asset: { type: "string" },
                  currency: { type: "string" },
                  decimals: { type: "integer" },
                  endpoints: { type: "array", items: { type: "object" } },
                },
              }),
            },
          },
        },
      },
      "/api/x402/register": {
        post: {
          summary: "Register a Clawdmint agent",
          operationId: "registerClawdmintAgentWithSolanaX402",
          description:
            "Provision a verified Clawdmint agent profile and dedicated Solana wallet. Requires a Solana x402 USDC payment.",
          tags: ["agent-registry"],
          "x-payment-info": buildPaymentInfo("/api/x402/register", "0.01"),
          requestBody: {
            required: true,
            content: jsonContent(registerInputSchema, {
              name: "agent_solana_x402",
              description: "Solana-native Clawdmint deployment agent",
            }),
          },
          responses: {
            "200": {
              description: "Agent registration created",
              content: jsonContent(registerOutputSchema),
            },
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
        get: {
          summary: "Probe x402 challenge for agent registration",
          operationId: "probeRegisterAgent",
          tags: ["agent-registry"],
          "x-payment-info": buildPaymentInfo("/api/x402/register", "0.01"),
          responses: {
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
      },
      "/api/x402/deploy": {
        post: {
          summary: "Deploy a Solana NFT collection",
          operationId: "deploySolanaCollectionWithX402",
          description:
            "Deploy a Solana Metaplex NFT collection through Clawdmint. Requires a Solana x402 USDC payment and a verified agent API key.",
          tags: ["nft-deploy"],
          "x-payment-info": buildPaymentInfo("/api/x402/deploy", "2.00"),
          requestBody: {
            required: true,
            content: jsonContent(deployInputSchema, {
              agent_api_key: "clawdmint_...",
              name: "Solana x402 Collection",
              symbol: "SX402",
              image: "https://example.com/collection.png",
              max_supply: 100,
              mint_price_sol: "0.05",
              payout_address: "SellerWalletBase58",
              royalty_bps: 500,
            }),
          },
          responses: {
            "200": {
              description: "Solana collection deployment started",
              content: jsonContent(deployOutputSchema),
            },
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
        get: {
          summary: "Probe x402 challenge for collection deploy",
          operationId: "probeDeployCollection",
          tags: ["nft-deploy"],
          "x-payment-info": buildPaymentInfo("/api/x402/deploy", "2.00"),
          responses: {
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
      },
      "/api/x402/agent-token": {
        post: {
          summary: "Launch a Solana Metaplex Genesis agent token",
          operationId: "launchSolanaAgentTokenWithX402",
          description:
            "Launch a Solana-native Metaplex Genesis token for a verified Clawdmint agent. Requires a Solana x402 USDC payment.",
          tags: ["token-launch"],
          "x-payment-info": buildPaymentInfo("/api/x402/agent-token", "2.00"),
          requestBody: {
            required: true,
            content: jsonContent(agentTokenInputSchema, {
              agent_api_key: "clawdmint_...",
              name: "Clawdmint Genesis",
              symbol: "CMGEN",
            }),
          },
          responses: {
            "200": {
              description: "Agent token launch started",
              content: jsonContent(agentTokenOutputSchema),
            },
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
        get: {
          summary: "Probe x402 challenge for agent token launch",
          operationId: "probeAgentToken",
          tags: ["token-launch"],
          "x-payment-info": buildPaymentInfo("/api/x402/agent-token", "2.00"),
          responses: {
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
      },
      "/api/x402/collections": {
        get: {
          summary: "List Solana Clawdmint collections",
          operationId: "listSolanaX402Collections",
          tags: ["nft-discovery"],
          "x-payment-info": buildPaymentInfo("/api/x402/collections", "0.001"),
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
            { name: "status", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Solana collection list",
              content: jsonContent(collectionsListSchema),
            },
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
      },
      "/api/x402/agents": {
        get: {
          summary: "List Clawdmint Solana agents",
          operationId: "listSolanaX402Agents",
          tags: ["agent-discovery"],
          "x-payment-info": buildPaymentInfo("/api/x402/agents", "0.001"),
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
          ],
          responses: {
            "200": {
              description: "Agent list",
              content: jsonContent(agentsListSchema),
            },
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
      },
      "/api/x402/stats": {
        get: {
          summary: "Read paid Clawdmint Solana analytics",
          operationId: "getSolanaX402Stats",
          tags: ["analytics"],
          "x-payment-info": buildPaymentInfo("/api/x402/stats", "0.005"),
          responses: {
            "200": {
              description: "Paid analytics",
              content: jsonContent(statsOutputSchema),
            },
            "402": PAYMENT_REQUIRED_RESPONSE,
          },
        },
      },
    },
    "x-clawdmint-x402": {
      protocol: pricing.protocol,
      network: pricing.network,
      settlement: pricing.settlement,
      currency: pricing.currency,
      asset: pricing.asset,
      payTo: pricing.payTo,
    },
  };
}
