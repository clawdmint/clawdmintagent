import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";

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

  const svg = renderClawPegSvg({
    rendererId: launch.rendererId,
    rendererVersion: launch.rendererVersion,
    collectionSeed: launch.collectionSeed,
    tokenMint: launch.tokenMint,
    pegId,
    params: (launch.rendererParams as Record<string, unknown> | null) || {},
  });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
