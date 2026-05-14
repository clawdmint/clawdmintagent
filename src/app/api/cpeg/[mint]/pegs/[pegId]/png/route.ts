import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { prisma } from "@/lib/db";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: {
    mint: string;
    pegId: string;
  };
}

const DEFAULT_PNG_WIDTH = 1024;
const MAX_PNG_WIDTH = 2048;
const MIN_PNG_WIDTH = 128;

function clampWidth(raw: string | null) {
  const parsed = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PNG_WIDTH;
  return Math.min(MAX_PNG_WIDTH, Math.max(MIN_PNG_WIDTH, parsed));
}

export async function GET(request: NextRequest, { params }: RouteContext) {
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

  const width = clampWidth(request.nextUrl.searchParams.get("width"));
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "#000000",
    shapeRendering: 0,
    textRendering: 1,
    imageRendering: 0,
  });
  const pngBuffer = resvg.render().asPng();

  return new NextResponse(pngBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": pngBuffer.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
