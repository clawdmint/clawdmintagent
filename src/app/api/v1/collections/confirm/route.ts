import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  CollectionConfirmError,
  ConfirmCollectionSchema,
  confirmCollectionDeployment,
} from "@/lib/collection-confirm";

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
    const validation = ConfirmCollectionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const updated = await confirmCollectionDeployment(agent.id, validation.data);

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
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("V1 collection confirm error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to confirm deployment" },
      { status: 500 }
    );
  }
}
