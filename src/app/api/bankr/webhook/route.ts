import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// POST /api/bankr/webhook
// Receive callbacks from Bankr when operations complete
// ═══════════════════════════════════════════════════════════════════════

interface BankrWebhookPayload {
  event: string;
  jobId: string;
  status: "completed" | "failed";
  data?: {
    prompt?: string;
    response?: string;
    transactions?: Array<{
      type: string;
      hash?: string;
      metadata?: Record<string, unknown>;
    }>;
    error?: string;
  };
  timestamp: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const signature = request.headers.get("x-bankr-signature");
    const webhookSecret = process.env["BANKR_WEBHOOK_SECRET"];

    const body = await request.text();

    if (webhookSecret && signature) {
      const expectedSig = createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");

      const isValid = signature.length === expectedSig.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));

      if (!isValid) {
        console.warn("[Bankr Webhook] Invalid signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    const payload: BankrWebhookPayload = JSON.parse(body);
    
    console.log(`[Bankr Webhook] Event: ${payload.event}, Job: ${payload.jobId}, Status: ${payload.status}`);

    // Process different event types
    switch (payload.event) {
      case "job.completed":
        await handleJobCompleted(payload);
        break;
      case "job.failed":
        await handleJobFailed(payload);
        break;
      case "nft.minted":
        await handleNftMinted(payload);
        break;
      default:
        console.log(`[Bankr Webhook] Unknown event: ${payload.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Bankr Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleJobCompleted(payload: BankrWebhookPayload) {
  const { data } = payload;
  if (!data) return;

  // Log successful operation
  console.log(`[Bankr] Job ${payload.jobId} completed:`, data.response?.substring(0, 200));

  // If there are transactions, log them
  if (data.transactions?.length) {
    for (const tx of data.transactions) {
      console.log(`[Bankr] Transaction: type=${tx.type}, hash=${tx.hash}`);
    }
  }
}

async function handleJobFailed(payload: BankrWebhookPayload) {
  console.error(`[Bankr] Job ${payload.jobId} failed:`, payload.data?.error);
}

async function handleNftMinted(payload: BankrWebhookPayload) {
  const { data } = payload;
  if (!data) return;

  console.log(`[Bankr] NFT minted via Bankr:`, data);
}
