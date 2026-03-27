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
  resolveAutomaticBagsInput,
} from "@/lib/collection-bags";
import {
  CollectionBagsLaunchError,
  confirmCollectionBagsLaunch,
  prepareCollectionBagsLaunch,
} from "@/lib/collection-bags-launch";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  isBagsLaunchSupportedChain,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { checkRateLimit, RATE_LIMIT_DEPLOY } from "@/lib/rate-limit";
import {
  AgentWalletError,
  getAgentOperationalKeypair,
  getAgentOperationalWalletAddress,
  signAndBroadcastBagsTransactions,
} from "@/lib/agent-wallets";
import {
  continueMetaplexCollectionDeploy,
  deployMetaplexCollection,
  METAPLEX_MINT_ENGINE,
  MetaplexMintError,
} from "@/lib/metaplex-core-candy-machine";
import {
  ensureMetaplexAgentRegistration,
  getAgentMetaplexSummary,
  MetaplexAgentRegistryError,
} from "@/lib/metaplex-agent-registry";

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
    let metaplex = await getAgentMetaplexSummary(agent.id);
    if (!metaplex?.delegated) {
      try {
        metaplex = await ensureMetaplexAgentRegistration(agent.id);
      } catch (error) {
        if (error instanceof MetaplexAgentRegistryError) {
          console.warn("Metaplex agent registration warning:", error.message);
        } else {
          console.warn("Metaplex agent registration warning:", error);
        }
      }
    }
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
      const automaticBags = resolveAutomaticBagsInput(body?.bags, {
        collectionName: typeof body?.name === "string" ? body.name : "",
        collectionSymbol: typeof body?.symbol === "string" ? body.symbol : "",
      });
      const normalizedBody = {
        ...body,
        chain: getCanonicalSolanaChain(),
        authority_address: agentAuthority,
        bags: automaticBags
          ? {
              ...automaticBags,
              creator_wallet: agentAuthority,
            }
          : undefined,
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
        const bagsRecord = prepareCollectionBagsRecord({
          input: data.bags,
          chain: assets.chain,
          authorityAddress: assets.authorityAddress,
          payoutAddress: data.payout_address,
          collectionName: data.name,
          collectionSymbol: data.symbol,
        });

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
          bagsMintAccess: collection.bagsMintAccess as "public" | "bags_balance",
          bagsTokenAddress: collection.bagsTokenAddress,
          bagsMinTokenBalance: collection.bagsMinTokenBalance,
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
      const configProgress = await continueMetaplexCollectionDeploy(signer, {
        candyMachineAddress: collection.mintAddress,
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
        candyMachineAddress: collection.mintAddress!,
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

    const warnings: string[] = [];
    if (!metaplex?.delegated) {
      warnings.push("Metaplex agent identity is not fully delegated yet. Retry /api/v1/agents/metaplex after funding settles.");
    }
    let bagsCollection = collection;
    let bags = buildCollectionBagsView(collection);
    const bagsLaunchSupported = isBagsLaunchSupportedChain(collection.chain);
    if (deployment.isFullyLoaded && bags && bags.status !== "DISABLED" && !bags.token_address && bagsLaunchSupported) {
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
    } else if (bags && bags.status !== "DISABLED" && !bags.token_address && !bagsLaunchSupported) {
      warnings.push("Bags launch is only supported on Solana mainnet-beta right now.");
    }

    return NextResponse.json({
      success: true,
      collection: {
        id: bagsCollection.id,
        chain: bagsCollection.chain,
        address: bagsCollection.address,
        collection_url: `${appUrl}/collection/${bagsCollection.address}`,
        name: bagsCollection.name,
        symbol: bagsCollection.symbol,
        max_supply: bagsCollection.maxSupply,
        mint_price_native: formatCollectionMintPrice(bagsCollection.mintPrice, bagsCollection.chain),
        mint_price_raw: bagsCollection.mintPrice,
        native_token: getCollectionNativeToken(bagsCollection.chain),
        image_url: bagsCollection.imageUrl,
        base_uri: bagsCollection.baseUri,
        status: bagsCollection.status,
        bags,
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
        resume_collection_id: deployment.isFullyLoaded ? null : bagsCollection.id,
        resume_hint: deployment.isFullyLoaded
          ? null
          : "Retry POST /api/v1/collections with the same bearer token and collection_id to continue config loading.",
        user_signature_required: false,
        confirm_endpoint: null,
      },
      bags_community: bags
        ? {
            status: bags.status,
            launch_supported: bags.token_address ? true : bagsLaunchSupported,
            unsupported_reason:
              !bags.token_address && !bagsLaunchSupported
                ? "Bags launch is only supported on Solana mainnet-beta right now."
                : null,
            launch_required: !bags.token_address && bagsLaunchSupported,
            prepare_endpoint:
              !bags.token_address && bagsLaunchSupported ? "/api/v1/collections/bags" : null,
            confirm_endpoint:
              !bags.token_address && bagsLaunchSupported ? "/api/v1/collections/bags/confirm" : null,
          }
        : null,
      agent_metaplex: metaplex,
      warnings: warnings.length > 0 ? warnings : undefined,
      message:
        !deployment.isFullyLoaded
          ? "Collection deployment started. Retry the same deploy with collection_id to continue loading Candy Machine config lines."
          : warnings.length > 0
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
