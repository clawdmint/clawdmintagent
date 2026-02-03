// NOTE: server-only removed - this file uses crypto which is server-only by nature
import { createHmac, createHash, timingSafeEqual } from "crypto";
import { recoverMessageAddress, getAddress, isAddress } from "viem";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import { getEnv } from "./env";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface AgentAuthResult {
  success: boolean;
  agentId?: string;
  agentEoa?: string;
  error?: string;
}

interface HmacHeaders {
  agentId: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const MAX_TIMESTAMP_SKEW_SECONDS = 60;

// HMAC secret is read dynamically to prevent webpack inlining
function getHmacSecret(): string {
  return getEnv("AGENT_HMAC_SECRET", "");
}

// ═══════════════════════════════════════════════════════════════════════
// HMAC AUTHENTICATION (PRIMARY)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify HMAC-SHA256 signature for agent API authentication
 * 
 * Headers required:
 * - x-agent-id: Agent's database ID
 * - x-timestamp: Unix timestamp (seconds)
 * - x-nonce: Unique nonce for replay protection
 * - x-signature: HMAC-SHA256 signature
 * 
 * Signing string format:
 * timestamp + "\n" + method + "\n" + path + "\n" + body_sha256 + "\n" + nonce
 */
export async function verifyHmacAuth(
  request: NextRequest,
  body: string
): Promise<AgentAuthResult> {
  try {
    // Extract headers
    const headers = extractHmacHeaders(request);
    if (!headers) {
      return { success: false, error: "Missing required authentication headers" };
    }

    const { agentId, timestamp, nonce, signature } = headers;

    // Validate timestamp (prevent replay attacks)
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    
    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > MAX_TIMESTAMP_SKEW_SECONDS) {
      return { success: false, error: "Request timestamp too old or invalid" };
    }

    // Check nonce uniqueness
    const existingNonce = await prisma.usedNonce.findUnique({
      where: { agentId_nonce: { agentId, nonce } },
    });

    if (existingNonce) {
      return { success: false, error: "Nonce already used" };
    }

    // Look up agent
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, eoa: true, hmacKeyHash: true, status: true, deployEnabled: true },
    });

    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    if (agent.status !== "VERIFIED") {
      return { success: false, error: "Agent not verified" };
    }

    if (!agent.deployEnabled) {
      return { success: false, error: "Agent deployment disabled" };
    }

    // Compute expected signature
    const method = request.method;
    const path = new URL(request.url).pathname;
    const bodyHash = createHash("sha256").update(body || "").digest("hex");
    
    const signingString = `${timestamp}\n${method}\n${path}\n${bodyHash}\n${nonce}`;
    
    // Use agent-specific key if set, otherwise use global secret
    const hmacKey = agent.hmacKeyHash || getHmacSecret();
    const expectedSignature = createHmac("sha256", hmacKey)
      .update(signingString)
      .digest("hex");

    // Timing-safe comparison
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { success: false, error: "Invalid signature" };
    }

    // Store nonce to prevent replay
    await prisma.usedNonce.create({
      data: { agentId, nonce },
    });

    return {
      success: true,
      agentId: agent.id,
      agentEoa: agent.eoa,
    };
  } catch (error) {
    console.error("HMAC auth error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

function extractHmacHeaders(request: NextRequest): HmacHeaders | null {
  const agentId = request.headers.get("x-agent-id");
  const timestamp = request.headers.get("x-timestamp");
  const nonce = request.headers.get("x-nonce");
  const signature = request.headers.get("x-signature");

  if (!agentId || !timestamp || !nonce || !signature) {
    return null;
  }

  return { agentId, timestamp, nonce, signature };
}

// ═══════════════════════════════════════════════════════════════════════
// EIP-191 SIGNATURE VERIFICATION (SECONDARY)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify EIP-191 personal_sign signature
 * Used for agent claim verification
 */
export async function verifyEip191Signature(
  message: string,
  signature: `0x${string}`,
  expectedAddress: string
): Promise<boolean> {
  try {
    if (!isAddress(expectedAddress)) {
      return false;
    }

    const recoveredAddress = await recoverMessageAddress({
      message,
      signature,
    });

    // Compare checksummed addresses
    return getAddress(recoveredAddress) === getAddress(expectedAddress);
  } catch (error) {
    console.error("EIP-191 verification error:", error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CLAIM CODE GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a unique claim code for agent verification
 * Format: CLAWDMINT-AGENT-XXXX where XXXX is alphanumeric
 */
export function generateClaimCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CLAWDMINT-AGENT-${code}`;
}

// ═══════════════════════════════════════════════════════════════════════
// ADDRESS VALIDATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate and checksum an Ethereum address
 */
export function validateAndChecksumAddress(address: string): string | null {
  try {
    if (!isAddress(address)) {
      return null;
    }
    return getAddress(address);
  } catch {
    return null;
  }
}
