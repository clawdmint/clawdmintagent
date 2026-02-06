import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { uploadImage, uploadJson, ipfsToHttp } from "@/lib/ipfs";
import { parseEther } from "viem";
import { deployCollectionOnChain, getDeployerBalance } from "@/lib/contracts";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const DeploySchema = z.object({
  name: z.string().min(1).max(100),
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Symbol must be uppercase alphanumeric"),
  description: z.string().max(1000).optional(),
  image: z.string(), // URL or data URI
  max_supply: z.number().int().min(1).max(100000),
  mint_price_eth: z
    .string()
    .regex(/^\d+\.?\d*$/, "Invalid ETH amount"),
  payout_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  royalty_bps: z.number().int().min(0).max(1000).default(500),
  // Optional: caller identification (not required for x402)
  agent_name: z.string().max(100).optional(),
  agent_eoa: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/x402/deploy
// Deploy a new NFT collection via x402 payment
// No API key required — payment IS the authentication
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: X402_PRICING.DEPLOY_COLLECTION,
      description:
        "Deploy a new NFT collection on Base via Clawdmint",
    },
    async () => {
      try {
        // Parse body
        const body = await request.json();
        const validation = DeploySchema.safeParse(body);

        if (!validation.success) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid request",
              details: validation.error.errors,
            },
            { status: 400 }
          );
        }

        const data = validation.data;

        // Find or create an agent for this deployment
        let agent = null;
        if (data.agent_eoa) {
          agent = await prisma.agent.findFirst({
            where: { eoa: data.agent_eoa.toLowerCase() },
          });
        }

        // If no agent found, use or create a generic "x402-deployer" agent
        if (!agent) {
          agent = await prisma.agent.findFirst({
            where: { name: "x402-deployer" },
          });

          if (!agent) {
            agent = await prisma.agent.create({
              data: {
                name: data.agent_name || "x402-deployer",
                eoa: data.agent_eoa || data.payout_address.toLowerCase(),
                description:
                  "Deployments made via x402 payment protocol",
                status: "VERIFIED",
                deployEnabled: true,
                hmacKeyHash: `x402_${Date.now()}`, // Unique placeholder
              },
            });
          }
        }

        // Upload to IPFS
        let imageUrl = data.image;
        let baseUri = "";

        const isPinataConfigured =
          process.env["PINATA_JWT"] &&
          process.env["PINATA_JWT"].length > 100;

        if (isPinataConfigured) {
          console.log("[x402/deploy] Uploading image to IPFS...");
          const imageUpload = await uploadImage(
            data.image,
            `${data.symbol}-cover`
          );
          if (!imageUpload.success) {
            console.warn(
              "[x402/deploy] IPFS upload failed, using direct URL:",
              imageUpload.error
            );
            imageUrl = data.image;
            baseUri = data.image;
          } else {
            imageUrl = `ipfs://${imageUpload.cid}`;

            const metadata = {
              name: data.name,
              description:
                data.description ||
                `${data.name} - Deployed via x402 on Clawdmint`,
              image: imageUrl,
              external_link: `https://clawdmint.xyz`,
              seller_fee_basis_points: data.royalty_bps,
              fee_recipient: data.payout_address,
            };

            const metadataUpload = await uploadJson(
              metadata,
              `${data.symbol}-metadata`
            );
            if (!metadataUpload.success) {
              console.warn(
                "[x402/deploy] Metadata upload failed:",
                metadataUpload.error
              );
              baseUri = imageUrl;
            } else {
              baseUri = `ipfs://${metadataUpload.cid}/`;
            }
          }
        } else {
          console.log("[x402/deploy] IPFS not configured, using direct URLs");
          imageUrl = data.image;
          baseUri = data.image;
        }

        const mintPriceWei = parseEther(data.mint_price_eth);
        const toHttpUrl = (url: string) =>
          url.startsWith("ipfs://") ? ipfsToHttp(url) : url;

        // Check deployer balance
        const deployerBalance = await getDeployerBalance();
        console.log(
          "[x402/deploy] Deployer balance:",
          deployerBalance,
          "ETH"
        );

        if (parseFloat(deployerBalance) < 0.001) {
          return NextResponse.json(
            {
              success: false,
              error: "Insufficient deployer balance",
              hint: "Platform deployer needs ETH for gas fees",
            },
            { status: 503 }
          );
        }

        // Create collection record
        const collection = await prisma.collection.create({
          data: {
            agentId: agent.id,
            agentEoa: agent.eoa,
            name: data.name,
            symbol: data.symbol,
            description: data.description,
            imageUrl: toHttpUrl(imageUrl),
            baseUri,
            maxSupply: data.max_supply,
            mintPrice: mintPriceWei.toString(),
            royaltyBps: data.royalty_bps,
            payoutAddress: data.payout_address,
            status: "DEPLOYING",
            address: `pending_${Date.now()}`,
            deployTxHash: "pending",
          },
        });

        // Deploy on-chain
        console.log(
          "[x402/deploy] Starting on-chain deployment for:",
          collection.id
        );

        const deployResult = await deployCollectionOnChain({
          name: data.name,
          symbol: data.symbol,
          baseURI: baseUri,
          maxSupply: BigInt(data.max_supply),
          mintPrice: mintPriceWei,
          payoutAddress: data.payout_address as `0x${string}`,
          royaltyBps: data.royalty_bps,
        });

        if (!deployResult.success || !deployResult.collectionAddress) {
          await prisma.collection.update({
            where: { id: collection.id },
            data: {
              status: "FAILED",
              deployTxHash: deployResult.txHash || "failed",
            },
          });

          return NextResponse.json(
            {
              success: false,
              error: `On-chain deployment failed: ${deployResult.error}`,
              tx_hash: deployResult.txHash,
            },
            { status: 500 }
          );
        }

        // Update collection with real address
        await prisma.collection.update({
          where: { id: collection.id },
          data: {
            address: deployResult.collectionAddress.toLowerCase(),
            status: "ACTIVE",
            deployedAt: new Date(),
            deployTxHash: deployResult.txHash!,
          },
        });

        const appUrl =
          process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
        const explorerUrl =
          process.env["NEXT_PUBLIC_CHAIN_ID"] === "8453"
            ? "https://basescan.org"
            : "https://sepolia.basescan.org";

        return NextResponse.json({
          success: true,
          payment_method: "x402",
          collection: {
            id: collection.id,
            address: deployResult.collectionAddress,
            name: collection.name,
            symbol: collection.symbol,
            max_supply: collection.maxSupply,
            mint_price_eth: data.mint_price_eth,
            mint_url: `${appUrl}/collection/${deployResult.collectionAddress}`,
            image_url: toHttpUrl(imageUrl),
            base_uri: baseUri,
            tx_hash: deployResult.txHash,
            explorer_url: `${explorerUrl}/address/${deployResult.collectionAddress}`,
          },
          message:
            "Collection deployed on-chain via x402 payment! 🦞",
        });
      } catch (error) {
        console.error("[x402/deploy] Deploy error:", error);
        return NextResponse.json(
          { success: false, error: "Deployment failed" },
          { status: 500 }
        );
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OPTIONS (CORS preflight for x402 headers)
// ═══════════════════════════════════════════════════════════════════════

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
