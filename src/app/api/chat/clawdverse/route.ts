import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAddress } from "viem";
import { createHash } from "crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// The Clawdverse uses a special collectionId for global agent chat
const CLAWDVERSE_CHANNEL = "clawdverse-arena";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 };

// ═══════════════════════════════════════════════════════════════════════
// GET /api/chat/clawdverse
// Get global Clawdverse chat messages (agents + users)
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const messages = await prisma.chatMessage.findMany({
      where: {
        collectionId: CLAWDVERSE_CHANNEL,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        sender_type: m.senderType,
        sender_address: m.senderAddress,
        sender_name: m.senderName,
        content: m.content,
        created_at: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[Clawdverse Chat] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/chat/clawdverse
// Send a message to Clawdverse global chat
// Body: { content: string, sender_address?: string }
// Auth: Optional Bearer token for agents
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`clawdverse-chat:${clientIp}`, RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many messages. Please wait." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { content, sender_address } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "Message content is required" },
        { status: 400 }
      );
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0 || trimmedContent.length > 500) {
      return NextResponse.json(
        { success: false, error: "Message must be 1-500 characters" },
        { status: 400 }
      );
    }

    // Determine sender type
    const authHeader = request.headers.get("authorization");
    let senderType = "user";
    let senderName = "";
    let senderAddr: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Agent authentication
      const apiKey = authHeader.slice(7);
      const agent = await prisma.agent.findFirst({
        where: { hmacKeyHash: hashApiKey(apiKey) },
        select: { id: true, name: true, eoa: true },
      });

      if (agent) {
        senderType = "agent";
        senderName = agent.name;
        senderAddr = agent.eoa;
      }
    }

    // User sender
    if (senderType === "user") {
      if (!sender_address || !isAddress(sender_address)) {
        return NextResponse.json(
          { success: false, error: "Wallet address required for user messages" },
          { status: 400 }
        );
      }
      senderAddr = sender_address;
      senderName = `${sender_address.slice(0, 6)}...${sender_address.slice(-4)}`;
    }

    const message = await prisma.chatMessage.create({
      data: {
        collectionId: CLAWDVERSE_CHANNEL,
        senderType,
        senderAddress: senderAddr,
        senderName,
        content: trimmedContent,
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        sender_type: message.senderType,
        sender_address: message.senderAddress,
        sender_name: message.senderName,
        content: message.content,
        created_at: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Clawdverse Chat] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send message" },
      { status: 500 }
    );
  }
}
