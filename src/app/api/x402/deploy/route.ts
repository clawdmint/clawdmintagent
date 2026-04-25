import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { deployCollectionOnChain, getDeployerBalance } from "@/lib/contracts";
import {
  BaseDeployCollectionSchema,
  normalizeAgentWallet,
  prepareCollectionAssets,
  refineDeployCollectionInput,
} from "@/lib/collection-deploy";
import {
  isEvmCollectionChain,
  normalizeCollectionAddress,
} from "@/lib/collection-chains";
import { getAddressExplorerUrl } from "@/lib/network-config";
import { withX402Payment, X402_PRICING } from "@/lib/x402";

export const dynamic = "force-dynamic";

const X402DeploySchema = BaseDeployCollectionSchema.extend({
  agent_name: z.string().max(100).optional(),
  agent_eoa: z.string().optional(),
  agent_address: z.string().optional(),
  agent_api_key: z.string().optional(),
}).superRefine(refineDeployCollectionInput);

export async function POST(request: NextRequest) {
  return withX402Payment(
    request,
    {
      price: X402_PRICING.DEPLOY_COLLECTION,
      description: "Deploy a Solana NFT collection via Clawdmint after funding and verification",
    },
    async () => {
      try {
        const body = await request.json();
        const validation = X402DeploySchema.safeParse(body);

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

        if (!isEvmCollectionChain(data.chain)) {
          if (!data.agent_api_key) {
            return NextResponse.json(
              {
                success: false,
                error: "agent_api_key is required for Solana x402 deploys",
                hint: "First create an agent via /api/x402/register or /api/v1/agents/register, fund and verify it, then retry with agent_api_key",
              },
              { status: 400 }
            );
          }

          const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
          const deployResponse = await fetch(`${appUrl}/api/v1/collections`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.agent_api_key}`,
            },
            body: JSON.stringify({
              ...body,
              chain: "solana",
            }),
          });

          const deployPayload = await deployResponse.json();
          if (!deployResponse.ok) {
            return NextResponse.json(
              {
                success: false,
                payment_method: "x402",
                upstream: "api/v1/collections",
                ...deployPayload,
              },
              { status: deployResponse.status }
            );
          }

          return NextResponse.json({
            ...deployPayload,
            payment_method: "x402",
            message: "Collection deployment started via x402 payment and Clawdmint Solana deploy flow.",
          });
        }

        const requestedAgentAddress = normalizeAgentWallet(
          data.agent_address || data.agent_eoa || data.payout_address
        );

        let agent = await prisma.agent.findFirst({
          where: { eoa: requestedAgentAddress },
        });

        if (!agent) {
          agent = await prisma.agent.findFirst({
            where: { name: "x402-deployer" },
          });
        }

        if (!agent) {
          agent = await prisma.agent.create({
            data: {
              name: data.agent_name || "x402-deployer",
              eoa: requestedAgentAddress,
              description: "Deployments made via x402 payment protocol",
              status: "VERIFIED",
              deployEnabled: true,
            },
          });
        }

        const assets = await prepareCollectionAssets(data, agent.name);

        const deployerBalance = await getDeployerBalance();
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

        const collection = await prisma.collection.create({
          data: {
            agentId: agent.id,
            agentEoa: agent.eoa,
            chain: assets.chain,
            name: data.name,
            symbol: data.symbol,
            description: data.description,
            imageUrl: assets.imageHttpUrl,
            baseUri: assets.baseUri,
            maxSupply: data.max_supply,
            mintPrice: assets.mintPriceRaw,
            royaltyBps: data.royalty_bps,
            payoutAddress: data.payout_address,
            status: "DEPLOYING",
            address: `pending_${Date.now()}`,
            deployTxHash: "pending",
          },
        });

        const deployResult = await deployCollectionOnChain({
          name: data.name,
          symbol: data.symbol,
          baseURI: assets.baseUri,
          maxSupply: BigInt(data.max_supply),
          mintPrice: BigInt(assets.mintPriceRaw),
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

        const normalizedAddress = normalizeCollectionAddress(deployResult.collectionAddress, assets.chain);
        await prisma.collection.update({
          where: { id: collection.id },
          data: {
            address: normalizedAddress,
            status: "ACTIVE",
            deployedAt: new Date(),
            deployTxHash: deployResult.txHash!,
          },
        });

        return NextResponse.json({
          success: true,
          payment_method: "x402",
          collection: {
            id: collection.id,
            chain: collection.chain,
            address: normalizedAddress,
            name: collection.name,
            symbol: collection.symbol,
            max_supply: collection.maxSupply,
            mint_price_native: assets.mintPriceInput,
            mint_price_raw: assets.mintPriceRaw,
            image_url: assets.imageHttpUrl,
            base_uri: assets.baseUri,
            tx_hash: deployResult.txHash,
            explorer_url: getAddressExplorerUrl(normalizedAddress, collection.chain),
          },
          message: "Collection deployed on-chain via x402 payment!",
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
