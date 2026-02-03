import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyHmacAuth } from "@/lib/auth";
import { uploadImage, uploadJson, ipfsToHttp, CollectionMetadata, NFTMetadata } from "@/lib/ipfs";
import { parseEther, FACTORY_ADDRESS, publicClient, FACTORY_ABI, chain } from "@/lib/contracts";
import { encodeFunctionData, parseAbi } from "viem";

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const DeployCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, "Symbol must be uppercase alphanumeric"),
  description: z.string().max(1000).optional(),
  image: z.string(), // data URL, https URL, or ipfs:// URL
  max_supply: z.number().int().min(1).max(100000),
  mint_price_eth: z.string().regex(/^\d+\.?\d*$/, "Invalid ETH amount"),
  payout_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  royalty_bps: z.number().int().min(0).max(1000).default(500), // Max 10%
  metadata: z.object({
    external_url: z.string().url().optional(),
    attributes: z.array(z.object({
      trait_type: z.string(),
      value: z.union([z.string(), z.number()]),
    })).optional(),
  }).optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/agent/collections
// Deploy a new NFT collection
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC verification
    const bodyText = await request.text();
    
    // Verify agent authentication
    const auth = await verifyHmacAuth(request, bodyText);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || "Authentication failed" },
        { status: 401 }
      );
    }

    // Parse body
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Validate input
    const validation = DeployCollectionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Get agent
    const agent = await prisma.agent.findUnique({
      where: { id: auth.agentId },
    });

    if (!agent || agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json(
        { error: "Agent not authorized to deploy" },
        { status: 403 }
      );
    }

    // Step 1: Upload collection image to IPFS
    console.log("Uploading collection image...");
    const imageUpload = await uploadImage(data.image, `${data.symbol}-cover`);
    if (!imageUpload.success) {
      return NextResponse.json(
        { error: `Image upload failed: ${imageUpload.error}` },
        { status: 500 }
      );
    }
    const imageUrl = `ipfs://${imageUpload.cid}`;

    // Step 2: Create and upload metadata
    console.log("Creating metadata...");
    
    // Collection metadata
    const collectionMeta: CollectionMetadata = {
      name: data.name,
      description: data.description || `${data.name} - Deployed by ${agent.name} on Clawdmint`,
      image: imageUrl,
      external_link: data.metadata?.external_url,
      seller_fee_basis_points: data.royalty_bps,
      fee_recipient: data.payout_address,
    };

    // Token metadata (for reveal - simplified version)
    // In production, you'd generate unique metadata per token
    const tokenMeta: NFTMetadata = {
      name: `${data.name} #TOKEN_ID`,
      description: collectionMeta.description,
      image: imageUrl,
      attributes: data.metadata?.attributes || [],
      external_url: data.metadata?.external_url,
    };

    // Upload collection.json
    const collectionJsonUpload = await uploadJson(collectionMeta, `${data.symbol}-collection`);
    if (!collectionJsonUpload.success) {
      return NextResponse.json(
        { error: `Metadata upload failed: ${collectionJsonUpload.error}` },
        { status: 500 }
      );
    }

    // For simplicity, use a placeholder base URI
    // In production, you'd upload a folder with all token JSONs
    const baseUri = `ipfs://${collectionJsonUpload.cid}/`;

    // Step 3: Prepare deployment transaction data
    // Note: The actual on-chain deployment is done by the agent's wallet
    // This API prepares the transaction and stores the intent
    
    const mintPriceWei = parseEther(data.mint_price_eth);

    // Create collection record in pending state
    const collection = await prisma.collection.create({
      data: {
        agentId: agent.id,
        agentEoa: agent.eoa,
        name: data.name,
        symbol: data.symbol,
        description: data.description,
        imageUrl: ipfsToHttp(imageUrl),
        baseUri,
        maxSupply: data.max_supply,
        mintPrice: mintPriceWei.toString(),
        royaltyBps: data.royalty_bps,
        payoutAddress: data.payout_address,
        status: "DEPLOYING",
        address: "pending", // Will be updated after deployment
        deployTxHash: "pending",
      },
    });

    // Prepare the deployment calldata for the agent to sign
    const deployParams = {
      name: data.name,
      symbol: data.symbol,
      baseURI: baseUri,
      maxSupply: BigInt(data.max_supply),
      mintPrice: mintPriceWei,
      payoutAddress: data.payout_address as `0x${string}`,
      royaltyBps: BigInt(data.royalty_bps),
    };

    const deployCalldata = encodeFunctionData({
      abi: FACTORY_ABI,
      functionName: "deployCollection",
      args: [deployParams],
    });

    return NextResponse.json({
      success: true,
      collection: {
        id: collection.id,
        name: collection.name,
        symbol: collection.symbol,
        max_supply: collection.maxSupply,
        mint_price_eth: data.mint_price_eth,
        mint_price_wei: mintPriceWei.toString(),
        image_url: ipfsToHttp(imageUrl),
        base_uri: baseUri,
        status: collection.status,
      },
      deployment: {
        factory_address: FACTORY_ADDRESS,
        chain_id: chain.id,
        chain_name: chain.name,
        calldata: deployCalldata,
        instructions: [
          "1. The agent wallet must sign and broadcast this transaction",
          "2. Call the factory's deployCollection function with the provided calldata",
          "3. Once confirmed, call POST /api/agent/collections/confirm with the tx hash",
        ],
      },
      metadata: {
        collection_json: ipfsToHttp(`ipfs://${collectionJsonUpload.cid}`),
        image: ipfsToHttp(imageUrl),
      },
    });
  } catch (error) {
    console.error("Collection deployment error:", error);
    return NextResponse.json(
      { error: "Deployment failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/agent/collections
// Get agent's collections
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Get raw body for HMAC verification (empty for GET)
    const auth = await verifyHmacAuth(request, "");
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || "Authentication failed" },
        { status: 401 }
      );
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
        name: c.name,
        symbol: c.symbol,
        max_supply: c.maxSupply,
        total_minted: c.totalMinted,
        mint_price_wei: c.mintPrice,
        status: c.status,
        created_at: c.createdAt.toISOString(),
        deployed_at: c.deployedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Get collections error:", error);
    return NextResponse.json(
      { error: "Failed to get collections" },
      { status: 500 }
    );
  }
}
