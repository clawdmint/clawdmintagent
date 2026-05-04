import { NextResponse } from "next/server";
import { getClawPegRenderer } from "@/lib/clawpeg-renderer-registry";

export const dynamic = "force-static";

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  const url = new URL(request.url);
  const version = url.searchParams.get("version") || undefined;
  const manifest = getClawPegRenderer(params.id, version);
  if (!manifest) {
    return NextResponse.json({ success: false, error: "renderer not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    renderer: {
      id: manifest.id,
      version: manifest.version,
      name: manifest.name,
      description: manifest.description,
      fields: manifest.fields,
      default_params: manifest.defaultParams,
      is_built_in: manifest.isBuiltIn,
    },
  });
}
