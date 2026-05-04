import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClawPegTraits } from "@/lib/clawpeg-renderer";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    mint: string;
    pegId: string;
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const pegId = Number(params.pegId);
  if (!Number.isInteger(pegId) || pegId < 1) {
    return NextResponse.json({ success: false, error: "Invalid peg id" }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch
    .findUnique({
      where: { tokenMint: params.mint },
    })
    .catch(() => null);
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG collection not found" }, { status: 404 });
  }

  const traits = getClawPegTraits({
    rendererId: launch.rendererId,
    rendererVersion: launch.rendererVersion,
    collectionSeed: launch.collectionSeed,
    tokenMint: launch.tokenMint,
    pegId,
    params: (launch.rendererParams as Record<string, unknown> | null) || {},
  });

  return NextResponse.json({
    success: true,
    peg: {
      id: pegId,
      name: `${launch.symbol} cPEG #${pegId}`,
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      image: `/api/cpeg/${launch.tokenMint}/pegs/${pegId}/svg`,
      traits,
    },
  });
}
