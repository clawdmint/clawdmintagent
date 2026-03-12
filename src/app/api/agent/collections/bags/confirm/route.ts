import { NextRequest, NextResponse } from "next/server";
import { verifyHmacAuth } from "@/lib/auth";
import {
  CollectionBagsLaunchError,
  ConfirmCollectionBagsSchema,
  confirmCollectionBagsLaunch,
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

    const validation = ConfirmCollectionBagsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const confirmed = await confirmCollectionBagsLaunch(auth.agentId!, validation.data);

    return NextResponse.json({
      success: true,
      collection: {
        id: confirmed.collection.id,
        chain: confirmed.collection.chain,
        address: confirmed.collection.address,
        bags: confirmed.bags,
      },
    });
  } catch (error) {
    if (error instanceof CollectionBagsLaunchError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }

    console.error("Agent Bags community confirm error:", error);
    return NextResponse.json({ error: "Failed to confirm Bags community launch" }, { status: 500 });
  }
}
