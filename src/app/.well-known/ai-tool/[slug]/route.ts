import { NextResponse } from "next/server";
import { buildErc8257ToolManifest } from "@/lib/erc8257-tools";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const manifest = buildErc8257ToolManifest(appUrl, slug);

  if (!manifest) {
    return NextResponse.json(
      {
        success: false,
        error: "Unknown Clawdmint ERC-8257 tool manifest",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
