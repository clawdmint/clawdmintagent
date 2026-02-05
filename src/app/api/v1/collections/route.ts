import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { uploadImage, uploadJson, ipfsToHttp } from "@/lib/ipfs";
import { parseEther } from "viem";
import { deployCollectionOnChain, getDeployerBalance } from "@/lib/contracts";
import { checkRateLimit, getClientIp, RATE_LIMIT_DEPLOY } from "@/lib/rate-limit";

// SECURITY: Hash API key for database lookup
function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

// Force dynamic rendering (prevents static generation errors on Netlify)
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const DeploySchema = z.object({
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, "Symbol must be uppercase alphanumeric"),
  description: z.string().max(1000).optional(),
  image: z.string(), // URL or data URI
  max_supply: z.number().int().min(1).max(100000),
  mint_price_eth: z.string().regex(/^\d+\.?\d*$/, "Invalid ETH amount"),
  payout_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  royalty_bps: z.number().int().min(0).max(1000).default(500),
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/v1/collections
// Deploy a new collection (requires auth)
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Get API key
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");

    // SECURITY: Find agent by hashed API key
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    if (agent.status !== "VERIFIED" || !agent.deployEnabled) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Agent not verified",
          hint: "Complete the claim process first"
        },
        { status: 403 }
      );
    }

    // SECURITY: Rate limit deployments (10 per hour per agent)
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
          headers: {
            "Retry-After": String(deployRateLimit.retryAfterSeconds || 60),
          }
        }
      );
    }

    // Parse body
    const body = await request.json();
    const validation = DeploySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    let imageUrl = data.image;
    let baseUri = "";

    // Try IPFS upload, fallback to direct URL in development
    const isPinataConfigured = process.env["PINATA_JWT"] && process.env["PINATA_JWT"].length > 100;
    
    if (isPinataConfigured) {
      // Upload image to IPFS
      console.log("Uploading image to IPFS...");
      const imageUpload = await uploadImage(data.image, `${data.symbol}-cover`);
      if (!imageUpload.success) {
        console.warn("IPFS upload failed, using direct URL:", imageUpload.error);
        // Fallback to direct URL
        imageUrl = data.image;
        baseUri = data.image;
      } else {
        imageUrl = `ipfs://${imageUpload.cid}`;

        // Upload metadata
        console.log("Uploading metadata to IPFS...");
        const metadata = {
          name: data.name,
          description: data.description || `${data.name} - Deployed by ${agent.name} on Clawdmint`,
          image: imageUrl,
          external_link: `https://clawdmint.xyz/agent/${agent.name}`,
          seller_fee_basis_points: data.royalty_bps,
          fee_recipient: data.payout_address,
        };

        const metadataUpload = await uploadJson(metadata, `${data.symbol}-metadata`);
        if (!metadataUpload.success) {
          console.warn("Metadata upload failed:", metadataUpload.error);
          baseUri = imageUrl;
        } else {
          baseUri = `ipfs://${metadataUpload.cid}/`;
        }
      }
    } else {
      // No IPFS - use direct URLs (dev mode)
      console.log("IPFS not configured, using direct URLs");
      imageUrl = data.image;
      baseUri = data.image;
    }
    const mintPriceWei = parseEther(data.mint_price_eth);

    // Helper to convert IPFS or keep HTTP URLs
    const toHttpUrl = (url: string) => url.startsWith("ipfs://") ? ipfsToHttp(url) : url;

    // Check deployer balance first
    const deployerBalance = await getDeployerBalance();
    console.log("[Deploy] Deployer balance:", deployerBalance, "ETH");
    
    if (parseFloat(deployerBalance) < 0.001) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Insufficient deployer balance",
          hint: "Platform deployer needs ETH for gas fees"
        },
        { status: 503 }
      );
    }

    // Create collection record (pending deployment)
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
        address: `pending_${Date.now()}`, // Placeholder until deployment
        deployTxHash: "pending",
      },
    });

    // Deploy on-chain!
    console.log("[Deploy] Starting on-chain deployment for collection:", collection.id);
    
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
      // Update collection status to failed
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

    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
    const explorerUrl = process.env["NEXT_PUBLIC_CHAIN_ID"] === "8453" 
      ? "https://basescan.org" 
      : "https://sepolia.basescan.org";

    return NextResponse.json({
      success: true,
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
      message: "Collection deployed on-chain successfully! 🦞",
    });
  } catch (error) {
    console.error("Deploy error:", error);
    return NextResponse.json(
      { success: false, error: "Deployment failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET /api/v1/collections
// List agent's collections (requires auth)
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Get API key
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "");

    // SECURITY: Find agent by hashed API key
    const agent = await prisma.agent.findFirst({
      where: { hmacKeyHash: hashApiKey(apiKey) },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
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
        name: c.name,
        symbol: c.symbol,
        max_supply: c.maxSupply,
        total_minted: c.totalMinted,
        mint_price_wei: c.mintPrice,
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
