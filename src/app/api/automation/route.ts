import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// Automation API — DCA, Limit Orders, Stop Loss, TWAP via Bankr Agent
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

  return { success: false, jobId, status: "failed", error: "Timeout — automation job took too long" };
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
      // ─── DCA (Dollar Cost Averaging) ───
      case "create-dca": {
        const { token, amount, currency, frequency, duration, startTime } = body;
        if (!token || !amount || !frequency) {
          return NextResponse.json({ success: false, error: "token, amount, and frequency are required for DCA" }, { status: 400 });
        }
        const cur = currency || "USDC";
        const freqMap: Record<string, string> = {
          "15m": "every 15 minutes",
          "1h": "every hour",
          "4h": "every 4 hours",
          "daily": "every day",
          "weekly": "every week",
          "monthly": "every month",
        };
        const freqText = freqMap[frequency] || frequency;
        const durationText = duration ? ` for ${duration}` : "";
        const startText = startTime ? ` starting at ${startTime}` : "";
        prompt = `Set up a DCA strategy: Buy ${amount} ${cur} worth of ${token} ${freqText}${durationText}${startText} on Base`;
        break;
      }

      // ─── Limit Order ───
      case "create-limit-order": {
        const { token, side, amount, price, currency } = body;
        if (!token || !side || !amount || !price) {
          return NextResponse.json({ success: false, error: "token, side (buy/sell), amount, and price are required" }, { status: 400 });
        }
        const cur = currency || "USDC";
        if (side === "buy") {
          prompt = `Create a limit buy order: Buy ${amount} ${cur} worth of ${token} when price drops to $${price} on Base`;
        } else {
          prompt = `Create a limit sell order: Sell ${amount} ${token} when price reaches $${price} on Base`;
        }
        break;
      }

      // ─── Stop Loss ───
      case "create-stop-loss": {
        const { token, amount, stopPrice, sellPercentage } = body;
        if (!token || !stopPrice) {
          return NextResponse.json({ success: false, error: "token and stopPrice are required for stop loss" }, { status: 400 });
        }
        const pctText = sellPercentage ? `${sellPercentage}% of my` : "all my";
        const amtText = amount ? `${amount}` : pctText;
        prompt = `Set a stop loss: Sell ${amtText} ${token} if price drops below $${stopPrice} on Base`;
        break;
      }

      // ─── Take Profit ───
      case "create-take-profit": {
        const { token, amount, targetPrice, sellPercentage } = body;
        if (!token || !targetPrice) {
          return NextResponse.json({ success: false, error: "token and targetPrice are required for take profit" }, { status: 400 });
        }
        const pctText = sellPercentage ? `${sellPercentage}% of my` : "all my";
        const amtText = amount ? `${amount}` : pctText;
        prompt = `Set a take profit: Sell ${amtText} ${token} when price reaches $${targetPrice} on Base`;
        break;
      }

      // ─── TWAP (Time Weighted Average Price) ───
      case "create-twap": {
        const { token, totalAmount, currency, duration, intervals } = body;
        if (!token || !totalAmount || !duration) {
          return NextResponse.json({ success: false, error: "token, totalAmount, and duration are required for TWAP" }, { status: 400 });
        }
        const cur = currency || "USDC";
        const intervalText = intervals ? ` split into ${intervals} equal parts` : "";
        prompt = `Execute a TWAP order: Buy ${totalAmount} ${cur} worth of ${token} spread over ${duration}${intervalText} on Base`;
        break;
      }

      // ─── List active automations ───
      case "list-automations": {
        prompt = "List all my active automations, DCA strategies, limit orders, and stop losses on Base. Show status, amounts, and remaining executions.";
        break;
      }

      // ─── Cancel automation ───
      case "cancel-automation": {
        const { automationId, description } = body;
        if (!automationId && !description) {
          return NextResponse.json({ success: false, error: "automationId or description required to cancel" }, { status: 400 });
        }
        prompt = automationId
          ? `Cancel automation #${automationId}`
          : `Cancel the automation: ${description}`;
        break;
      }

      // ─── Check token price (for limit order UX) ───
      case "check-price": {
        const { token } = body;
        if (!token) {
          return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
        }
        prompt = `What is the current price of ${token}? Include 24h high, 24h low, and current market cap.`;
        break;
      }

      // ─── Get portfolio for automation context ───
      case "portfolio-summary": {
        prompt = "Show my complete token portfolio on Base with current values and 24h change for each token.";
        break;
      }

      default:
        return NextResponse.json({
          success: false,
          error: "Unknown action. Supported: create-dca, create-limit-order, create-stop-loss, create-take-profit, create-twap, list-automations, cancel-automation, check-price, portfolio-summary",
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
        error: result.error || "Automation job did not complete successfully",
        status: result.status,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Automation API error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
