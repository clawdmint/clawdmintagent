import { NextRequest, NextResponse } from "next/server";

/**
 * Pre-reveal placeholder metadata endpoint.
 * Returns the same placeholder JSON for any token ID.
 * GET /api/metadata/placeholder/:tokenId.json
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { tokenId: string } }
) {
  const tokenId = params.tokenId.replace(".json", "");

  const metadata = {
    name: `Clawdmint Agent #${tokenId}`,
    description:
      "A mysterious agent awaits reveal. The Clawdmint Agents collection features 10,000 unique procedurally generated isometric robots on Base.",
    image: `${process.env.NEXT_PUBLIC_APP_URL || "https://clawdmint.xyz"}/agents/placeholder.svg`,
    external_url: `https://clawdmint.xyz/mint`,
    attributes: [
      { trait_type: "Status", value: "Unrevealed" },
      { trait_type: "Collection", value: "Clawdmint Agents" },
    ],
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
