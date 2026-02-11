import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// Portfolio API — Proxies requests to Bankr Agent API
// User provides their own API key; we never store it.
// ═══════════════════════════════════════════════════════════════════════

const BANKR_API = "https://api.bankr.bot";

interface BankrJobResult {
  success: boolean;
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  response?: string;
  error?: string;
  statusUpdates?: { message: string; timestamp: string }[];
}

async function submitPrompt(apiKey: string, prompt: string): Promise<{ jobId: string } | { error: string }> {
  const res = await fetch(`${BANKR_API}/agent/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errMsg = body.error || body.message || `API error ${res.status}`;

    // Provide helpful messages for common errors
    if (res.status === 403 || errMsg.toLowerCase().includes("agent api access not enabled")) {
      return { error: "Agent API access is not enabled on your key. Go to bankr.bot/api → select your key → enable 'Agent API' access." };
    }
    if (res.status === 401) {
      return { error: "Invalid or expired API key. Check your key at bankr.bot/api" };
    }

    return { error: errMsg };
  }

  const data = await res.json();
  return { jobId: data.jobId };
}

async function pollJob(apiKey: string, jobId: string, maxAttempts = 60): Promise<BankrJobResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(`${BANKR_API}/agent/job/${jobId}`, {
      headers: { "X-API-Key": apiKey },
    });

    if (!res.ok) continue;
    const data: BankrJobResult = await res.json();

    if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
      return data;
    }
  }

  return { success: false, jobId, status: "failed", error: "Timeout — job took too long" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, action } = body;

    if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("bk_")) {
      return NextResponse.json({ success: false, error: "Invalid Bankr API key. Keys start with bk_" }, { status: 400 });
    }

    let prompt: string;

    switch (action) {
      case "portfolio":
        prompt = "Show my complete portfolio with balances across all chains. Include USD values.";
        break;
      case "balances":
        prompt = "What are my token balances on all chains?";
        break;
      case "nfts":
        prompt = "Show my NFTs on Base and Ethereum";
        break;
      case "price":
        if (!body.token) return NextResponse.json({ success: false, error: "Token is required for price action" }, { status: 400 });
        prompt = `What is the current price and market data for ${body.token}?`;
        break;
      case "trending":
        prompt = "What tokens are trending on Base right now? Show top gainers.";
        break;
      case "analyze":
        if (!body.token) return NextResponse.json({ success: false, error: "Token is required for analyze action" }, { status: 400 });
        prompt = `Do a technical analysis on ${body.token}. Include RSI, MACD, support and resistance levels.`;
        break;
      case "custom":
        if (!body.prompt) return NextResponse.json({ success: false, error: "Prompt is required for custom action" }, { status: 400 });
        prompt = body.prompt;
        break;
      default:
        return NextResponse.json({ success: false, error: "Unknown action. Supported: portfolio, balances, nfts, price, trending, analyze, custom" }, { status: 400 });
    }

    // Submit prompt
    const submitResult = await submitPrompt(apiKey, prompt);
    if ("error" in submitResult) {
      return NextResponse.json({ success: false, error: submitResult.error }, { status: 400 });
    }

    // Poll for result
    const result = await pollJob(apiKey, submitResult.jobId);

    if (result.status === "completed") {
      return NextResponse.json({
        success: true,
        response: result.response,
        jobId: result.jobId,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || "Job did not complete successfully",
        status: result.status,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Portfolio API error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
