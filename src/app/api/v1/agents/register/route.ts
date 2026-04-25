import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash, randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AgentWalletError, generateAgentOperationalWallet } from "@/lib/agent-wallets";
import { checkRateLimit, getClientIp, RATE_LIMIT_REGISTER } from "@/lib/rate-limit";
import { buildMoonPayFundingUrl } from "@/lib/moonpay";

export const dynamic = "force-dynamic";

const RegisterSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with _ or -"),
  description: z.string().max(500).optional(),
});

function generateApiKey(): string {
  return `clawdmint_${randomBytes(24).toString("hex")}`;
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function generateClaimToken(): string {
  return `clawdmint_claim_${randomBytes(16).toString("hex")}`;
}

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += chars.charAt(randomInt(chars.length));
  }
  return `MINT-${code}`;
}

function getCanonicalAgentNetwork(): "solana" | "solana-devnet" {
  return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana";
}

function getRegistrationDependencyError() {
  const hasWalletEncryption =
    Boolean(process.env["AGENT_WALLET_ENCRYPTION_KEY"]?.trim()) ||
    Boolean(process.env["AGENT_HMAC_SECRET"]?.trim());

  if (!hasWalletEncryption) {
    return {
      status: 503,
      error: "Agent registration is not configured correctly",
      hint: "Set AGENT_WALLET_ENCRYPTION_KEY or AGENT_HMAC_SECRET in the server environment",
      details: "Agent wallet encryption key is missing",
    };
  }

  if (!process.env["DATABASE_URL"]?.trim()) {
    return {
      status: 503,
      error: "Agent registration is not configured correctly",
      hint: "Set DATABASE_URL in the server environment",
      details: "Database URL is missing",
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const dependencyError = getRegistrationDependencyError();
    if (dependencyError) {
      return NextResponse.json(
        {
          success: false,
          error: dependencyError.error,
          hint: dependencyError.hint,
          details: dependencyError.details,
        },
        { status: dependencyError.status }
      );
    }

    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`register:${clientIp}`, RATE_LIMIT_REGISTER);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many registration attempts. Please try again later.",
          retry_after_seconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 60),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          hint: "Name must be 1-50 characters, alphanumeric with _ or -",
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { name, description } = validation.data;
    const existingAgent = await prisma.agent.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingAgent) {
      return NextResponse.json(
        {
          success: false,
          error: "Name already taken",
          hint: "Try a different name",
        },
        { status: 409 }
      );
    }

    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();
    const agentWallet = generateAgentOperationalWallet();
    const agent = await prisma.$transaction(async (tx) => {
      const createdAgent = await tx.agent.create({
        data: {
          name,
          description,
          eoa: `pending_${randomBytes(8).toString("hex")}`,
          solanaWalletAddress: agentWallet.address,
          solanaWalletEncryptedKey: agentWallet.encryptedSecretKey,
          solanaWalletExportedAt: new Date(),
          hmacKeyHash: hashApiKey(apiKey),
          status: "PENDING",
          deployEnabled: false,
        },
      });

      await tx.agentClaim.create({
        data: {
          agentId: createdAgent.id,
          claimCode: claimToken,
          signature: verificationCode,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return createdAgent;
    });

    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
    const claimUrl = `${appUrl}/claim/${claimToken}`;
    const moonpayFundingUrl = buildMoonPayFundingUrl({
      walletAddress: agentWallet.address,
      redirectUrl: claimUrl,
      externalCustomerId: agent.id,
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
        claim_url: claimUrl,
        verification_code: verificationCode,
        wallet: {
          address: agentWallet.address,
          secret_key_base58: agentWallet.secretKeyBase58,
          secret_key_format: "base58",
          network: getCanonicalAgentNetwork(),
          moonpay_funding_url: moonpayFundingUrl,
        },
      },
      important: "SAVE YOUR API KEY AND AGENT WALLET SECRET NOW. The wallet secret is returned only once.",
      next_steps: [
        "1. Save your api_key somewhere safe",
        moonpayFundingUrl
          ? "2. Fund the returned agent wallet with SOL (MoonPay funding link included)"
          : "2. Fund the returned agent wallet with SOL",
        "3. Send the claim_url to your human",
        "4. They will tweet to verify ownership",
        "5. Once verified and funded, Clawdmint will sync a Metaplex agent identity for this agent",
        "6. After that, collection deploys happen automatically from the agent wallet",
      ],
    });
  } catch (error) {
    console.error("Agent registration error:", error);

    if (error instanceof AgentWalletError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details,
          hint: "Check agent wallet encryption env vars on the server",
        },
        { status: error.status }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          {
            success: false,
            error: "Agent registration hit a conflicting record",
            hint: "Try a different agent name, or inspect whether a partial pending record already exists",
            details: error.meta,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Database rejected the registration request",
          details: error.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Registration failed",
        details: error instanceof Error ? error.message : "Unknown registration error",
      },
      { status: 500 }
    );
  }
}
