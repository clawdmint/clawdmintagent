/**
 * Root OpenAPI document.
 *
 * Mirrored at /api/x402/openapi.json. AgentCash discovery (used by x402scan)
 * looks for the document at the canonical /openapi.json location, so we serve
 * the same Clawdmint Solana x402 spec from both routes.
 *
 * https://www.x402scan.com/discovery
 */

import { NextResponse } from "next/server";
import { buildClawdmintOpenApiDocument } from "@/lib/x402-openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const document = buildClawdmintOpenApiDocument(appUrl);

  return NextResponse.json(document, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
