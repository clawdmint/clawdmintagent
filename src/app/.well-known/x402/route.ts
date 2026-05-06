/**
 * x402 discovery fan-out endpoint.
 *
 * Used by x402scan / Bazaar-style facilitators that prefer the
 * `/.well-known/x402` compatibility document over OpenAPI.
 *
 * Spec:
 *  - https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md
 */

import { NextResponse } from "next/server";
import { getX402OwnershipProofs, getX402PricingInfo } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function GET() {
  const pricing = getX402PricingInfo();
  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const resources = pricing.endpoints.map((endpoint) => endpoint.url);
  const ownershipProofs = getX402OwnershipProofs();

  return NextResponse.json(
    {
      version: 1,
      service: {
        name: "Clawdmint",
        homepage: baseUrl,
        description:
          "Solana-native x402 USDC payment-gated APIs for Clawdmint agent registration, NFT collection deploys, and discovery feeds.",
        contact: `${baseUrl}/contact`,
        protocol: "x402",
        settlement: "solana-spl-usdc",
      },
      openapi: `${baseUrl}/api/x402/openapi.json`,
      pricing: `${baseUrl}/api/x402/pricing`,
      resources,
      payment: {
        protocol: pricing.protocol,
        version: pricing.version,
        network: pricing.network,
        currency: pricing.currency,
        decimals: pricing.decimals,
        asset: pricing.asset,
        payTo: pricing.payTo,
      },
      ownershipProofs,
      instructions:
        "Probe a resource with HTTP GET to receive the x402 challenge (Payment-Required header + JSON body). Submit a signed SPL USDC transfer in X-PAYMENT to settle.",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
