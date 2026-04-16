import { NextRequest, NextResponse } from "next/server";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: X402_PRICING.DEPLOY_AGENT_TOKEN,
      description: "Launch a Solana-native Metaplex Genesis token via Clawdmint after funding and verification",
    },
    async () => {
      try {
        const body = await request.json();

        if (!body?.agent_api_key || typeof body.agent_api_key !== "string") {
          return NextResponse.json(
            {
              success: false,
              error: "agent_api_key is required",
              hint: "First create an agent via /api/x402/register or /api/v1/agents/register, fund and verify it, then retry with agent_api_key",
            },
            { status: 400 }
          );
        }

        const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
        const upstream = await fetch(`${appUrl}/api/v1/agent-tokens`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${body.agent_api_key}`,
          },
          body: JSON.stringify({
            ...body,
            agent_api_key: undefined,
          }),
        });

        const payload = await upstream.json();
        if (!upstream.ok) {
          return NextResponse.json(
            {
              success: false,
              payment_method: "x402",
              upstream: "api/v1/agent-tokens",
              ...payload,
            },
            { status: upstream.status }
          );
        }

        return NextResponse.json({
          ...payload,
          payment_method: "x402",
          message: "Agent token launch started via x402 payment and Clawdmint Metaplex Genesis flow.",
        });
      } catch (error) {
        console.error("[x402/agent-token] Launch error:", error);
        return NextResponse.json(
          { success: false, error: "Agent token launch failed" },
          { status: 500 }
        );
      }
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, Authorization",
      "Access-Control-Expose-Headers":
        "X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE",
    },
  });
}
