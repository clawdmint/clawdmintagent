import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  buildHybridStateSummary,
  getMplHybridCustodyTarget,
} from "@/lib/cpeg-hybrid-engine";
import {
  loadHybridLaunchAndAgent,
  loadHybridAssetCounts,
} from "@/lib/cpeg-hybrid-loader";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { mint: string };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const wallet = (request.nextUrl.searchParams.get("wallet") || "").trim();
  const data = await loadHybridLaunchAndAgent(params.mint);
  if (!data) {
    return NextResponse.json({ success: false, error: "cPEG hybrid launch not found" }, { status: 404 });
  }
  const counts = await loadHybridAssetCounts(data.launch.id);
  const summary = await buildHybridStateSummary(data.agent, data.launch, counts);
  const custody = getMplHybridCustodyTarget(data.launch, summary.tokenProgramId);
  const custodyWarning =
    data.launch.cluster === "mainnet-beta" && !custody.isNativeReady
      ? "Mainnet capture, release, and market settlement require Metaplex Hybrid escrow custody before user funds can move."
      : null;
  if (summary.pegUnitRaw !== data.launch.pegUnitRaw) {
    await prisma.clawPegLaunch
      .update({
        where: { id: data.launch.id },
        data: { pegUnitRaw: summary.pegUnitRaw, hybridSwapAmountRaw: summary.pegUnitRaw },
      })
      .catch(() => null);
  }
  let walletAssets: Array<{
    asset_address: string;
    peg_id: number;
    status: string;
    captured_at: string | null;
  }> = [];
  if (wallet) {
    const rows = await prisma.clawPegHybridAsset.findMany({
      where: { launchId: data.launch.id, ownerAddress: wallet, status: CPEG_HYBRID_ASSET_STATUS_OWNED },
      orderBy: { capturedAt: "desc" },
      take: 60,
      select: {
        assetAddress: true,
        pegId: true,
        status: true,
        capturedAt: true,
      },
    });
    walletAssets = rows.map((row) => ({
      asset_address: row.assetAddress,
      peg_id: row.pegId,
      status: row.status,
      captured_at: row.capturedAt?.toISOString() || null,
    }));
  }
  return NextResponse.json({
    success: true,
    launch: {
      id: data.launch.id,
      token_mint: data.launch.tokenMint,
      symbol: data.launch.symbol,
      name: data.launch.name,
      cluster: data.launch.cluster,
      standard_mode: data.launch.standardMode,
      custody_model: custody.isNativeReady ? "metaplex_hybrid_escrow_pda" : "compatibility_agent_vault",
      target_custody_model: "metaplex_hybrid_escrow_pda",
      hybrid_status: summary.status,
      collection_address: summary.collectionAddress,
      mpl_hybrid_escrow_address: custody.escrowAddress,
      mpl_hybrid_escrow_token_account: custody.escrowTokenAccount,
      mpl_hybrid_native_ready: custody.isNativeReady,
      custody_warning: custodyWarning,
      vault_token_account: summary.vaultTokenAccount,
      vault_owner: summary.vaultOwner,
      token_program_id: summary.tokenProgramId,
      total_assets: summary.totalAssets,
      owned_assets: summary.ownedAssets,
      pool_assets: summary.poolAssets,
      vault_token_balance_raw: summary.vaultTokenBalanceRaw,
      vault_token_balance_whole: summary.vaultTokenBalanceWhole,
      token_supply_raw: summary.tokenSupplyRaw,
      decimals: summary.decimals,
      max_pegs: data.launch.maxPegs,
      effective_max_pegs: summary.effectiveMaxPegs,
      available_capacity: summary.availableCapacity,
      burned_capacity: summary.burnedCapacity,
      peg_unit_raw: summary.pegUnitRaw,
    },
    wallet_assets: walletAssets,
  });
}
