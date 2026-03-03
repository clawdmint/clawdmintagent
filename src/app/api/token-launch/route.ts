import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BANKR_API = "https://api.bankr.bot";
const PARTNER_KEY = process.env.BANKR_PARTNER_KEY || "";

interface DeployRequest {
  tokenName: string;
  tokenSymbol?: string;
  description?: string;
  image?: string;
  tweetUrl?: string;
  websiteUrl?: string;
  feeRecipient: { type: string; value: string };
  simulateOnly?: boolean;
}

export async function POST(request: Request) {
  try {
    if (!PARTNER_KEY) {
      return NextResponse.json(
        { success: false, error: "Partner API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "deploy": {
        const {
          tokenName,
          tokenSymbol,
          description,
          image,
          tweetUrl,
          websiteUrl,
          feeRecipientType,
          feeRecipientValue,
          simulateOnly,
          launcherAddress,
        } = body;

        if (!tokenName || typeof tokenName !== "string" || tokenName.length < 1 || tokenName.length > 100) {
          return NextResponse.json(
            { success: false, error: "Token name is required (1-100 characters)" },
            { status: 400 }
          );
        }

        if (!feeRecipientValue) {
          return NextResponse.json(
            { success: false, error: "Fee recipient address is required" },
            { status: 400 }
          );
        }

        const payload: DeployRequest = {
          tokenName,
          feeRecipient: {
            type: feeRecipientType || "wallet",
            value: feeRecipientValue,
          },
        };

        if (tokenSymbol) payload.tokenSymbol = tokenSymbol.slice(0, 10);
        if (description) payload.description = description.slice(0, 500);
        if (image) payload.image = image;
        if (tweetUrl) payload.tweetUrl = tweetUrl;
        if (websiteUrl) payload.websiteUrl = websiteUrl;
        if (simulateOnly) payload.simulateOnly = true;

        const res = await fetch(`${BANKR_API}/token-launches/deploy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Partner-Key": PARTNER_KEY,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const errMsg = data.error || data.message || `Bankr API error (${res.status})`;
          return NextResponse.json({ success: false, error: errMsg }, { status: res.status });
        }

        // Save to DB (non-blocking — don't let DB errors break the response)
        if (data.tokenAddress && !simulateOnly) {
          try {
            await prisma.tokenLaunch.create({
              data: {
                tokenName: tokenName.trim(),
                tokenSymbol: (tokenSymbol?.trim() || tokenName.trim().slice(0, 4)).toUpperCase(),
                tokenAddress: data.tokenAddress,
                poolId: data.poolId || null,
                txHash: data.txHash || null,
                description: description?.trim() || null,
                imageUrl: image || null,
                websiteUrl: websiteUrl?.trim() || null,
                tweetUrl: tweetUrl?.trim() || null,
                chain: data.chain || "base",
                launcherAddress: (launcherAddress || feeRecipientValue).toLowerCase(),
                feeRecipient: feeRecipientValue.toLowerCase(),
                feeDistribution: data.feeDistribution ? JSON.stringify(data.feeDistribution) : null,
                simulated: false,
              },
            });
          } catch (dbErr) {
            console.error("Failed to save token launch to DB:", dbErr);
          }
        }

        return NextResponse.json({
          success: true,
          tokenAddress: data.tokenAddress,
          poolId: data.poolId,
          txHash: data.txHash,
          chain: data.chain || "base",
          feeDistribution: data.feeDistribution,
          simulated: data.simulated || false,
        });
      }

      case "simulate": {
        const { tokenName, tokenSymbol, feeRecipientValue } = body;

        if (!tokenName) {
          return NextResponse.json(
            { success: false, error: "Token name is required" },
            { status: 400 }
          );
        }

        const payload: DeployRequest = {
          tokenName,
          feeRecipient: {
            type: "wallet",
            value: feeRecipientValue || "0x0000000000000000000000000000000000000000",
          },
          simulateOnly: true,
        };

        if (tokenSymbol) payload.tokenSymbol = tokenSymbol;

        const res = await fetch(`${BANKR_API}/token-launches/deploy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Partner-Key": PARTNER_KEY,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          return NextResponse.json(
            { success: false, error: data.error || `Simulation failed (${res.status})` },
            { status: res.status }
          );
        }

        return NextResponse.json({
          success: true,
          tokenAddress: data.tokenAddress,
          simulated: true,
        });
      }

      case "history": {
        const { walletAddress } = body;
        if (!walletAddress) {
          return NextResponse.json(
            { success: false, error: "walletAddress is required" },
            { status: 400 }
          );
        }

        const launches = await prisma.tokenLaunch.findMany({
          where: { launcherAddress: walletAddress.toLowerCase() },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

        return NextResponse.json({
          success: true,
          launches: launches.map((l) => ({
            id: l.id,
            tokenName: l.tokenName,
            tokenSymbol: l.tokenSymbol,
            tokenAddress: l.tokenAddress,
            txHash: l.txHash,
            chain: l.chain,
            description: l.description,
            imageUrl: l.imageUrl,
            websiteUrl: l.websiteUrl,
            createdAt: l.createdAt.toISOString(),
            feeDistribution: l.feeDistribution ? JSON.parse(l.feeDistribution) : null,
          })),
        });
      }

      case "recent": {
        const limit = Math.min(parseInt(body.limit || "20"), 50);
        const launches = await prisma.tokenLaunch.findMany({
          where: { simulated: false },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

        return NextResponse.json({
          success: true,
          launches: launches.map((l) => ({
            id: l.id,
            tokenName: l.tokenName,
            tokenSymbol: l.tokenSymbol,
            tokenAddress: l.tokenAddress,
            txHash: l.txHash,
            chain: l.chain,
            imageUrl: l.imageUrl,
            launcherAddress: l.launcherAddress,
            createdAt: l.createdAt.toISOString(),
          })),
          total: launches.length,
        });
      }

      case "stats": {
        const [totalLaunches, recentLaunches, uniqueLaunchers] = await Promise.all([
          prisma.tokenLaunch.count({ where: { simulated: false } }),
          prisma.tokenLaunch.count({
            where: { simulated: false, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          }),
          prisma.tokenLaunch.groupBy({ by: ["launcherAddress"], where: { simulated: false } }),
        ]);

        return NextResponse.json({
          success: true,
          stats: {
            totalLaunches,
            recentLaunches24h: recentLaunches,
            uniqueLaunchers: uniqueLaunchers.length,
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: "Unknown action. Supported: deploy, simulate, history, recent, stats" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Token launch API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
