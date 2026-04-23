import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function normalizeWalletAddress(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = normalizeWalletAddress(request.nextUrl.searchParams.get("walletAddress"));

    const [agent, followersCount, existingFollow] = await Promise.all([
      prisma.agent.findUnique({
        where: { id },
        select: { id: true, status: true },
      }),
      prisma.agentFollow.count({ where: { agentId: id } }),
      walletAddress
        ? prisma.agentFollow.findUnique({
            where: {
              agentId_walletAddress: {
                agentId: id,
                walletAddress,
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!agent || agent.status !== "VERIFIED") {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      followers_count: followersCount,
      is_following: Boolean(existingFollow),
    });
  } catch (error) {
    console.error("Agent follow GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch follow state" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const walletAddress = normalizeWalletAddress(body.walletAddress);

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: "Wallet address is required" }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!agent || agent.status !== "VERIFIED") {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    await prisma.agentFollow.upsert({
      where: {
        agentId_walletAddress: {
          agentId: id,
          walletAddress,
        },
      },
      create: {
        agentId: id,
        walletAddress,
      },
      update: {},
    });

    const followersCount = await prisma.agentFollow.count({ where: { agentId: id } });

    return NextResponse.json({
      success: true,
      followers_count: followersCount,
      is_following: true,
    });
  } catch (error) {
    console.error("Agent follow POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to follow agent" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const walletAddress = normalizeWalletAddress(body.walletAddress);

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: "Wallet address is required" }, { status: 400 });
    }

    await prisma.agentFollow.deleteMany({
      where: {
        agentId: id,
        walletAddress,
      },
    });

    const followersCount = await prisma.agentFollow.count({ where: { agentId: id } });

    return NextResponse.json({
      success: true,
      followers_count: followersCount,
      is_following: false,
    });
  } catch (error) {
    console.error("Agent follow DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to unfollow agent" }, { status: 500 });
  }
}
