/**
 * x402 Payment Protocol Integration for Clawdmint
 * 
 * Enables HTTP 402 "Payment Required" based micropayments
 * on the Base network using USDC stablecoins.
 * 
 * AI agents and services can pay per-request to access
 * premium API endpoints without traditional API keys.
 * 
 * @see https://docs.cdp.coinbase.com/x402/welcome
 */

import { NextRequest, NextResponse } from "next/server";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { Network, PaymentRequired } from "@x402/core/types";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Wallet address to receive x402 payments */
function getPayToAddress(): string {
  return process.env["X402_PAY_TO_ADDRESS"] || process.env["TREASURY_ADDRESS"] || "";
}

/** Network identifier in CAIP-2 format */
function getNetwork(): Network {
  const chainId = process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453";
  return chainId === "8453" ? "eip155:8453" : "eip155:84532";
}

/** Facilitator URL (handles payment verification and settlement) */
function getFacilitatorUrl(): string {
  const custom = process.env["X402_FACILITATOR_URL"];
  if (custom) return custom;

  // Use x402.org for testnet, CDP for mainnet
  const network = getNetwork();
  if (network === "eip155:8453") {
    // Mainnet - check for CDP keys
    const cdpKeyId = process.env["CDP_API_KEY_ID"];
    if (cdpKeyId) {
      return "https://api.cdp.coinbase.com/platform/v2/x402";
    }
    // Fallback to x402.org (works for both)
    return "https://x402.org/facilitator";
  }
  return "https://www.x402.org/facilitator";
}

/** Check if x402 is configured and enabled */
export function isX402Enabled(): boolean {
  return !!getPayToAddress();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING TIERS
// ═══════════════════════════════════════════════════════════════════════════════

export const X402_PRICING = {
  /** Deploy a new NFT collection */
  DEPLOY_COLLECTION: "$2.00",
  /** Read collection data (per request) */
  API_COLLECTIONS_READ: "$0.001",
  /** Premium analytics/stats */
  API_STATS_PREMIUM: "$0.005",
  /** Agent profile data */
  API_AGENTS_READ: "$0.001",
} as const;

export type X402PricingTier = keyof typeof X402_PRICING;

// ═══════════════════════════════════════════════════════════════════════════════
// x402 RESOURCE SERVER (singleton)
// ═══════════════════════════════════════════════════════════════════════════════

let _server: x402ResourceServer | null = null;
let _serverInitPromise: Promise<x402ResourceServer> | null = null;

/**
 * Get or initialize the x402 Resource Server
 * Thread-safe singleton with lazy initialization
 */
async function getX402Server(): Promise<x402ResourceServer> {
  if (_server) return _server;

  if (!_serverInitPromise) {
    _serverInitPromise = (async () => {
      const facilitatorUrl = getFacilitatorUrl();
      const network = getNetwork();

      console.log(`[x402] Initializing: network=${network}, facilitator=${facilitatorUrl}`);

      const facilitatorConfig: { url: string; createAuthHeaders?: () => Promise<{ verify: Record<string, string>; settle: Record<string, string>; supported: Record<string, string> }> } = {
        url: facilitatorUrl,
      };

      // Add CDP auth headers if configured
      const cdpKeyId = process.env["CDP_API_KEY_ID"];
      const cdpKeySecret = process.env["CDP_API_KEY_SECRET"];
      if (cdpKeyId && cdpKeySecret) {
        facilitatorConfig.createAuthHeaders = async () => {
          const headers = {
            "X-CDP-API-KEY-ID": cdpKeyId,
            "X-CDP-API-KEY-SECRET": cdpKeySecret,
          };
          return { verify: headers, settle: headers, supported: headers };
        };
      }

      const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);
      const server = new x402ResourceServer(facilitatorClient);
      server.register(network, new ExactEvmScheme());

      try {
        await server.initialize();
        console.log("[x402] Server initialized successfully");
      } catch (err) {
        console.warn("[x402] Server init warning (will retry on request):", err);
      }

      _server = server;
      return server;
    })();
  }

  return _serverInitPromise;
}

// ═══════════════════════════════════════════════════════════════════════════════
// x402 PAYMENT WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface X402Options {
  /** Price in USD (e.g., "$0.01") */
  price: string;
  /** Human-readable description of the resource */
  description: string;
  /** MIME type of the response */
  mimeType?: string;
}

/**
 * Wrap a Next.js API route handler with x402 payment protection.
 * 
 * If no payment header is present, returns HTTP 402 with payment requirements.
 * If a valid payment is provided, verifies and settles it before executing the handler.
 * 
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   return withX402Payment(request, {
 *     price: "$0.001",
 *     description: "List all NFT collections",
 *   }, async () => {
 *     // Your actual handler logic
 *     return NextResponse.json({ data: "premium content" });
 *   });
 * }
 * ```
 */
export async function withX402Payment(
  request: NextRequest,
  options: X402Options,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // If x402 is not configured, pass through
  if (!isX402Enabled()) {
    return handler();
  }

  const payTo = getPayToAddress();
  const network = getNetwork();
  const server = await getX402Server();

  // Check for payment header (x402 standard headers)
  const paymentHeader =
    request.headers.get("x-payment") ||
    request.headers.get("payment-signature") ||
    request.headers.get("X-PAYMENT") ||
    request.headers.get("PAYMENT-SIGNATURE");

  const resourceInfo = {
    url: request.url,
    description: options.description,
    mimeType: options.mimeType || "application/json",
  };

  const resourceConfig = {
    scheme: "exact",
    payTo,
    price: options.price,
    network,
  };

  if (!paymentHeader) {
    // ── No payment provided → return 402 with requirements ──────────────
    try {
      const requirements = await server.buildPaymentRequirements(resourceConfig);

      const paymentRequired: PaymentRequired = await server.createPaymentRequiredResponse(
        requirements,
        resourceInfo,
      );

      const encodedHeader = encodePaymentRequiredHeader(paymentRequired);

      return new NextResponse(JSON.stringify(paymentRequired), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT-REQUIRED": encodedHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      console.error("[x402] Failed to build payment requirements:", err);
      // Fallback: let request through if x402 infra is down
      return handler();
    }
  }

  // ── Payment provided → verify & settle ────────────────────────────────
  try {
    const paymentPayload = decodePaymentSignatureHeader(paymentHeader);

    const requirements = await server.buildPaymentRequirements(resourceConfig);

    const matchedReqs = server.findMatchingRequirements(requirements, paymentPayload);
    if (!matchedReqs) {
      return NextResponse.json(
        {
          error: "Payment requirements mismatch",
          message: "The provided payment does not match any accepted payment requirements",
        },
        { status: 400 }
      );
    }

    // Verify payment
    const verifyResult = await server.verifyPayment(paymentPayload, matchedReqs);
    if (!verifyResult.isValid) {
      return NextResponse.json(
        {
          error: "Payment verification failed",
          reason: verifyResult.invalidReason,
          message: verifyResult.invalidMessage,
        },
        { status: 402 }
      );
    }

    // Settle payment on-chain
    const settleResult = await server.settlePayment(paymentPayload, matchedReqs);
    if (!settleResult.success) {
      return NextResponse.json(
        {
          error: "Payment settlement failed",
          reason: settleResult.errorReason,
          message: settleResult.errorMessage,
        },
        { status: 402 }
      );
    }

    console.log(`[x402] Payment settled: ${settleResult.transaction} from ${settleResult.payer}`);

    // Payment successful → execute the actual handler
    const response = await handler();

    // Attach settlement proof header
    response.headers.set(
      "X-PAYMENT-RESPONSE",
      encodePaymentResponseHeader(settleResult)
    );
    response.headers.set(
      "Access-Control-Expose-Headers",
      "X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE"
    );

    return response;
  } catch (err) {
    console.error("[x402] Payment processing error:", err);
    return NextResponse.json(
      {
        error: "Payment processing failed",
        message: err instanceof Error ? err.message : "Unknown payment error",
      },
      { status: 402 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING INFO (for discovery / Bazaar)
// ═══════════════════════════════════════════════════════════════════════════════

export function getX402PricingInfo() {
  const network = getNetwork();
  const payTo = getPayToAddress();
  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";

  return {
    protocol: "x402",
    version: 2,
    network,
    facilitator: getFacilitatorUrl(),
    payTo,
    currency: "USDC",
    endpoints: [
      {
        method: "POST",
        path: "/api/x402/deploy",
        url: `${baseUrl}/api/x402/deploy`,
        price: X402_PRICING.DEPLOY_COLLECTION,
        description: "Deploy a new NFT collection on Base (no API key required)",
        mimeType: "application/json",
      },
      {
        method: "GET",
        path: "/api/x402/collections",
        url: `${baseUrl}/api/x402/collections`,
        price: X402_PRICING.API_COLLECTIONS_READ,
        description: "List all NFT collections with agent info",
        mimeType: "application/json",
      },
      {
        method: "GET",
        path: "/api/x402/stats",
        url: `${baseUrl}/api/x402/stats`,
        price: X402_PRICING.API_STATS_PREMIUM,
        description: "Premium platform analytics and statistics",
        mimeType: "application/json",
      },
      {
        method: "GET",
        path: "/api/x402/agents",
        url: `${baseUrl}/api/x402/agents`,
        price: X402_PRICING.API_AGENTS_READ,
        description: "List all verified AI agents with detailed profiles",
        mimeType: "application/json",
      },
    ],
  };
}
