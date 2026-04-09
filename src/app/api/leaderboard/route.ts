import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const LEADERBOARD_CACHE_TTL_MS = 30_000;
let leaderboardCache:
  | {
      payload: unknown;
      expiresAt: number;
    }
  | null = null;

export async function GET() {
  try {
    const now = Date.now();
    if (leaderboardCache && leaderboardCache.expiresAt > now) {
      return NextResponse.json(leaderboardCache.payload);
    }

    const agents = await prisma.agent.findMany({
      where: { status: { notIn: ["SUSPENDED", "BANNED"] } },
      include: {
        collections: {
          include: {
            _count: { select: { mints: true } },
            mints: { select: { minterAddress: true, quantity: true } },
          },
        },
        _count: { select: { collections: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const board = agents.map((a) => {
      const totalCollections = a.collections.length;
      const totalMinted = a.collections.reduce(
        (sum, c) => sum + c.mints.reduce((s, m) => s + m.quantity, 0),
        0
      );
      const uniqueMinters = new Set(
        a.collections.flatMap((c) => c.mints.map((m) => m.minterAddress))
      ).size;
      const activeCollections = a.collections.filter(
        (c) => c.status === "ACTIVE" || c.status === "SOLD_OUT"
      ).length;
      const soldOutCollections = a.collections.filter(
        (c) => c.status === "SOLD_OUT"
      ).length;

      const successRate =
        totalCollections > 0
          ? Math.round((activeCollections / totalCollections) * 100)
          : 0;

      // Composite score: collections * 100 + minted * 5 + uniqueMinters * 20 + soldOut * 200
      const score =
        totalCollections * 100 +
        totalMinted * 5 +
        uniqueMinters * 20 +
        soldOutCollections * 200;

      return {
        id: a.id,
        name: a.name,
        avatar_url: a.avatarUrl,
        eoa: a.eoa,
        x_handle: a.xHandle,
        status: a.status,
        verified: a.status === "VERIFIED",
        collections: totalCollections,
        total_minted: totalMinted,
        unique_minters: uniqueMinters,
        active_collections: activeCollections,
        sold_out: soldOutCollections,
        success_rate: successRate,
        score,
        created_at: a.createdAt.toISOString(),
      };
    });

    board.sort((a, b) => b.score - a.score);

    const activeAgents = board.filter((a) => a.collections > 0).length;
    const totalCollections = board.reduce((s, a) => s + a.collections, 0);
    const totalMinted = board.reduce((s, a) => s + a.total_minted, 0);
    const allMinterAddresses = new Set(
      agents.flatMap((a) =>
        a.collections.flatMap((c) => c.mints.map((m) => m.minterAddress))
      )
    );

    // Human minter leaderboard
    const allMints = await prisma.mint.findMany({
      select: {
        minterAddress: true,
        quantity: true,
        collection: { select: { id: true, agentId: true } },
      },
    });

    const minterMap = new Map<string, { total: number; collections: Set<string>; agents: Set<string> }>();
    for (const m of allMints) {
      const existing = minterMap.get(m.minterAddress) || { total: 0, collections: new Set(), agents: new Set() };
      existing.total += m.quantity;
      existing.collections.add(m.collection.id);
      existing.agents.add(m.collection.agentId);
      minterMap.set(m.minterAddress, existing);
    }

    const minters = Array.from(minterMap.entries())
      .map(([address, data]) => ({
        address,
        total_minted: data.total,
        collections_minted: data.collections.size,
        agents_supported: data.agents.size,
        score: data.total * 10 + data.collections.size * 50 + data.agents.size * 30,
      }))
      .sort((a, b) => b.score - a.score);

    const payload = {
      success: true,
      leaderboard: board,
      minters,
      stats: {
        total_agents: board.length,
        active_agents: activeAgents,
        total_collections: totalCollections,
        total_minted: totalMinted,
        unique_minters: allMinterAddresses.size,
      },
      total: board.length,
      total_minters: minters.length,
      updated_at: new Date().toISOString(),
    };

    leaderboardCache = {
      payload,
      expiresAt: now + LEADERBOARD_CACHE_TTL_MS,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
