import { NextRequest, NextResponse } from "next/server";
import { verifyHmacAuth } from "@/lib/auth";
import {
  CollectionBagsLaunchError,
  PrepareCollectionBagsSchema,
  prepareCollectionBagsLaunch,
} from "@/lib/collection-bags-launch";

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

    const validation = PrepareCollectionBagsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const prepared = await prepareCollectionBagsLaunch(auth.agentId!, validation.data);

    return NextResponse.json({
      success: true,
      collection: {
        id: prepared.collection.id,
        chain: prepared.collection.chain,
        address: prepared.collection.address,
        bags: prepared.bags,
      },
      bags_launch: {
        token_info: prepared.token_info,
        fee_config: prepared.fee_config,
        launch: prepared.launch,
        confirm_endpoint: "/api/agent/collections/bags/confirm",
      },
    });
  } catch (error) {
    if (error instanceof CollectionBagsLaunchError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    console.error("Agent Bags community prepare error:", error);
    return NextResponse.json({ error: "Failed to prepare Bags community launch" }, { status: 500 });
  }
}
