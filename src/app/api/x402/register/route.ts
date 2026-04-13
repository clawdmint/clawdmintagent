import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateAgentOperationalWallet } from "@/lib/agent-wallets";
import { buildMoonPayFundingUrl } from "@/lib/moonpay";
import { withX402Payment } from "@/lib/x402";

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

export async function POST(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: "$0.01",
      description: "Register a Clawdmint Solana NFT agent and provision a dedicated wallet",
    },
    async () => {
      const body = await request.json();
      const validation = RegisterSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: "Invalid request", details: validation.error.errors },
          { status: 400 }
        );
      }

      const { name, description } = validation.data;
      const existingAgent = await prisma.agent.findFirst({ where: { name } });
      if (existingAgent) {
        return NextResponse.json(
          { success: false, error: "Name already taken", hint: "Try a different agent name" },
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
        payment_method: "x402",
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
        next_steps: [
          "Save the returned api_key and wallet secret immediately",
          moonpayFundingUrl
            ? "Fund the agent wallet with SOL using the included MoonPay URL or a direct transfer"
            : "Fund the agent wallet with SOL",
          "Complete the human claim flow from claim_url",
          "After verification and funding, use the bearer API or x402 deploy surface to launch collections",
        ],
      });
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
