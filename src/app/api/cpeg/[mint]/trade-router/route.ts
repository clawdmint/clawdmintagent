import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      tokenMint: true,
      collectionAddress: true,
      cluster: true,
      status: true,
      rendererId: true,
      rendererVersion: true,
      standardMode: true,
    },
  });

  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }
  if (!launch.collectionAddress && launch.standardMode !== "metaplex_hybrid") {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const isMainnet = launch.cluster === "mainnet-beta" || launch.cluster === "mainnet";
  if (launch.standardMode === "metaplex_hybrid") {
    return NextResponse.json({
      success: true,
      standard: "cPEG Metaplex Agent Hybrid",
      token_mint: launch.tokenMint,
      collection_address: launch.collectionAddress,
      cluster: launch.cluster,
      router: {
        custody_model: "metaplex_hybrid_escrow_pda",
        guarantees: [
          "Agent PEG capture and release use MPL-Hybrid.",
          "Exact Agent PEG market trades transfer Metaplex Core assets.",
          "No custom cPEG program upgrade, deploy, or record_trade_art PDA is required on the Hybrid path.",
        ],
        modes: {
          capture: { enabled: true, prepare: `/api/cpeg/${launch.tokenMint}/hybrid/capture/prepare` },
          release: { enabled: true, prepare: `/api/cpeg/${launch.tokenMint}/hybrid/release/prepare` },
          market_identity_buy: { enabled: true, prepare: `/api/cpeg/${launch.tokenMint}/market/buy/prepare` },
        },
      },
      renderer: {
        id: launch.rendererId,
        version: launch.rendererVersion,
      },
    });
  }

  return NextResponse.json({
    success: true,
    standard: "cPEG Standard v0.1",
    token_mint: launch.tokenMint,
    collection_address: launch.collectionAddress,
    cluster: launch.cluster,
    router: {
      canonical_prepare: `/api/cpeg/${launch.tokenMint}/trade-router/prepare`,
      transfer_hook_mode: "strict_owner_peg_sync",
      guarantees: [
        "Token-2022 ownership is enforced by the cPEG transfer hook.",
        "Every routed identity transfer syncs OwnerPeg capacity during the hook execution.",
        "Transfers that would detach a PEG identity from its fixed backing unit are rejected by the hook.",
        "Official identity-market fills invoke record_trade_art from on-chain sale data.",
      ],
      modes: {
        market_identity_buy: {
          enabled: true,
          prepare: `/api/cpeg/${launch.tokenMint}/trade-router/prepare`,
          requires: ["buyer", "peg_ids"],
          effect: "Buys listed cPEG identities from escrow and moves the matching token units.",
        },
        amm_jupiter: {
          enabled: isMainnet,
          prepare: `/api/cpeg/${launch.tokenMint}/trade-router/prepare`,
          requires: ["buyer", "sol_amount", "slippage_bps"],
          effect: "Optional mainnet routed swap surface. Identity guarantees depend on the cPEG route.",
        },
        identity_sell: {
          enabled: true,
          prepare: `/api/cpeg/${launch.tokenMint}/trade-router/prepare`,
          requires: ["seller", "peg_id", "slippage_bps"],
          effect:
            "Escrows the selected identity and creates a route-aware market listing so token and PEG remain paired.",
        },
        market_floor_sweep: {
          enabled: true,
          prepare: `/api/cpeg/${launch.tokenMint}/trade-router/prepare`,
          requires: ["buyer", "peg_ids"],
          deprecated_by: "market_identity_buy",
        },
      },
    },
    renderer: {
      id: launch.rendererId,
      version: launch.rendererVersion,
    },
  });
}
