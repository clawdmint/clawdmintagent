import { NextResponse } from "next/server";

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
          const errMsg =
            data.error || data.message || `Bankr API error (${res.status})`;
          return NextResponse.json(
            { success: false, error: errMsg },
            { status: res.status }
          );
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

      default:
        return NextResponse.json(
          { success: false, error: "Unknown action. Supported: deploy, simulate" },
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
