import { NextResponse } from "next/server";
import { buildErc8257ToolIndex } from "@/lib/erc8257-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

  return NextResponse.json(buildErc8257ToolIndex(appUrl), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
