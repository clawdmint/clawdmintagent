import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

function getPublicBaseUrl(request: NextRequest) {
  const configured =
    process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
    "https://cpeg.clawdmint.xyz";
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin.replace(/\/$/, "");
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      name: true,
      symbol: true,
      tokenMint: true,
      collectionAddress: true,
      cluster: true,
      rendererId: true,
      rendererVersion: true,
      maxPegs: true,
      royaltyBps: true,
      marketplaceFeeBps: true,
      status: true,
      identityMode: true,
      canonicalRoot: true,
      agentAssetAddress: true,
      agentIdentityPda: true,
      agentCollectionAddress: true,
      agentWalletAddress: true,
      agentRegistryProgramId: true,
    },
  });

  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const base = getPublicBaseUrl(request);
  const collectionUrl = `${base}/cpeg/${launch.tokenMint}`;
  const image = `${base}/api/cpeg/${launch.tokenMint}/pegs/1/svg`;

  return NextResponse.json({
    name: launch.name,
    symbol: launch.symbol,
    description:
      `cPEG Token-2022 collection. One whole ${launch.symbol} token maps to one numbered PEG identity.`,
    image,
    external_url: collectionUrl,
    animation_url: collectionUrl,
    attributes: [
      { trait_type: "Standard", value: "cPEG" },
      { trait_type: "Network", value: launch.cluster === "devnet" ? "Solana Devnet" : "Solana" },
      { trait_type: "Token Program", value: "Token-2022" },
      { trait_type: "Transfer Hook", value: "Enabled" },
      { trait_type: "Renderer", value: `${launch.rendererId}@${launch.rendererVersion}` },
      { trait_type: "Max PEGs", value: launch.maxPegs },
      { trait_type: "Status", value: launch.status },
      { trait_type: "Identity Mode", value: launch.identityMode },
      ...(launch.agentAssetAddress
        ? [{ trait_type: "Canonical Root", value: launch.canonicalRoot || "metaplex-agent-core" }]
        : []),
    ],
    properties: {
      category: "image",
      files: [{ uri: image, type: "image/svg+xml" }],
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      identity_mode: launch.identityMode,
      canonical_root: launch.canonicalRoot,
      agent_asset_address: launch.agentAssetAddress,
      agent_identity_pda: launch.agentIdentityPda,
      agent_collection_address: launch.agentCollectionAddress,
      agent_wallet_address: launch.agentWalletAddress,
      agent_registry_program_id: launch.agentRegistryProgramId,
      royalty_bps: launch.royaltyBps,
      marketplace_fee_bps: launch.marketplaceFeeBps,
    },
  });
}
