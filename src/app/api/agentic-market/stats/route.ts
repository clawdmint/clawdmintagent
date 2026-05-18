import { NextRequest } from "next/server";
import { agenticMarketPaymentRequired } from "@/lib/agentic-market-x402";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATS_EXAMPLE = {
  success: true,
  payment_method: "x402",
  settlement_network: "base",
  stats: {
    agents: {
      total: 128,
      verified: 64,
    },
    collections: {
      total: 42,
      active: 18,
      sold_out: 7,
    },
    mints: {
      total: 1205,
      last_24h: 33,
      total_quantity: 1205,
    },
    network: {
      cluster: "mainnet-beta",
      name: "Solana",
    },
  },
  leaderboard: {
    top_agents: [
      {
        id: "agent_example",
        name: "Example Agent",
        collection_count: 4,
      },
    ],
  },
  recent_collections: [
    {
      id: "collection_example",
      name: "Example Collection",
      status: "ACTIVE",
      total_minted: 25,
    },
  ],
  timestamp: "2026-05-18T00:00:00.000Z",
};

const STATS_EXAMPLE_SCHEMA = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    payment_method: { type: "string" },
    settlement_network: { type: "string" },
    stats: {
      type: "object",
      properties: {
        agents: {
          type: "object",
          properties: {
            total: { type: "integer" },
            verified: { type: "integer" },
          },
          required: ["total", "verified"],
        },
        collections: {
          type: "object",
          properties: {
            total: { type: "integer" },
            active: { type: "integer" },
            sold_out: { type: "integer" },
          },
          required: ["total", "active", "sold_out"],
        },
        mints: {
          type: "object",
          properties: {
            total: { type: "integer" },
            last_24h: { type: "integer" },
            total_quantity: { type: "integer" },
          },
          required: ["total", "last_24h", "total_quantity"],
        },
        network: {
          type: "object",
          properties: {
            cluster: { type: "string" },
            name: { type: "string" },
          },
          required: ["cluster", "name"],
        },
      },
      required: ["agents", "collections", "mints", "network"],
    },
    leaderboard: {
      type: "object",
      properties: {
        top_agents: {
          type: "array",
          items: { type: "object" },
        },
      },
      required: ["top_agents"],
    },
    recent_collections: {
      type: "array",
      items: { type: "object" },
    },
    timestamp: { type: "string" },
  },
  required: [
    "success",
    "payment_method",
    "settlement_network",
    "stats",
    "leaderboard",
    "recent_collections",
    "timestamp",
  ],
  additionalProperties: true,
};

export async function GET(request: NextRequest) {
  return agenticMarketPaymentRequired(request, {
    amount: "5000",
    name: "Clawdmint Premium Solana Analytics",
    description: "Premium Clawdmint Solana analytics and statistics, exposed through a Base USDC x402 compatibility endpoint for Agentic Market.",
    category: "Data",
    tags: ["clawdmint", "solana", "nft", "agents", "analytics", "x402"],
    outputExample: STATS_EXAMPLE,
    outputExampleSchema: STATS_EXAMPLE_SCHEMA,
  });
}
