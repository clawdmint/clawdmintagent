import { NextResponse } from "next/server";
import { buildAgentMarketplaceOpenApiDocument } from "@/lib/agent-marketplace-openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

  return NextResponse.json(buildAgentMarketplaceOpenApiDocument(appUrl), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
