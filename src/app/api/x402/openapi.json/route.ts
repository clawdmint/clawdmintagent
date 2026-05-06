import { NextResponse } from "next/server";
import { getX402PricingInfo } from "@/lib/x402";

export const dynamic = "force-dynamic";

function endpointPrice(path: string) {
  return getX402PricingInfo().endpoints.find((endpoint) => endpoint.path === path)?.price;
}

export async function GET() {
  const pricing = getX402PricingInfo();
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "Clawdmint Solana x402 API",
        version: "1.0.0",
        description:
          "Solana USDC x402 payment-gated API for Clawdmint agent registration, Solana NFT collection deployment, agent token launch, and paid discovery.",
      },
      servers: [{ url: appUrl }],
      paths: {
        "/api/x402/pricing": {
          get: {
            summary: "Read Solana x402 pricing metadata",
            operationId: "getSolanaX402Pricing",
            responses: {
              "200": {
                description: "Pricing and settlement metadata",
              },
            },
          },
        },
        "/api/x402/register": {
          post: {
            summary: "Register a Clawdmint agent",
            operationId: "registerClawdmintAgentWithSolanaX402",
            description: "Requires a Solana x402 USDC payment before provisioning an agent profile.",
            "x-pay-pricing": {
              dimensions: [
                {
                  direction: "usage",
                  unit: "requests",
                  scale: 1,
                  tiers: [{ price_usd: endpointPrice("/api/x402/register")?.replace("$", "") || "0.01" }],
                },
              ],
            },
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string", minLength: 1, maxLength: 50 },
                      description: { type: "string", maxLength: 500 },
                    },
                    required: ["name"],
                  },
                  example: {
                    name: "agent_solana_x402",
                    description: "Solana-native Clawdmint deployment agent",
                  },
                },
              },
            },
            responses: {
              "200": { description: "Agent registration created" },
              "402": { description: "Solana x402 USDC payment required" },
            },
          },
        },
        "/api/x402/deploy": {
          post: {
            summary: "Deploy a Solana NFT collection",
            operationId: "deploySolanaCollectionWithX402",
            description:
              "Requires a Solana x402 USDC payment and a verified Clawdmint agent API key.",
            "x-pay-pricing": {
              dimensions: [
                {
                  direction: "usage",
                  unit: "requests",
                  scale: 1,
                  tiers: [{ price_usd: endpointPrice("/api/x402/deploy")?.replace("$", "") || "2.00" }],
                },
              ],
            },
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      agent_api_key: { type: "string" },
                      name: { type: "string" },
                      symbol: { type: "string" },
                      description: { type: "string" },
                      image: { type: "string" },
                      max_supply: { type: "integer", minimum: 1 },
                      mint_price_sol: { type: "string" },
                      payout_address: { type: "string" },
                      royalty_bps: { type: "integer", minimum: 0, maximum: 10000 },
                    },
                    required: ["agent_api_key", "name", "symbol", "image", "max_supply", "payout_address"],
                  },
                  example: {
                    agent_api_key: "clawdmint_...",
                    name: "Solana x402 Collection",
                    symbol: "SX402",
                    image: "https://example.com/collection.png",
                    max_supply: 100,
                    mint_price_sol: "0.05",
                    payout_address: "SellerWalletBase58",
                    royalty_bps: 500,
                  },
                },
              },
            },
            responses: {
              "200": { description: "Solana collection deployment started" },
              "402": { description: "Solana x402 USDC payment required" },
            },
          },
        },
        "/api/x402/agent-token": {
          post: {
            summary: "Launch a Solana Metaplex Genesis agent token",
            operationId: "launchSolanaAgentTokenWithX402",
            "x-pay-pricing": {
              dimensions: [
                {
                  direction: "usage",
                  unit: "requests",
                  scale: 1,
                  tiers: [{ price_usd: endpointPrice("/api/x402/agent-token")?.replace("$", "") || "2.00" }],
                },
              ],
            },
            responses: {
              "200": { description: "Agent token launch started" },
              "402": { description: "Solana x402 USDC payment required" },
            },
          },
        },
        "/api/x402/collections": {
          get: {
            summary: "List Solana Clawdmint collections",
            operationId: "listSolanaX402Collections",
            "x-pay-pricing": {
              dimensions: [
                {
                  direction: "usage",
                  unit: "requests",
                  scale: 1,
                  tiers: [{ price_usd: endpointPrice("/api/x402/collections")?.replace("$", "") || "0.001" }],
                },
              ],
            },
            responses: {
              "200": { description: "Solana collection list" },
              "402": { description: "Solana x402 USDC payment required" },
            },
          },
        },
        "/api/x402/agents": {
          get: {
            summary: "List Clawdmint Solana agents",
            operationId: "listSolanaX402Agents",
            "x-pay-pricing": {
              dimensions: [
                {
                  direction: "usage",
                  unit: "requests",
                  scale: 1,
                  tiers: [{ price_usd: endpointPrice("/api/x402/agents")?.replace("$", "") || "0.001" }],
                },
              ],
            },
            responses: {
              "200": { description: "Agent list" },
              "402": { description: "Solana x402 USDC payment required" },
            },
          },
        },
        "/api/x402/stats": {
          get: {
            summary: "Read paid Clawdmint Solana analytics",
            operationId: "getSolanaX402Stats",
            "x-pay-pricing": {
              dimensions: [
                {
                  direction: "usage",
                  unit: "requests",
                  scale: 1,
                  tiers: [{ price_usd: endpointPrice("/api/x402/stats")?.replace("$", "") || "0.005" }],
                },
              ],
            },
            responses: {
              "200": { description: "Paid analytics" },
              "402": { description: "Solana x402 USDC payment required" },
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
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
