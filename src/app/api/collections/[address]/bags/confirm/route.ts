import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMIT_GENERAL } from "@/lib/rate-limit";
import {
  CollectionBagsLaunchError,
  confirmCollectionBagsLaunch,
} from "@/lib/collection-bags-launch";
import { verifyCollectionOwnerAuth } from "@/lib/collection-owner-auth-server";

export const dynamic = "force-dynamic";

const ConfirmOwnerBagsSchema = z.object({
  wallet: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.number().int(),
  launch_tx_hash: z.string().min(1),
  token_address: z.string().min(1).optional(),
  config_key: z.string().min(1).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`collection-bags-confirm:${clientIp}`, RATE_LIMIT_GENERAL);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many Bags confirmations. Please retry shortly." },
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
    const validation = ConfirmOwnerBagsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.errors },
        { status: 400 }
      );
    }

    const isAuthorized = verifyCollectionOwnerAuth({
      action: "confirm_bags",
      collectionAddress: collection.address,
      expectedWallet: collection.bagsCreatorWallet,
      wallet: validation.data.wallet,
      timestamp: validation.data.timestamp,
      signature: validation.data.signature,
      launchTxHash: validation.data.launch_tx_hash,
    });

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Owner signature verification failed" },
        { status: 403 }
      );
    }

    const confirmed = await confirmCollectionBagsLaunch(collection.agentId, {
      collection_id: collection.id,
      launch_tx_hash: validation.data.launch_tx_hash,
      token_address: validation.data.token_address,
      config_key: validation.data.config_key,
    });

    return NextResponse.json({
      success: true,
      collection: {
        id: confirmed.collection.id,
        chain: confirmed.collection.chain,
        address: confirmed.collection.address,
        bags: confirmed.bags,
      },
    });
  } catch (error) {
    if (error instanceof CollectionBagsLaunchError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.status }
      );
    }

    console.error("Owner confirm Bags community error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to confirm Bags owner launch" },
      { status: 500 }
    );
  }
}
