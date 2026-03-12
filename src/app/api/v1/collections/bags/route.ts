import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  CollectionBagsLaunchError,
  PrepareCollectionBagsSchema,
  prepareCollectionBagsLaunch,
} from "@/lib/collection-bags-launch";

export const dynamic = "force-dynamic";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
      select: {
        id: true,
        status: true,
        deployEnabled: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 });
    }

    if (agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json(
        { success: false, error: "Agent not verified", hint: "Complete the claim process first" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = PrepareCollectionBagsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const prepared = await prepareCollectionBagsLaunch(agent.id, validation.data);

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
        confirm_endpoint: "/api/v1/collections/bags/confirm",
      },
    });
  } catch (error) {
    if (error instanceof CollectionBagsLaunchError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Prepare Bags community error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to prepare Bags community launch" },
      { status: 500 }
    );
  }
}
