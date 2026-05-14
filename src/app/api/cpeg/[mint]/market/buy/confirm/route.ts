import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { CPEG_HYBRID_ASSET_STATUS_OWNED } from "@/lib/cpeg-hybrid-engine";
import { loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { prisma } from "@/lib/db";
import { fetchMarketplaceCoreAssetOwner } from "@/lib/marketplace-transactions";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  signature: z.string().min(32),
  buyer: z.string().min(32),
  peg_id: z.number().int().min(0),
  trade_index: z.union([z.string(), z.number()]).optional(),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const parsed = ConfirmSchema.safeParse(await request.json());
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
  if (!data) {
    return NextResponse.json({ success: false, error: "Hybrid cPEG launch not found" }, { status: 404 });
  }

  const listing = await prisma.clawPegMarketListing.findFirst({
    where: { tokenMint: launch.tokenMint, pegId: parsed.data.peg_id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!listing) {
    // Idempotency: if a previous confirm already settled this peg, surface
    // the existing FILLED row instead of returning 404 so the client can
    // still render the success state on retry.
    const filled = await prisma.clawPegMarketListing.findFirst({
      where: {
        tokenMint: launch.tokenMint,
        pegId: parsed.data.peg_id,
        status: "FILLED",
        buyerAddress: parsed.data.buyer,
      },
      orderBy: { soldAt: "desc" },
    });
    if (filled) {
      return NextResponse.json({
        success: true,
        already_processed: true,
        listing: { id: filled.id },
        core_transfer_signature: filled.buyTxHash || parsed.data.signature,
        trade_art: {
          peg_id: parsed.data.peg_id,
          address: filled.listingAddress,
          image_url: `/api/cpeg/${launch.tokenMint}/pegs/${parsed.data.peg_id}/svg`,
          kind: "hybrid_core_transfer",
        },
      });
    }
    return NextResponse.json({ success: false, error: "Listing not active" }, { status: 404 });
  }

  // mpl-core ownership reads can lag a few seconds behind a freshly-confirmed
  // transfer. Poll briefly before declaring the buy unfinished so we do not
  // leave the DB out of sync after a successful broadcast.
  let ownerAddress: string | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    ownerAddress = await fetchMarketplaceCoreAssetOwner(listing.listingAddress).catch(() => null);
    if (ownerAddress === parsed.data.buyer) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (ownerAddress !== parsed.data.buyer) {
    return NextResponse.json(
      {
        success: false,
        error: "Purchase transaction has not transferred the Core cPEG to the buyer yet",
        details: { on_chain_owner: ownerAddress, expected_owner: parsed.data.buyer },
      },
      { status: 409 }
    );
  }

  const rows = await prisma.$transaction(async (tx) => {
    await tx.clawPegHybridAsset.update({
      where: { assetAddress: listing.listingAddress },
      data: {
        ownerAddress: parsed.data.buyer,
        status: CPEG_HYBRID_ASSET_STATUS_OWNED,
        captureTxHash: parsed.data.signature,
        capturedAt: new Date(),
      },
    });
    return tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "ClawPegMarketListing"
      SET "status" = ${"FILLED"},
        "buyerAddress" = ${parsed.data.buyer},
        "buyTxHash" = ${parsed.data.signature},
        "soldAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${listing.id}
        AND "status" = ${"ACTIVE"}
      RETURNING "id"
    `;
  });

  return NextResponse.json({
    success: true,
    listing: rows[0] || null,
    core_transfer_signature: parsed.data.signature,
    trade_art: {
      peg_id: parsed.data.peg_id,
      address: listing.listingAddress,
      image_url: `/api/cpeg/${launch.tokenMint}/pegs/${parsed.data.peg_id}/svg`,
      kind: "hybrid_core_transfer",
    },
  });
}
