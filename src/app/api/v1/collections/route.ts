import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  DeployCollectionSchema,
  prepareCollectionAssets,
} from "@/lib/collection-deploy";
import {
  buildCollectionBagsView,
  prepareCollectionBagsRecord,
} from "@/lib/collection-bags";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { buildSolanaDeploymentManifest } from "@/lib/solana-collections";
import { checkRateLimit, RATE_LIMIT_DEPLOY } from "@/lib/rate-limit";

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
    const bagsRecord = prepareCollectionBagsRecord({
      input: data.bags,
      chain: assets.chain,
      authorityAddress: assets.authorityAddress,
      payoutAddress: data.payout_address,
      collectionName: data.name,
      collectionSymbol: data.symbol,
    });

    const collection = await prisma.collection.create({
      data: {
        agentId: agent.id,
        agentEoa: agent.eoa,
        chain: assets.chain,
        authorityAddress: bagsRecord.authorityAddress,
        name: data.name,
        symbol: data.symbol,
        description: data.description,
        imageUrl: assets.imageHttpUrl,
        baseUri: assets.baseUri,
        maxSupply: data.max_supply,
        mintPrice: assets.mintPriceRaw,
        royaltyBps: data.royalty_bps,
        payoutAddress: data.payout_address,
        bagsStatus: bagsRecord.bagsStatus,
        bagsTokenAddress: bagsRecord.bagsTokenAddress,
        bagsTokenName: bagsRecord.bagsTokenName,
        bagsTokenSymbol: bagsRecord.bagsTokenSymbol,
        bagsMintAccess: bagsRecord.bagsMintAccess,
        bagsMinTokenBalance: bagsRecord.bagsMinTokenBalance,
        bagsFeeConfig: bagsRecord.bagsFeeConfig,
        bagsCreatorWallet: bagsRecord.bagsCreatorWallet,
        bagsInitialBuyLamports: bagsRecord.bagsInitialBuyLamports,
        status: "PENDING_SIGNATURE",
        address: `pending_${Date.now()}`,
        deployTxHash: "pending",
      },
    });
    const bags = buildCollectionBagsView(collection);
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
        bags,
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
      bags_community: bags
        ? {
            status: bags.status,
            launch_required: !bags.token_address,
            prepare_endpoint: !bags.token_address ? "/api/v1/collections/bags" : null,
            confirm_endpoint: !bags.token_address ? "/api/v1/collections/bags/confirm" : null,
          }
        : null,
      message: "Solana deployment manifest prepared. Sign and confirm to activate the collection.",
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
      where: {
        agentId: agent.id,
        chain: { in: SOLANA_COLLECTION_CHAINS },
      },
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
        bags: buildCollectionBagsView(c),
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
