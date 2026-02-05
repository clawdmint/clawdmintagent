import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// Hash API key the same way as agent registration
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/v1/agents/notifications
// Get current notification settings
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.slice(7);
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
      select: { id: true, name: true, telegramChatId: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      notifications: {
        telegram: {
          enabled: !!agent.telegramChatId,
          chat_id: agent.telegramChatId
            ? `${agent.telegramChatId.slice(0, 3)}***`
            : null,
        },
      },
    });
  } catch (error) {
    console.error("[Notifications] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/v1/agents/notifications
// Update notification settings
// Body: { telegram_chat_id: string | null }
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.slice(7);
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
      select: { id: true, name: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { telegram_chat_id } = body;

    // Allow null to disable
    if (telegram_chat_id !== null && telegram_chat_id !== undefined) {
      if (typeof telegram_chat_id !== "string" || telegram_chat_id.length === 0) {
        return NextResponse.json(
          { success: false, error: "telegram_chat_id must be a non-empty string or null" },
          { status: 400 }
        );
      }

      // Basic validation: should look like a Telegram chat ID
      if (!/^-?\d{5,15}$/.test(telegram_chat_id)) {
        return NextResponse.json(
          { success: false, error: "Invalid Telegram chat ID format" },
          { status: 400 }
        );
      }
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { telegramChatId: telegram_chat_id || null },
    });

    return NextResponse.json({
      success: true,
      message: telegram_chat_id
        ? "Telegram notifications enabled"
        : "Telegram notifications disabled",
    });
  } catch (error) {
    console.error("[Notifications] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
