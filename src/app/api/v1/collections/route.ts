import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  DeployCollectionSchema,
  prepareCollectionAssets,
} from "@/lib/collection-deploy";
import { getUploadErrorMessage } from "@/lib/ipfs";
import {
  buildCollectionBagsView,
  prepareCollectionBagsRecord,
} from "@/lib/collection-bags";
import {
  CollectionBagsLaunchError,
  confirmCollectionBagsLaunch,
  prepareCollectionBagsLaunch,
} from "@/lib/collection-bags-launch";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { buildSolanaDeploymentManifest } from "@/lib/solana-collections";
import { checkRateLimit, RATE_LIMIT_DEPLOY } from "@/lib/rate-limit";
import {
  AgentWalletError,
  deployCollectionWithAgentWallet,
  getAgentOperationalWalletAddress,
  signAndBroadcastBagsTransactions,
} from "@/lib/agent-wallets";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export const dynamic = "force-dynamic";

function getCanonicalSolanaChain(): "solana" | "solana-devnet" {
  return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana";
}

export async function POST(request: NextRequest) {
  let createdCollectionId: string | null = null;
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
    const agentAuthority = getAgentOperationalWalletAddress(agent);
    const normalizedBody = {
      ...body,
      chain: getCanonicalSolanaChain(),
      authority_address: agentAuthority,
      bags: body?.bags
        ? {
            ...body.bags,
            creator_wallet: agentAuthority,
          }
        : body?.bags,
    };
    const validation = DeployCollectionSchema.safeParse(normalizedBody);
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

    let collection = await prisma.collection.create({
      data: {
        agentId: agent.id,
        agentEoa: agent.eoa,
        chain: assets.chain,
        authorityAddress: agentAuthority,
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
        bagsCreatorWallet: agentAuthority,
        bagsInitialBuyLamports: bagsRecord.bagsInitialBuyLamports,
        status: "DEPLOYING",
        address: `pending_${Date.now()}`,
        deployTxHash: "pending",
      },
    });
    createdCollectionId = collection.id;
    const deployment = await deployCollectionWithAgentWallet(agent, {
      authority: agentAuthority,
      payoutAddress: data.payout_address,
      collectionId: collection.id,
      name: data.name,
      symbol: data.symbol,
      baseUri: assets.baseUri,
      maxSupply: data.max_supply,
      mintPriceLamports: BigInt(assets.mintPriceRaw),
      royaltyBps: data.royalty_bps,
    });
    collection = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        address: deployment.collectionAddress,
        deployTxHash: deployment.signature,
        status: "ACTIVE",
        deployedAt: new Date(),
      },
    });

    const manifest = buildSolanaDeploymentManifest({
      authority: agentAuthority,
      payoutAddress: data.payout_address,
      collectionId: collection.id,
      name: data.name,
      symbol: data.symbol,
      baseUri: assets.baseUri,
      maxSupply: data.max_supply,
      mintPriceLamports: BigInt(assets.mintPriceRaw),
      royaltyBps: data.royalty_bps,
    });

    const warnings: string[] = [];
    let bagsCollection = collection;
    let bags = buildCollectionBagsView(collection);
    if (bags && bags.status !== "DISABLED" && !bags.token_address) {
      try {
        const preparedBags = await prepareCollectionBagsLaunch(agent.id, { collection_id: collection.id });
        const signedBags = await signAndBroadcastBagsTransactions(
          agent,
          preparedBags.fee_config.transactions_base64,
          preparedBags.launch.transaction_base64
        );
        const confirmedBags = await confirmCollectionBagsLaunch(agent.id, {
          collection_id: collection.id,
          launch_tx_hash: signedBags.launchSignature,
          token_address: preparedBags.token_info.tokenMint,
          config_key: preparedBags.fee_config.config_key,
        });
        bagsCollection = confirmedBags.collection;
        bags = confirmedBags.bags;
      } catch (error) {
        console.error("Automatic Bags launch failed:", error);
        const message =
          error instanceof CollectionBagsLaunchError || error instanceof AgentWalletError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Automatic Bags launch failed";
        warnings.push(message);
        bagsCollection =
          (await prisma.collection.findUnique({
            where: { id: collection.id },
          })) || collection;
        bags = buildCollectionBagsView(bagsCollection);
      }
    }

    return NextResponse.json({
      success: true,
      collection: {
        id: bagsCollection.id,
        chain: bagsCollection.chain,
        address: bagsCollection.address,
        name: bagsCollection.name,
        symbol: bagsCollection.symbol,
        max_supply: bagsCollection.maxSupply,
        mint_price_native: assets.mintPriceInput,
        mint_price_raw: assets.mintPriceRaw,
        native_token: assets.nativeToken,
        image_url: assets.imageHttpUrl,
        base_uri: assets.baseUri,
        bags,
      },
      deployment: {
        mode: "agent_wallet_auto",
        program_id: manifest.program_id,
        cluster: deployment.cluster,
        authority: deployment.authority,
        predicted_collection_address: deployment.collectionAddress,
        deploy_tx_hash: deployment.signature,
        wallet_address: agentAuthority,
        wallet_balance_sol: deployment.walletBalance.sol,
        recommended_deploy_balance_sol: deployment.recommendedDeployBalanceSol,
        user_signature_required: false,
        confirm_endpoint: null,
      },
      bags_community: bags
        ? {
            status: bags.status,
            launch_required: !bags.token_address,
            prepare_endpoint: !bags.token_address ? "/api/v1/collections/bags" : null,
            confirm_endpoint: !bags.token_address ? "/api/v1/collections/bags/confirm" : null,
          }
        : null,
      warnings: warnings.length > 0 ? warnings : undefined,
      message:
        warnings.length > 0
          ? "Collection deployed automatically from the agent wallet. Bags setup still needs attention."
          : "Collection deployed automatically from the agent wallet.",
    });
  } catch (error) {
    if (createdCollectionId) {
      await prisma.collection.updateMany({
        where: {
          id: createdCollectionId,
          status: "DEPLOYING",
        },
        data: {
          status: "FAILED",
        },
      });
    }
    if (error instanceof AgentWalletError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details,
        },
        { status: error.status }
      );
    }
    console.error("Deploy error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Deployment failed",
        details: getUploadErrorMessage(error, "Unknown deployment error"),
      },
      { status: 500 }
    );
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
