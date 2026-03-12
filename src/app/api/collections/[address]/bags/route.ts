import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMIT_GENERAL } from "@/lib/rate-limit";
import {
  CollectionBagsLaunchError,
  prepareCollectionBagsLaunch,
} from "@/lib/collection-bags-launch";
import { verifyCollectionOwnerAuth } from "@/lib/collection-owner-auth-server";

export const dynamic = "force-dynamic";

const PrepareOwnerBagsSchema = z.object({
  wallet: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.number().int(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`collection-bags-prepare:${clientIp}`, RATE_LIMIT_GENERAL);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many Bags launch attempts. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds || 60) } }
      );
    }

    const { address } = await params;
    const collection = await prisma.collection.findFirst({
      where: {
        OR: [{ address }, { address: address.toLowerCase() }],
      },
      select: {
        id: true,
        agentId: true,
        address: true,
        chain: true,
        bagsCreatorWallet: true,
      },
    });

    if (!collection) {
      return NextResponse.json({ success: false, error: "Collection not found" }, { status: 404 });
    }

    if (!collection.bagsCreatorWallet) {
      return NextResponse.json(
        { success: false, error: "This collection has no Bags owner wallet configured" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = PrepareOwnerBagsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const isAuthorized = verifyCollectionOwnerAuth({
      action: "prepare_bags",
      collectionAddress: collection.address,
      expectedWallet: collection.bagsCreatorWallet,
      wallet: validation.data.wallet,
      timestamp: validation.data.timestamp,
      signature: validation.data.signature,
    });

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Owner signature verification failed" },
        { status: 403 }
      );
    }

    const prepared = await prepareCollectionBagsLaunch(collection.agentId, {
      collection_id: collection.id,
    });

    return NextResponse.json({
      success: true,
      collection: {
        id: prepared.collection.id,
        chain: prepared.collection.chain,
        address: prepared.collection.address,
        bags: prepared.bags,
      },
      bags_launch: {
        token_info: {
          token_mint: prepared.token_info.tokenMint,
          token_metadata: prepared.token_info.tokenMetadata || null,
          token_launch: prepared.token_info.tokenLaunch || null,
          ipfs: prepared.token_info.ipfs || null,
          metadata_uri: prepared.token_info.metadataUri || null,
        },
        fee_config: prepared.fee_config,
        launch: prepared.launch,
        confirm_endpoint: `/api/collections/${prepared.collection.address}/bags/confirm`,
      },
    });
  } catch (error) {
    if (error instanceof CollectionBagsLaunchError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Owner prepare Bags community error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to prepare Bags owner launch" },
      { status: 500 }
    );
  }
}
