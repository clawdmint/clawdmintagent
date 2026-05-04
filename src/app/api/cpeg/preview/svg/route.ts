import { NextRequest, NextResponse } from "next/server";
import { CLAWPEG_DEFAULT_RENDERER_ID, CLAWPEG_DEFAULT_RENDERER_VERSION } from "@/lib/clawpeg";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";
import {
  CLAWPEG_RENDERER_V3_ACCESSORIES,
  CLAWPEG_RENDERER_V3_PALETTES,
  CLAWPEG_RENDERER_V3_SUBJECTS,
} from "@/lib/clawpeg-renderer-v3";

export const dynamic = "force-dynamic";

const ALLOWED_SUBJECTS = new Set<string>(CLAWPEG_RENDERER_V3_SUBJECTS);
const ALLOWED_PALETTES = new Set<string>(CLAWPEG_RENDERER_V3_PALETTES);
const ALLOWED_ACCESSORIES = new Set<string>([
  ...CLAWPEG_RENDERER_V3_ACCESSORIES,
  "auto",
]);
const ALLOWED_BACKGROUNDS = new Set([
  "auto",
  "solid",
  "stars",
  "grid",
  "vignette",
  "dust",
  "horizon",
]);
const ALLOWED_VIBES = new Set(["balanced", "loud", "holy", "dark"]);

function safeOption(value: string | null, allowed: Set<string>, fallback: string) {
  const normalized = String(value || fallback).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const pegId = Number(searchParams.get("pegId") || "1");
  if (!Number.isInteger(pegId) || pegId < 1 || pegId > 1_000_000) {
    return NextResponse.json({ success: false, error: "Invalid peg id" }, { status: 400 });
  }

  const subject = safeOption(searchParams.get("subject"), ALLOWED_SUBJECTS, "ape");
  const palette = safeOption(searchParams.get("palette"), ALLOWED_PALETTES, "claw");
  const accessoryParam = safeOption(searchParams.get("accessory"), ALLOWED_ACCESSORIES, "auto");
  const backgroundParam = safeOption(searchParams.get("background"), ALLOWED_BACKGROUNDS, "auto");
  const vibe = safeOption(searchParams.get("vibe"), ALLOWED_VIBES, "balanced");

  // "auto" means let the deterministic seed decide; we omit the key so the renderer
  // falls back to the per-peg pseudo-random pick. This keeps preview thumbnails varied
  // by peg id while honoring an explicit override when the user pins one.
  const params: Record<string, string> = { subject, palette, vibe };
  if (accessoryParam !== "auto") params.accessory = accessoryParam;
  if (backgroundParam !== "auto") params.background = backgroundParam;

  const svg = renderClawPegSvg({
    rendererId: CLAWPEG_DEFAULT_RENDERER_ID,
    rendererVersion: CLAWPEG_DEFAULT_RENDERER_VERSION,
    collectionSeed: `preview:${subject}:${palette}:${accessoryParam}:${backgroundParam}:${vibe}`,
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
