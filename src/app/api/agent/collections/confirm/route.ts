import { NextRequest, NextResponse } from "next/server";
import { verifyHmacAuth } from "@/lib/auth";
import {
  CollectionConfirmError,
  ConfirmCollectionSchema,
  confirmCollectionDeployment,
} from "@/lib/collection-confirm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const auth = await verifyHmacAuth(request, bodyText);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error || "Authentication failed" }, { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validation = ConfirmCollectionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const updated = await confirmCollectionDeployment(auth.agentId!, validation.data);

    return NextResponse.json({
      success: true,
      collection: {
        id: updated.id,
        address: updated.address,
        chain: updated.chain,
        status: updated.status,
        deployed_at: updated.deployedAt?.toISOString() || null,
        deploy_tx_hash: updated.deployTxHash,
      },
    });
  } catch (error) {
    if (error instanceof CollectionConfirmError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error("Collection confirm error:", error);
    return NextResponse.json({ error: "Failed to confirm deployment" }, { status: 500 });
  }
}
