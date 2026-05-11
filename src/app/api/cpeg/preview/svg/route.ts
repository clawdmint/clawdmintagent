import { NextRequest, NextResponse } from "next/server";
import { CLAWPEG_DEFAULT_RENDERER_ID, CLAWPEG_DEFAULT_RENDERER_VERSION } from "@/lib/clawpeg";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";
import { CLAWPEG_RENDERER_V3_SUBJECTS } from "@/lib/clawpeg-renderer-v3";

export const dynamic = "force-dynamic";

const ALLOWED_SUBJECTS = new Set<string>(CLAWPEG_RENDERER_V3_SUBJECTS);

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

  // v0.3.0+: palette, mood, accessory, and background are peg-seeded only; query cannot pin them.
  const params: Record<string, string> = { subject };

  const svg = renderClawPegSvg({
    rendererId: CLAWPEG_DEFAULT_RENDERER_ID,
    rendererVersion: CLAWPEG_DEFAULT_RENDERER_VERSION,
    collectionSeed: `preview:${subject}`,
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
