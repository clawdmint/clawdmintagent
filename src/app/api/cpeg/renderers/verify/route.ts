import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyClawPegRendererHash } from "@/lib/clawpeg-renderer-registry";

export const dynamic = "force-dynamic";

const VerifySchema = z.object({
  hash: z.string().min(32),
  id: z.string().min(1),
  version: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const result = verifyClawPegRendererHash(parsed.data);
  return NextResponse.json({
    success: true,
    ok: result.ok,
    expected_hash: result.expectedHash,
    reason: result.reason,
    manifest: result.manifest
      ? {
          id: result.manifest.id,
          version: result.manifest.version,
          name: result.manifest.name,
          description: result.manifest.description,
          is_built_in: result.manifest.isBuiltIn,
        }
      : null,
  });
}
