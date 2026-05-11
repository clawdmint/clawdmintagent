import { NextRequest, NextResponse } from "next/server";
import { CLAWPEG_DEFAULT_RENDERER_ID, CLAWPEG_DEFAULT_RENDERER_VERSION } from "@/lib/clawpeg";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";
import {
  CLAWPEG_RENDERER_V3_PALETTES,
  CLAWPEG_RENDERER_V3_SUBJECTS,
} from "@/lib/clawpeg-renderer-v3";

export const dynamic = "force-dynamic";

const ALLOWED_SUBJECTS = new Set<string>(CLAWPEG_RENDERER_V3_SUBJECTS);
const ALLOWED_PALETTES = new Set<string>(CLAWPEG_RENDERER_V3_PALETTES);
const ALLOWED_VIBES = new Set(["balanced", "loud", "holy", "dark"]);

function safeOption(value: string | null, allowed: Set<string>, fallback: string) {
  const normalized = String(value || fallback).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const pegId = Number(searchParams.get("pegId") || "1");
  if (!Number.isInteger(pegId) || pegId < 1 || pegId > 10_000) {
    return NextResponse.json({ success: false, error: "Invalid peg id" }, { status: 400 });
  }

  const subject = safeOption(searchParams.get("subject"), ALLOWED_SUBJECTS, "ape");
  const palette = safeOption(searchParams.get("palette"), ALLOWED_PALETTES, "claw");
  const vibe = safeOption(searchParams.get("vibe"), ALLOWED_VIBES, "balanced");

  // v0.3.0+: accessory + background come only from the peg seed inside the renderer; query params cannot pin them.
  const params: Record<string, string> = { subject, palette, vibe };

  const svg = renderClawPegSvg({
    rendererId: CLAWPEG_DEFAULT_RENDERER_ID,
    rendererVersion: CLAWPEG_DEFAULT_RENDERER_VERSION,
    collectionSeed: `preview:${subject}:${palette}:${vibe}`,
    tokenMint: "preview",
    pegId,
    params,
  });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
