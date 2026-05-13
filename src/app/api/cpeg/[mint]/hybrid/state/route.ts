import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_LISTED,
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  buildHybridStateSummary,
  getMplHybridCustodyTarget,
} from "@/lib/cpeg-hybrid-engine";
import {
  loadHybridLaunchAndAgent,
  loadHybridAssetCounts,
} from "@/lib/cpeg-hybrid-loader";
import { syncMetaplexHybridPoolAssets } from "@/lib/cpeg-hybrid-inventory";
import { describeCpegProtocolFees } from "@/lib/platform-fees";
import { MPL_HYBRID_PROTOCOL_SOL_FEE_LAMPORTS } from "@/lib/mpl-hybrid-native";

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
  let counts = await loadHybridAssetCounts(data.launch.id);
  let summary = await buildHybridStateSummary(data.agent, data.launch, counts);
  const custody = getMplHybridCustodyTarget(data.launch, summary.tokenProgramId);
  let poolSyncWarning: string | null = null;
  if (data.launch.cluster === "mainnet-beta" && custody.isNativeReady && custody.escrowAddress) {
    await syncMetaplexHybridPoolAssets({
      launchId: data.launch.id,
      tokenMint: data.launch.tokenMint,
      collectionAddress: data.launch.hybridCoreCollectionAddress,
      configuredEscrowAddress: custody.escrowAddress,
      hybridProgramId: data.launch.hybridProgramId,
      maxPegs: summary.effectiveMaxPegs,
    }).catch((error) => {
      poolSyncWarning = error instanceof Error ? error.message : "Metaplex pool sync failed";
    });
    counts = await loadHybridAssetCounts(data.launch.id);
    summary = await buildHybridStateSummary(data.agent, data.launch, counts);
  }
  const nativeEscrowReady =
    custody.isNativeReady &&
    summary.hybridEscrowAccountInitialized &&
    summary.vaultTokenAccountInitialized;
  const custodyWarning =
    data.launch.cluster === "mainnet-beta" && !nativeEscrowReady
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
    // Pull both OWNED and LISTED rows for the wallet. A LISTED row whose
    // matching ClawPegMarketListing is no longer ACTIVE is a stale state left
    // behind by a half-finished cancel/buy flow; self-heal it back to OWNED so
    // the user can list or release the cPEG again.
    const allRows = await prisma.clawPegHybridAsset.findMany({
      where: {
        launchId: data.launch.id,
        ownerAddress: wallet,
        status: { in: [CPEG_HYBRID_ASSET_STATUS_OWNED, CPEG_HYBRID_ASSET_STATUS_LISTED] },
      },
      orderBy: { capturedAt: "desc" },
      take: 80,
      select: {
        assetAddress: true,
        pegId: true,
        status: true,
        capturedAt: true,
      },
    });

    const candidatePegIds = allRows.map((row) => row.pegId);
    const activeListings = candidatePegIds.length
      ? await prisma.clawPegMarketListing.findMany({
          where: {
            launchId: data.launch.id,
            pegId: { in: candidatePegIds },
            status: "ACTIVE",
          },
          select: { pegId: true },
        })
      : [];
    const activeListedSet = new Set(activeListings.map((row) => row.pegId));

    const driftedPegIds = allRows
      .filter((row) => row.status === CPEG_HYBRID_ASSET_STATUS_LISTED && !activeListedSet.has(row.pegId))
      .map((row) => row.pegId);
    if (driftedPegIds.length > 0) {
      await prisma.clawPegHybridAsset
        .updateMany({
          where: {
            launchId: data.launch.id,
            ownerAddress: wallet,
            pegId: { in: driftedPegIds },
            status: CPEG_HYBRID_ASSET_STATUS_LISTED,
          },
          data: { status: CPEG_HYBRID_ASSET_STATUS_OWNED },
        })
        .catch(() => null);
    }

    walletAssets = allRows
      .filter((row) => !activeListedSet.has(row.pegId))
      .map((row) => ({
        asset_address: row.assetAddress,
        peg_id: row.pegId,
        status: CPEG_HYBRID_ASSET_STATUS_OWNED,
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
      custody_model: nativeEscrowReady ? "metaplex_hybrid_escrow_pda" : "compatibility_agent_vault",
      target_custody_model: "metaplex_hybrid_escrow_pda",
      hybrid_status: summary.status,
      collection_address: summary.collectionAddress,
      mpl_hybrid_escrow_address: custody.escrowAddress,
      mpl_hybrid_escrow_account_initialized: summary.hybridEscrowAccountInitialized,
      mpl_hybrid_escrow_account_owner: summary.hybridEscrowAccountOwner,
      mpl_hybrid_escrow_token_account: custody.escrowTokenAccount,
      mpl_hybrid_escrow_token_account_initialized: summary.vaultTokenAccountInitialized,
      mpl_hybrid_native_ready: nativeEscrowReady,
      custody_warning: custodyWarning,
      pool_sync_warning: poolSyncWarning,
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
    protocol_fees: {
      ...describeCpegProtocolFees(),
      mplHybridProtocolFeeLamports: MPL_HYBRID_PROTOCOL_SOL_FEE_LAMPORTS.toString(),
    },
    wallet_assets: walletAssets,
  });
}
