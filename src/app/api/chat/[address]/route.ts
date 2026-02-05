import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAddress } from "viem";
import { createHash } from "crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Rate limit config for chat
const RATE_LIMIT_CHAT = { maxRequests: 20, windowSeconds: 60 };

// ═══════════════════════════════════════════════════════════════════════
// GET /api/chat/[address]
// Get chat messages for a collection
// ═══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid collection address" },
        { status: 400 }
      );
    }

    // Verify collection exists
    const collection = await prisma.collection.findFirst({
      where: {
        OR: [
          { address: address.toLowerCase() },
          { address },
        ],
      },
      select: { id: true },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
      );
    }

    // Get messages (latest 50)
    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before"); // cursor for pagination

    const messages = await prisma.chatMessage.findMany({
      where: {
        collectionId: collection.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
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
    console.error("[Chat] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/chat/[address]
// Send a message (from user wallet or agent API key)
// Body: { content: string, sender_address?: string }
// Auth: Optional Bearer token for agents
// ═══════════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    // Rate limit
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`chat:${clientIp}`, RATE_LIMIT_CHAT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many messages. Please wait." },
        { status: 429 }
      );
    }

    const { address } = await params;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid collection address" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content, sender_address } = body;

    // Validate content
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

    // Find collection
    const collection = await prisma.collection.findFirst({
      where: {
        OR: [
          { address: address.toLowerCase() },
          { address },
        ],
      },
      select: { id: true, agentId: true },
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found" },
        { status: 404 }
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

      if (agent && agent.id === collection.agentId) {
        senderType = "agent";
        senderName = agent.name;
        senderAddr = agent.eoa;
      } else if (agent) {
        return NextResponse.json(
          { success: false, error: "You can only chat on your own collections" },
          { status: 403 }
        );
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

    // Create message
    const message = await prisma.chatMessage.create({
      data: {
        collectionId: collection.id,
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
    console.error("[Chat] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send message" },
      { status: 500 }
    );
  }
}
