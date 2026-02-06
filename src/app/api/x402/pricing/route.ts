import { NextResponse } from "next/server";
import { getX402PricingInfo, isX402Enabled } from "@/lib/x402";

// Force dynamic rendering
export const dynamic = "force-dynamic";

/**
 * GET /api/x402/pricing
 * 
 * Public endpoint that returns x402 pricing information
 * for all payment-gated API endpoints.
 * 
 * This is the discovery endpoint - AI agents and x402 clients
 * can use this to understand available services and their costs.
 */
export async function GET() {
  if (!isX402Enabled()) {
    return NextResponse.json(
      {
        enabled: false,
        message: "x402 payments are not configured on this instance",
      },
      { status: 200 }
    );
  }

  const pricing = getX402PricingInfo();

  return NextResponse.json(
    {
      enabled: true,
      ...pricing,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300", // Cache 5 min
      },
    }
  );
}
