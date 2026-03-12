import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { deployCollectionOnChain, getDeployerBalance } from "@/lib/contracts";
import {
  DeployCollectionSchema,
  prepareCollectionAssets,
} from "@/lib/collection-deploy";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  isEvmCollectionChain,
  normalizeCollectionAddress,
} from "@/lib/collection-chains";
import { buildSolanaDeploymentManifest } from "@/lib/solana-collections";
import { checkRateLimit, RATE_LIMIT_DEPLOY } from "@/lib/rate-limit";
import { getAddressExplorerUrl } from "@/lib/network-config";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 });
    }

    if (agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json(
        { success: false, error: "Agent not verified", hint: "Complete the claim process first" },
        { status: 403 }
      );
    }

    const deployRateLimit = checkRateLimit(`deploy:${agent.id}`, RATE_LIMIT_DEPLOY);
    if (!deployRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many deployment requests. Please try again later.",
          retry_after_seconds: deployRateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(deployRateLimit.retryAfterSeconds || 60) },
        }
      );
    }

    const body = await request.json();
    const validation = DeployCollectionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const assets = await prepareCollectionAssets(data, agent.name);

    if (isEvmCollectionChain(assets.chain)) {
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
        status: isEvmCollectionChain(assets.chain) ? "DEPLOYING" : "PENDING_SIGNATURE",
        address: `pending_${Date.now()}`,
        deployTxHash: "pending",
      },
    });

    if (!isEvmCollectionChain(assets.chain)) {
      const manifest = buildSolanaDeploymentManifest({
        authority: assets.authorityAddress,
        payoutAddress: data.payout_address,
        collectionId: collection.id,
        name: data.name,
        symbol: data.symbol,
        baseUri: assets.baseUri,
        maxSupply: data.max_supply,
        mintPriceLamports: BigInt(assets.mintPriceRaw),
        royaltyBps: data.royalty_bps,
      });

      return NextResponse.json({
        success: true,
        collection: {
          id: collection.id,
          chain: collection.chain,
          address: manifest.collection_address,
          name: collection.name,
          symbol: collection.symbol,
          max_supply: collection.maxSupply,
          mint_price_native: assets.mintPriceInput,
          mint_price_raw: assets.mintPriceRaw,
          native_token: assets.nativeToken,
          image_url: assets.imageHttpUrl,
          base_uri: assets.baseUri,
          status: collection.status,
        },
        deployment: {
          mode: "agent_sign",
          program_id: manifest.program_id,
          cluster: manifest.cluster,
          authority: manifest.authority,
          predicted_collection_address: manifest.collection_address,
          instructions: manifest.instructions,
          confirm_endpoint: "/api/v1/collections/confirm",
        },
        message: "Solana deployment manifest prepared. Sign and confirm to activate the collection.",
      });
    }

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
      collection: {
        id: collection.id,
        chain: collection.chain,
        address: normalizedAddress,
        name: collection.name,
        symbol: collection.symbol,
        max_supply: collection.maxSupply,
        mint_price_native: assets.mintPriceInput,
        mint_price_raw: assets.mintPriceRaw,
        native_token: assets.nativeToken,
        mint_url: `${process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz"}/collection/${normalizedAddress}`,
        image_url: assets.imageHttpUrl,
        base_uri: assets.baseUri,
        tx_hash: deployResult.txHash,
        explorer_url: getAddressExplorerUrl(normalizedAddress, collection.chain),
      },
      message: "Collection deployed on-chain successfully!",
    });
  } catch (error) {
    console.error("Deploy error:", error);
    return NextResponse.json({ success: false, error: "Deployment failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 });
    }

    const collections = await prisma.collection.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      collections: collections.map((c) => ({
        id: c.id,
        address: c.address,
        chain: c.chain,
        name: c.name,
        symbol: c.symbol,
        max_supply: c.maxSupply,
        total_minted: c.totalMinted,
        mint_price_raw: c.mintPrice,
        mint_price_native: formatCollectionMintPrice(c.mintPrice, c.chain),
        native_token: getCollectionNativeToken(c.chain),
        status: c.status,
        created_at: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("List collections error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list collections" },
      { status: 500 }
    );
  }
}
