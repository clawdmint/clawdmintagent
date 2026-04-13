import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildA2ACard } from "@/lib/agent-protocols";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      avatarUrl: true,
      status: true,
      deployEnabled: true,
    },
  });

  if (!agent) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(buildA2ACard(agent), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

