import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// Trade API — Executes swaps via Bankr Agent API
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

async function pollJob(apiKey: string, jobId: string, maxAttempts = 90): Promise<BankrJobResult> {
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

  return { success: false, jobId, status: "failed", error: "Timeout — trade job took too long" };
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
      case "quote": {
        // Get price quote before executing
        const { fromToken, toToken, amount, chain } = body;
        if (!fromToken || !toToken || !amount) {
          return NextResponse.json({ success: false, error: "fromToken, toToken, and amount are required" }, { status: 400 });
        }
        const chainName = chain || "Base";
        prompt = `What is the current price to swap ${amount} ${fromToken} to ${toToken} on ${chainName}? Show estimated output amount, price impact, and any fees.`;
        break;
      }

      case "swap": {
        // Execute actual swap
        const { fromToken, toToken, amount, chain, slippage } = body;
        if (!fromToken || !toToken || !amount) {
          return NextResponse.json({ success: false, error: "fromToken, toToken, and amount are required" }, { status: 400 });
        }
        const chainName = chain || "Base";
        const slippageNote = slippage ? ` with max ${slippage}% slippage` : "";
        prompt = `Swap ${amount} ${fromToken} to ${toToken} on ${chainName}${slippageNote}`;
        break;
      }

      case "price": {
        // Get single token price
        const { token } = body;
        if (!token) {
          return NextResponse.json({ success: false, error: "Token is required for price action" }, { status: 400 });
        }
        prompt = `What is the current price of ${token}? Include 24h change and market cap.`;
        break;
      }

      case "balance": {
        // Check token balance
        const { token, chain } = body;
        const chainName = chain || "Base";
        prompt = token
          ? `What is my ${token} balance on ${chainName}?`
          : `Show all my token balances on ${chainName}`;
        break;
      }

      case "history": {
        prompt = "Show my recent swap/trade history on Base";
        break;
      }

      default:
        return NextResponse.json({
          success: false,
          error: "Unknown action. Supported: quote, swap, price, balance, history",
        }, { status: 400 });
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
        action,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || "Trade job did not complete successfully",
        status: result.status,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Trade API error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
