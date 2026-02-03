import { NextRequest, NextResponse } from "next/server";
import { 
  createDeployerWalletClient, 
  addAgentToAllowlist, 
  isAgentAllowedOnChain,
  publicClient,
  FACTORY_ADDRESS 
} from "@/lib/contracts";

/**
 * GET /api/admin/allowlist
 * Check deployer allowlist status
 */
export async function GET() {
  try {
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
      factory: FACTORY_ADDRESS,
    });
  } catch (error) {
    console.error("[Allowlist] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to check allowlist" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/allowlist
 * Add deployer to Factory allowlist
 */
export async function POST(request: NextRequest) {
  try {
    // Simple auth check
    const authHeader = request.headers.get("authorization");
    const adminSecret = process.env.AGENT_HMAC_SECRET;
    
    if (adminSecret && adminSecret !== "your-secure-hmac-secret-min-32-chars") {
      if (authHeader !== `Bearer ${adminSecret}`) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
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
      { success: false, error: error instanceof Error ? error.message : "Failed to add to allowlist" },
      { status: 500 }
    );
  }
}
