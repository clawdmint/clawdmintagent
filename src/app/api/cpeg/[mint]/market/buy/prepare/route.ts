import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { z } from "zod";
import { splitClawPegMarketPayment } from "@/lib/clawpeg";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { fetchHybridCoreAssetOwner } from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";
import { buildMarketplaceFillTransaction } from "@/lib/marketplace-transactions";

async function simulatePreparedHybridBuy(
  serializedTransactionBase64: string,
  rpcUrl: string
): Promise<{ ok: true } | { ok: false; message: string; logs: string[] }> {
  try {
    const tx = Transaction.from(Buffer.from(serializedTransactionBase64, "base64"));
    const conn = new Connection(rpcUrl, { commitment: "confirmed" });
    const sim = await conn.simulateTransaction(tx, undefined, true);
    if (sim.value.err) {
      const errStr = typeof sim.value.err === "string" ? sim.value.err : JSON.stringify(sim.value.err);
      return { ok: false, message: errStr, logs: sim.value.logs || [] };
    }
    return { ok: true };
  } catch (simError) {
    const message = simError instanceof Error ? simError.message : String(simError);
    return { ok: false, message, logs: [] };
  }
}

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  buyer: z.string().min(32),
  peg_id: z.number().int().min(0),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const parsed = PrepareSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const launch = await prisma.clawPegLaunch.findUnique({ where: { tokenMint: params.mint } });
    if (!launch) {
      return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
    }
    if (launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      return NextResponse.json(
        { success: false, error: "Legacy custom cPEG market buys are disabled. This market only supports Metaplex Hybrid cPEGs." },
        { status: 410 }
      );
    }

    const data = await loadHybridLaunchAndAgent(params.mint);
    if (!data?.launch.hybridCoreCollectionAddress) {
      return NextResponse.json({ success: false, error: "Hybrid cPEG launch is not configured" }, { status: 409 });
    }

    const listing = await prisma.clawPegMarketListing.findFirst({
      where: { tokenMint: launch.tokenMint, pegId: parsed.data.peg_id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!listing) {
      return NextResponse.json({ success: false, error: "Listing not active" }, { status: 404 });
    }

    const buyer = new PublicKey(parsed.data.buyer);
    const seller = new PublicKey(listing.sellerAddress);
    const creator = new PublicKey(launch.creatorAddress);
    const feeVault = new PublicKey(launch.feeVaultAddress);
    const breakdown = splitClawPegMarketPayment(
      BigInt(listing.priceLamports),
      listing.royaltyBps,
      listing.marketplaceFeeBps
    );

    const asset = await prisma.clawPegHybridAsset.findUnique({
      where: { assetAddress: listing.listingAddress },
    });
    if (!asset || asset.ownerAddress !== listing.sellerAddress) {
      await prisma.clawPegMarketListing.updateMany({
        where: { id: listing.id, status: "ACTIVE" },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      return NextResponse.json(
        { success: false, error: "Listing owner no longer matches cPEG state. Refresh the market." },
        { status: 409 }
      );
    }

    const onChainOwner = await fetchHybridCoreAssetOwner(listing.listingAddress);
    if (onChainOwner !== listing.sellerAddress) {
      await prisma.clawPegMarketListing.updateMany({
        where: { id: listing.id, status: "ACTIVE" },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      await prisma.clawPegHybridAsset
        .update({
          where: { assetAddress: listing.listingAddress },
          data: { ownerAddress: onChainOwner },
        })
        .catch(() => null);
      return NextResponse.json(
        { success: false, error: "This listing is no longer owned by the seller. Refresh the market." },
        { status: 409 }
      );
    }

    let prepared: Awaited<ReturnType<typeof buildMarketplaceFillTransaction>>;
    try {
      prepared = await buildMarketplaceFillTransaction({
        buyerAddress: buyer.toBase58(),
        sellerAddress: seller.toBase58(),
        assetAddress: listing.listingAddress,
        collectionAddress: data.launch.hybridCoreCollectionAddress,
        priceLamports: listing.priceLamports,
        creatorAddress: creator.toBase58(),
        protocolFeeAddress: feeVault.toBase58(),
        sellerProceedsLamports: breakdown.sellerProceedsLamports,
        creatorRoyaltyLamports: breakdown.creatorRoyaltyLamports,
        protocolFeeLamports: breakdown.protocolFeeLamports,
      });
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : String(buildError);
      if (/transferdelegate|transfer delegate|no longer owned/i.test(message)) {
        await prisma.clawPegMarketListing.updateMany({
          where: { id: listing.id, status: "ACTIVE" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "This cPEG listing is no longer valid (transfer delegate missing or asset moved). The seller needs to re-list it. Refresh the market.",
            details: { reason: message },
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: `Failed to prepare cPEG buy: ${message}` }, { status: 500 });
    }

    const sim = await simulatePreparedHybridBuy(prepared.serializedTransactionBase64, getClawPegRpcUrl());
    if (!sim.ok) {
      const lowered = sim.message.toLowerCase();
      const driftHints = [
        "transferdelegate",
        "transfer delegate",
        "invalidauthority",
        "missing signature",
        "uninitialized",
        "account not found",
      ];
      if (driftHints.some((hint) => lowered.includes(hint))) {
        await prisma.clawPegMarketListing.updateMany({
          where: { id: listing.id, status: "ACTIVE" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "This cPEG listing is stale on-chain (transfer delegate revoked or asset moved). It was cancelled in our index; ask the seller to re-list.",
            details: { reason: sim.message, logs: sim.logs.slice(-6) },
          },
          { status: 409 }
        );
      }
      const interesting = sim.logs
        .filter((line) =>
          /Program log: Error|custom program error|Invalid|insufficient|owner|authority|mint|account|failed/i.test(line)
        )
        .slice(-3)
        .map((line) => line.replace("Program log: ", ""))
        .join(" | ");
      return NextResponse.json(
        {
          success: false,
          error: `Buy transaction would fail on-chain: ${sim.message}${interesting ? ` (${interesting})` : ""}`,
          details: { logs: sim.logs.slice(-12) },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        kind: "hybrid_core",
        peg_id: listing.pegId,
        seller: listing.sellerAddress,
        price_lamports: listing.priceLamports,
        seller_proceeds_lamports: breakdown.sellerProceedsLamports,
        creator_royalty_lamports: breakdown.creatorRoyaltyLamports,
        protocol_fee_lamports: breakdown.protocolFeeLamports,
        asset_address: listing.listingAddress,
        serialized_transaction_base64: prepared.serializedTransactionBase64,
        delegate_address: prepared.delegateAddress,
      },
      trade_art: {
        peg_id: listing.pegId,
        address: listing.listingAddress,
        image_url: `/api/cpeg/${launch.tokenMint}/pegs/${listing.pegId}/svg`,
        kind: "hybrid_core_transfer",
      },
      instructions: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cPEG purchase";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
