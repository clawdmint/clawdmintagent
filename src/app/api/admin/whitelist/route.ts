import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/admin/whitelist — Get all WL entries (admin only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    // Simple API key protection
    if (key !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const format = searchParams.get("format") || "json";

    const entries = await prisma.whitelistEntry.findMany({
      orderBy: { createdAt: "asc" },
    });

    if (format === "csv") {
      const csv = [
        "position,wallet,twitter,tasks,submitted_at",
        ...entries.map((e, i) =>
          `${i + 1},${e.walletAddress},${e.twitterHandle || ""},${e.completedTasks},${e.createdAt.toISOString()}`
        ),
      ].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=whitelist.csv",
        },
      });
    }

    return NextResponse.json({
      success: true,
      total: entries.length,
      entries: entries.map((e, i) => ({
        position: i + 1,
        wallet: e.walletAddress,
        twitter: e.twitterHandle,
        tasks: JSON.parse(e.completedTasks),
        submitted_at: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Admin whitelist error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
