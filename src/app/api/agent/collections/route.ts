import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyHmacAuth } from "@/lib/auth";
import { FACTORY_ABI, FACTORY_ADDRESS_GETTER, getChain } from "@/lib/contracts";
import {
  DeployCollectionSchema,
  prepareCollectionAssets,
} from "@/lib/collection-deploy";
import {
  formatCollectionMintPrice,
  getCollectionNativeToken,
  isEvmCollectionChain,
} from "@/lib/collection-chains";
import { buildSolanaDeploymentManifest } from "@/lib/solana-collections";
import { encodeFunctionData } from "viem";

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
        status: "PENDING_SIGNATURE",
        address: `pending_${Date.now()}`,
        deployTxHash: "pending",
      },
    });

    let deployment: Record<string, unknown>;

    if (isEvmCollectionChain(assets.chain)) {
      const calldata = encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: "deployCollection",
        args: [{
          name: data.name,
          symbol: data.symbol,
          baseURI: assets.baseUri,
          maxSupply: BigInt(data.max_supply),
          mintPrice: BigInt(assets.mintPriceRaw),
          payoutAddress: data.payout_address as `0x${string}`,
          royaltyBps: BigInt(data.royalty_bps),
        }],
      });

      deployment = {
        mode: "agent_sign",
        factory_address: FACTORY_ADDRESS_GETTER(),
        chain_id: getChain().id,
        chain_name: getChain().name,
        calldata,
        instructions: [
          "1. Sign and broadcast the factory deployCollection call",
          "2. Wait for Base confirmation",
          "3. Call POST /api/agent/collections/confirm with collection_id, deployed_address, and deploy_tx_hash",
        ],
      };
    } else {
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

      deployment = {
        mode: "agent_sign",
        program_id: manifest.program_id,
        cluster: manifest.cluster,
        authority: manifest.authority,
        predicted_collection_address: manifest.collection_address,
        instructions: manifest.instructions,
        instructions_text: [
          "1. Build a Solana transaction from the returned instruction list",
          "2. Sign with authority_address on the configured Solana cluster",
          "3. Call POST /api/agent/collections/confirm with collection_id, deployed_address, and deploy_tx_hash",
        ],
      };
    }

    return NextResponse.json({
      success: true,
      collection: {
        id: collection.id,
        chain: collection.chain,
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
    });
  } catch (error) {
    console.error("Collection deployment error:", error);
    return NextResponse.json({ error: "Deployment failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyHmacAuth(request, "");
    if (!auth.success) {
      return NextResponse.json({ error: auth.error || "Authentication failed" }, { status: 401 });
    }

    const collections = await prisma.collection.findMany({
      where: { agentId: auth.agentId },
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
        deployed_at: c.deployedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Get collections error:", error);
    return NextResponse.json({ error: "Failed to get collections" }, { status: 500 });
  }
}
