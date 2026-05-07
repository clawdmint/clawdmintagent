import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCpegAgentRootLink } from "@/lib/cpeg-agent-root";

export const dynamic = "force-dynamic";

function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function GET(request: NextRequest) {
  const wallet = (request.nextUrl.searchParams.get("wallet") || "").trim();
  if (!wallet || !isSolanaAddress(wallet)) {
    return NextResponse.json({ success: true, agent_root: null });
  }

  const agent = await prisma.agent
    .findFirst({
      where: {
        status: "VERIFIED",
        deployEnabled: true,
        metaplexAssetAddress: { not: null },
        OR: [{ solanaWalletAddress: wallet }, { ownerWalletAddress: wallet }],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        metaplexAssetAddress: true,
        metaplexIdentityPda: true,
        metaplexCollectionAddress: true,
        solanaWalletAddress: true,
      },
    })
    .catch(() => null);

  if (!agent?.metaplexAssetAddress) {
    return NextResponse.json({ success: true, agent_root: null });
  }

  const link = normalizeCpegAgentRootLink({
    identityMode: "metaplex_agent",
    agentAssetAddress: agent.metaplexAssetAddress,
    agentIdentityPda: agent.metaplexIdentityPda,
    agentCollectionAddress: agent.metaplexCollectionAddress,
    agentWalletAddress: agent.solanaWalletAddress || wallet,
    agentName: agent.name,
  });

  return NextResponse.json({
    success: true,
    agent_root: {
      agent_id: agent.id,
      agent_name: agent.name,
      identity_mode: link.identityMode,
      canonical_root: link.canonicalRoot,
      agent_asset_address: link.agentAssetAddress,
      agent_identity_pda: link.agentIdentityPda,
      agent_collection_address: link.agentCollectionAddress,
      agent_wallet_address: link.agentWalletAddress,
      agent_registry_program_id: link.registryProgramId,
    },
  });
}
