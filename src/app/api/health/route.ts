import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// SECURITY HELPERS
// ═══════════════════════════════════════════════════════════════════════

function isAdminRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env["AGENT_HMAC_SECRET"];

  if (!adminSecret || adminSecret.length < 32 || !authHeader?.startsWith("Bearer ")) {
    return false;
  }

  try {
    const token = authHeader.slice(7);
    const a = Buffer.from(token, "utf-8");
    const b = Buffer.from(adminSecret, "utf-8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/health
// Public: minimal status. Admin (Bearer token): detailed diagnostics.
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  // Check database connection
  let dbStatus = "unknown";
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  const isHealthy = dbStatus === "connected";

  // ── Public response: minimal info only ────────────────────────────
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
      { status: isHealthy ? 200 : 503 }
    );
  }

  // ── Admin response: full diagnostics ──────────────────────────────
  const { validateEnv, clientEnv, getRpcUrl } = await import("@/lib/env");
  const validation = validateEnv(process.env["NODE_ENV"] === "production");

  // Check blockchain connection
  let chainStatus = "unknown";
  try {
    const rpcUrl = getRpcUrl();
    const isSolana = clientEnv.networkFamily === "solana";

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isSolana
          ? { jsonrpc: "2.0", method: "getHealth", params: [], id: 1 }
          : { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }
      ),
    });
    chainStatus = response.ok ? "connected" : "error";
  } catch {
    chainStatus = "error";
  }

  // Check IPFS
  const ipfsConfigured = !!(process.env["PINATA_JWT"] || process.env["PINATA_API_KEY"]);

  const status = {
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env["NODE_ENV"] || "development",

    services: {
      database: dbStatus,
      blockchain: chainStatus,
      ipfs: ipfsConfigured ? "configured" : "not_configured",
    },

    config: {
      networkFamily: clientEnv.networkFamily,
      chainId: clientEnv.chainId,
      solanaCluster: clientEnv.solanaCluster,
      network: clientEnv.isMainnet ? "mainnet" : "testnet",
      factoryDeployed: !!clientEnv.factoryAddress,
    },

    validation: {
      valid: validation.valid,
      // SECURITY: Only show count of missing vars, not names
      missing_count: validation.missing.length,
      warning_count: validation.warnings.length,
    },
  };

  return NextResponse.json(status, {
    status: isHealthy ? 200 : 503,
  });
}
