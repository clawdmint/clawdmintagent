import { NextResponse } from "next/server";
import { listClawPegRenderers } from "@/lib/clawpeg-renderer-registry";

export const dynamic = "force-static";

export async function GET() {
  const renderers = listClawPegRenderers().map((manifest) => ({
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    fields: manifest.fields,
    default_params: manifest.defaultParams,
    is_built_in: manifest.isBuiltIn,
  }));
  return NextResponse.json({ success: true, renderers });
}
