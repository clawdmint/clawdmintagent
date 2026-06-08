import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BaseDeployCollectionSchema,
  refineDeployCollectionInput,
} from "@/lib/collection-deploy";
import { withX402Payment, withX402Probe, X402_PRICING } from "@/lib/x402";

export const dynamic = "force-dynamic";

const X402DeploySchema = BaseDeployCollectionSchema.extend({
  agent_api_key: z.string().optional(),
}).superRefine(refineDeployCollectionInput);

const DEPLOY_X402_OPTIONS = {
  price: X402_PRICING.DEPLOY_COLLECTION,
  description: "Deploy a Solana NFT collection via Clawdmint after funding and verification. Supports Metaplex Core Collection and Core Candy Machine launch flows.",
  discovery: {
    name: "Clawdmint Solana Collection Deploy (x402)",
    category: "nft-deploy",
    tags: ["solana", "x402", "usdc", "metaplex", "nft-collection"],
    input: {
      type: "http" as const,
      method: "POST" as const,
      bodyType: "json" as const,
      bodyFields: {
        agent_api_key: { type: "string", description: "Verified Clawdmint agent API key", required: true },
        name: { type: "string", description: "Collection name", required: true },
        symbol: { type: "string", description: "Collection symbol", required: true },
        description: { type: "string", description: "Optional collection description", required: false },
        image: { type: "string", description: "HTTPS, IPFS, or data:image collection cover image", required: true },
        launch_style: { type: "string", description: "Launch style: edition or core_collection", required: false },
        assets_manifest_url: { type: "string", description: "HTTPS or IPFS JSON manifest containing core_collection items", required: false },
        items: { type: "array", description: "Inline core_collection item metadata; length must match max_supply", required: false },
        max_supply: { type: "integer", description: "Maximum mintable supply", required: true, minimum: 1 },
        mint_price_sol: { type: "string", description: "Mint price in SOL", required: false },
        payout_address: { type: "string", description: "Solana payout address (base58)", required: true },
        royalty_bps: { type: "integer", description: "Royalty in basis points (0-10000)", required: false, minimum: 0, maximum: 10000 },
      },
    },
    output: {
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
    },
  },
};

export async function GET(request: NextRequest) {
  return withX402Probe(request, DEPLOY_X402_OPTIONS);
}

export async function POST(request: NextRequest) {
  return withX402Payment(
    request,
    DEPLOY_X402_OPTIONS,
    async () => {
      try {
        const body = await request.json();
        const validation = X402DeploySchema.safeParse(body);

        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid request",
              details: validation.error.errors,
            },
            { status: 400 }
          );
        }

        const data = validation.data;
        if (!data.agent_api_key) {
          return NextResponse.json(
            {
              success: false,
              error: "agent_api_key is required for Solana x402 deploys",
              hint: "First create an agent via /api/x402/register or /api/v1/agents/register, fund and verify it, then retry with agent_api_key",
            },
            { status: 400 }
          );
        }

        const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
        const deployResponse = await fetch(`${appUrl}/api/v1/collections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.agent_api_key}`,
          },
          body: JSON.stringify({
            ...body,
            chain: "solana",
            agent_api_key: undefined,
          }),
        });

        const deployPayload = await deployResponse.json();
        if (!deployResponse.ok) {
          return NextResponse.json(
            {
              success: false,
              payment_method: "x402",
              settlement_network: "solana",
              upstream: "api/v1/collections",
              ...deployPayload,
            },
            { status: deployResponse.status }
          );
        }

        return NextResponse.json({
          ...deployPayload,
          payment_method: "x402",
          settlement_network: "solana",
          message: "Collection deployment started via Solana x402 payment and Clawdmint deploy flow.",
        });
      } catch (error) {
        console.error("[x402/deploy] Deploy error:", error);
        return NextResponse.json(
          { success: false, error: "Deployment failed" },
          { status: 500 }
        );
      }
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, Authorization",
      "Access-Control-Expose-Headers":
        "PAYMENT-REQUIRED, X-PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE",
    },
  });
}
