import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { DeployCollectionSchema, prepareCollectionAssets } from "@/lib/collection-deploy";
import { getUploadErrorMessage } from "@/lib/ipfs";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { checkRateLimit, RATE_LIMIT_DEPLOY } from "@/lib/rate-limit";
import {
  AgentWalletError,
  getAgentOperationalKeypair,
  getAgentOperationalWalletAddress,
} from "@/lib/agent-wallets";
import {
  continueMetaplexCollectionDeploy,
  deployMetaplexCollection,
  METAPLEX_MINT_ENGINE,
  MetaplexMintError,
} from "@/lib/metaplex-core-candy-machine";
import { getAgentMetaplexSummary } from "@/lib/metaplex-agent-registry";


function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export const dynamic = "force-dynamic";

const DEPLOY_RESUME_WINDOW_MS = 60 * 60 * 1000;
const MAX_CONFIG_BATCHES_PER_REQUEST = 1;

function getCanonicalSolanaChain(): "solana" | "solana-devnet" {
  return process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana";
}

export async function POST(request: NextRequest) {
  let createdCollectionId: string | null = null;

  try {
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
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
    const metaplex = await getAgentMetaplexSummary(agent.id);

    const agentAuthority = getAgentOperationalWalletAddress(agent);
    const requestedCollectionId =
      typeof body?.collection_id === "string" && body.collection_id.trim().length > 0
        ? body.collection_id.trim()
        : null;

    let collection = requestedCollectionId
      ? await prisma.collection.findFirst({
          where: {
            id: requestedCollectionId,
            agentId: agent.id,
            chain: getCanonicalSolanaChain(),
          },
        })
      : null;

    if (requestedCollectionId && !collection) {
      return NextResponse.json(
        { success: false, error: "Collection not found for resume" },
        { status: 404 }
      );
    }

    if (!collection) {
      const normalizedBody = {
        ...body,
        chain: getCanonicalSolanaChain(),
        authority_address: agentAuthority,
      };
      const validation = DeployCollectionSchema.safeParse(normalizedBody);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: "Invalid request", details: validation.error.errors },
          { status: 400 }
        );
      }

      const data = validation.data;
      collection = await prisma.collection.findFirst({
        where: {
          agentId: agent.id,
          chain: getCanonicalSolanaChain(),
          name: data.name,
          symbol: data.symbol,
          status: "DEPLOYING",
          createdAt: {
            gte: new Date(Date.now() - DEPLOY_RESUME_WINDOW_MS),
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!collection) {
        const assets = await prepareCollectionAssets(data, agent.name);
        collection = await prisma.collection.create({
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
            mintEngine: METAPLEX_MINT_ENGINE,
            maxSupply: data.max_supply,
            mintPrice: assets.mintPriceRaw,
            royaltyBps: data.royalty_bps,
            payoutAddress: data.payout_address,
            status: "DEPLOYING",
            address: `pending_${Date.now()}`,
            deployTxHash: "pending",
          },
        });
        createdCollectionId = collection.id;
      }
    }

    const signer = getAgentOperationalKeypair(agent);
    let deployment:
      | {
          cluster: "mainnet-beta" | "devnet";
          authority: string;
          collectionAddress: string;
          candyMachineAddress: string;
          candyGuardAddress: string | null;
          signature: string;
          configLineSignatures: string[];
          itemsLoaded: number;
          itemsAvailable: number;
          isFullyLoaded: boolean;
          walletBalanceLamports: string;
          recommendedDeployBalanceSol: string;
        }
      | null = null;

    if (!collection.mintAddress) {
      const initialDeployment = await deployMetaplexCollection(
        signer,
        {
          authority: agentAuthority,
          payoutAddress: collection.payoutAddress,
          name: collection.name,
          symbol: collection.symbol,
          baseUri: collection.baseUri,
          maxSupply: collection.maxSupply,
          mintPriceLamports: BigInt(collection.mintPrice),
          royaltyBps: collection.royaltyBps,
        },
        { maxConfigBatchesPerRun: MAX_CONFIG_BATCHES_PER_REQUEST }
      );

      collection = await prisma.collection.update({
        where: { id: collection.id },
        data: {
          address: initialDeployment.collectionAddress,
          mintAddress: initialDeployment.candyMachineAddress,
          deployTxHash: initialDeployment.signature,
          status: initialDeployment.isFullyLoaded ? "ACTIVE" : "DEPLOYING",
          deployedAt: initialDeployment.isFullyLoaded ? new Date() : null,
        },
      });

      deployment = {
        cluster: initialDeployment.cluster,
        authority: initialDeployment.authority,
        collectionAddress: initialDeployment.collectionAddress,
        candyMachineAddress: initialDeployment.candyMachineAddress,
        candyGuardAddress: initialDeployment.candyGuardAddress,
        signature: initialDeployment.signature,
        configLineSignatures: initialDeployment.configLineSignatures,
        itemsLoaded: initialDeployment.itemsLoaded,
        itemsAvailable: initialDeployment.itemsAvailable,
        isFullyLoaded: initialDeployment.isFullyLoaded,
        walletBalanceLamports: initialDeployment.walletBalanceLamports,
        recommendedDeployBalanceSol: initialDeployment.recommendedDeployBalanceSol,
      };
    } else {
      const existingMintAddress = collection.mintAddress;
      if (!existingMintAddress) {
        throw new Error("Collection is missing Candy Machine address during deploy resume");
      }

      const configProgress = await continueMetaplexCollectionDeploy(signer, {
        candyMachineAddress: existingMintAddress,
        maxSupply: collection.maxSupply,
        maxConfigBatchesPerRun: MAX_CONFIG_BATCHES_PER_REQUEST,
      });

      collection = await prisma.collection.update({
        where: { id: collection.id },
        data: {
          status: configProgress.isFullyLoaded ? "ACTIVE" : "DEPLOYING",
          deployedAt: configProgress.isFullyLoaded ? collection.deployedAt || new Date() : collection.deployedAt,
        },
      });

      deployment = {
        cluster: getCanonicalSolanaChain() === "solana-devnet" ? "devnet" : "mainnet-beta",
        authority: agentAuthority,
        collectionAddress: collection.address,
        candyMachineAddress: existingMintAddress,
        candyGuardAddress: null,
        signature: collection.deployTxHash,
        configLineSignatures: configProgress.configLineSignatures,
        itemsLoaded: configProgress.itemsLoaded,
        itemsAvailable: configProgress.itemsAvailable,
        isFullyLoaded: configProgress.isFullyLoaded,
        walletBalanceLamports: "0",
        recommendedDeployBalanceSol: "0",
      };
    }

    if (!deployment) {
      throw new Error("Collection deployment did not produce a deployment state");
    }

    const warnings: string[] = [];
    if (!metaplex?.delegated) {
      warnings.push(
        "Metaplex agent identity is not fully delegated yet. Call /api/v1/agents/metaplex separately after funding settles."
      );
    }

    return NextResponse.json({
      success: true,
      collection: {
        id: collection.id,
        chain: collection.chain,
        address: collection.address,
        collection_url: `${appUrl}/collection/${collection.address}`,
        name: collection.name,
        symbol: collection.symbol,
        max_supply: collection.maxSupply,
        mint_price_native: formatCollectionMintPrice(collection.mintPrice, collection.chain),
        mint_price_raw: collection.mintPrice,
        native_token: getCollectionNativeToken(collection.chain),
        image_url: collection.imageUrl,
        base_uri: collection.baseUri,
        status: collection.status,
      },
      deployment: {
        mode: "agent_wallet_auto",
        mint_engine: METAPLEX_MINT_ENGINE,
        program_id: null,
        cluster: deployment.cluster,
        status: deployment.isFullyLoaded ? "ACTIVE" : "DEPLOYING",
        authority: deployment.authority,
        predicted_collection_address: deployment.collectionAddress,
        collection_address: deployment.collectionAddress,
        mint_address: deployment.candyMachineAddress,
        candy_guard_address: deployment.candyGuardAddress,
        deploy_tx_hash: deployment.signature,
        wallet_address: agentAuthority,
        wallet_balance_sol: deployment.walletBalanceLamports
          ? formatCollectionMintPrice(deployment.walletBalanceLamports, "solana")
          : "0",
        recommended_deploy_balance_sol: deployment.recommendedDeployBalanceSol,
        config_line_tx_hashes: deployment.configLineSignatures,
        config_lines_loaded: deployment.itemsLoaded,
        config_lines_total: deployment.itemsAvailable,
        config_lines_remaining: Math.max(deployment.itemsAvailable - deployment.itemsLoaded, 0),
        resume_collection_id: deployment.isFullyLoaded ? null : collection.id,
        resume_hint: deployment.isFullyLoaded
          ? null
          : "Retry POST /api/v1/collections with the same bearer token and collection_id to continue config loading.",
        user_signature_required: false,
        confirm_endpoint: null,
      },
      agent_metaplex: metaplex,
      warnings: warnings.length > 0 ? warnings : undefined,
      message: !deployment.isFullyLoaded
        ? "Collection deployment started. Retry the same deploy with collection_id to continue loading Candy Machine config lines."
        : warnings.length > 0
          ? "Collection deployed automatically from the agent wallet with Metaplex identity warnings."
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

    if (error instanceof AgentWalletError || error instanceof MetaplexMintError) {
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
        mint_engine: c.mintEngine,
        mint_address: c.mintAddress,
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
