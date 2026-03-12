import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyHmacAuth } from "@/lib/auth";
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
  formatCollectionMintPrice,
  getCollectionNativeToken,
  SOLANA_COLLECTION_CHAINS,
} from "@/lib/collection-chains";
import { buildSolanaDeploymentManifest } from "@/lib/solana-collections";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const auth = await verifyHmacAuth(request, bodyText);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error || "Authentication failed" }, { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validation = DeployCollectionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const agent = await prisma.agent.findUnique({
      where: { id: auth.agentId },
    });

    if (!agent || agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json({ error: "Agent not authorized to deploy" }, { status: 403 });
    }

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

    const deployment: Record<string, unknown> = {
      mode: "agent_sign",
      program_id: manifest.program_id,
      cluster: manifest.cluster,
      authority: manifest.authority,
      predicted_collection_address: manifest.collection_address,
      instructions: manifest.instructions,
      confirm_endpoint: "/api/agent/collections/confirm",
      instructions_text: [
        "1. Build a Solana transaction from the returned instruction list",
        "2. Sign with authority_address on the configured Solana cluster",
        "3. Call POST /api/agent/collections/confirm with collection_id, deployed_address, and deploy_tx_hash",
      ],
    };

    return NextResponse.json({
      success: true,
      collection: {
        id: collection.id,
        chain: collection.chain,
        address: manifest.collection_address,
        name: collection.name,
        symbol: collection.symbol,
        max_supply: collection.maxSupply,
        mint_price: assets.mintPriceInput,
        mint_price_native: assets.mintPriceInput,
        mint_price_raw: assets.mintPriceRaw,
        native_token: assets.nativeToken,
        image_url: assets.imageHttpUrl,
        base_uri: assets.baseUri,
        status: collection.status,
        bags,
      },
      deployment,
      metadata: {
        base_uri: assets.baseUri,
        folder_cid: assets.folderCid,
        collection_json: `${assets.baseUri}collection.json`,
        token_metadata_example: `${assets.baseUri}1.json`,
        image: assets.imageHttpUrl,
        total_tokens: data.max_supply,
      },
      bags_community: bags
        ? {
            status: bags.status,
            launch_required: !bags.token_address,
            prepare_endpoint: !bags.token_address ? "/api/agent/collections/bags" : null,
            confirm_endpoint: !bags.token_address ? "/api/agent/collections/bags/confirm" : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Collection deployment error:", error);
    return NextResponse.json(
      {
        error: "Deployment failed",
        details: getUploadErrorMessage(error, "Unknown deployment error"),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyHmacAuth(request, "");
    if (!auth.success) {
      return NextResponse.json({ error: auth.error || "Authentication failed" }, { status: 401 });
    }

    const collections = await prisma.collection.findMany({
      where: {
        agentId: auth.agentId,
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
        deployed_at: c.deployedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Get collections error:", error);
    return NextResponse.json({ error: "Failed to get collections" }, { status: 500 });
  }
}
