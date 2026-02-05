import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { 
  createDeployerWalletClient, 
  addAgentToAllowlist, 
  isAgentAllowedOnChain,
  publicClient,
  FACTORY_ADDRESS_GETTER
} from "@/lib/contracts";

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// ADMIN AUTH HELPER
// ═══════════════════════════════════════════════════════════════════════

function verifyAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env["AGENT_HMAC_SECRET"];

  // SECURITY: Reject if secret is not configured or is a placeholder
  if (!adminSecret || adminSecret.length < 32) {
    console.error("[Allowlist] AGENT_HMAC_SECRET not configured or too short");
    return false;
  }

  // SECURITY: Reject known placeholder values
  const PLACEHOLDER_VALUES = [
    "your-secure-hmac-secret-min-32-chars",
    "change-me",
    "placeholder",
    "test",
  ];
  if (PLACEHOLDER_VALUES.some((p) => adminSecret.toLowerCase().includes(p))) {
    console.error("[Allowlist] AGENT_HMAC_SECRET contains placeholder value");
    return false;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const providedToken = authHeader.slice(7); // Remove "Bearer "

  // SECURITY: Timing-safe comparison to prevent timing attacks
  try {
    const a = Buffer.from(providedToken, "utf-8");
    const b = Buffer.from(adminSecret, "utf-8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/allowlist
// Check deployer allowlist status (requires admin auth)
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication for admin endpoints
    if (!verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { address: deployerAddress } = createDeployerWalletClient();
    
    const isAllowed = await isAgentAllowedOnChain(deployerAddress);
    const balance = await publicClient.getBalance({ address: deployerAddress });
    
    return NextResponse.json({
      success: true,
      deployer: {
        address: deployerAddress,
        is_allowed: isAllowed,
        balance_wei: balance.toString(),
        balance_eth: (Number(balance) / 1e18).toFixed(6),
      },
      factory: FACTORY_ADDRESS_GETTER(),
    });
  } catch (error) {
    console.error("[Allowlist] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/allowlist
// Add deployer to Factory allowlist (requires admin auth)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication - no bypass possible
    if (!verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { address: deployerAddress } = createDeployerWalletClient();
    
    // Check if already allowed
    const isAlreadyAllowed = await isAgentAllowedOnChain(deployerAddress);
    if (isAlreadyAllowed) {
      return NextResponse.json({
        success: true,
        message: "Deployer is already on the allowlist",
        deployer: deployerAddress,
      });
    }

    // Add to allowlist
    console.log("[Allowlist] Adding deployer to allowlist:", deployerAddress);
    const txHash = await addAgentToAllowlist(deployerAddress);
    
    return NextResponse.json({
      success: true,
      message: "Deployer added to allowlist!",
      deployer: deployerAddress,
      tx_hash: txHash,
    });
  } catch (error) {
    console.error("[Allowlist] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
