import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  ensureMetaplexAgentRegistrationStep,
  getAgentMetaplexSummary,
  MetaplexAgentRegistryError,
} from "@/lib/metaplex-agent-registry";

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
        { success: false, error: "Agent must be verified before Metaplex registration" },
        { status: 403 }
      );
    }

    const before = await getAgentMetaplexSummary(agent.id);
    const metaplex = await ensureMetaplexAgentRegistrationStep(agent.id);

    const active = metaplex.sync_status === "ACTIVE";

    return NextResponse.json(
      {
        success: true,
        status: metaplex.sync_status,
        created: !before?.registered && metaplex.registered,
        delegated: metaplex.delegated,
        metaplex,
        retry_after_seconds: metaplex.retry_after_seconds,
        next_action: metaplex.next_action,
        message: active
          ? metaplex.delegated
            ? "Metaplex agent identity and delegation are active."
            : "Metaplex agent identity is active."
          : "Metaplex agent identity sync is still progressing. Retry this endpoint with the same bearer token.",
      },
      { status: active ? 200 : 202 }
    );
  } catch (error) {
    if (error instanceof MetaplexAgentRegistryError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Metaplex sync error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync Metaplex agent registration" },
      { status: 500 }
    );
  }
}
