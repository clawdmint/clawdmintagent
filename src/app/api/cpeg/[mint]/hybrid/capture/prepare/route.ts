import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  buildHybridStateSummary,
  buildCaptureTransferInstructions,
  ensureHybridPoolAssetData,
  getMplHybridCustodyTarget,
  mintHybridPoolAsset,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridAssetCounts, loadHybridLaunchAndAgent, listHybridAssetPegIds } from "@/lib/cpeg-hybrid-loader";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  wallet: z.string().min(32),
  count: z.number().int().min(1).max(8).default(1),
});

interface RouteContext {
  params: { mint: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PrepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = await loadHybridLaunchAndAgent(params.mint);
    if (!data) {
      return NextResponse.json({ success: false, error: "cPEG hybrid launch not found" }, { status: 404 });
    }
    if (data.launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      return NextResponse.json(
        { success: false, error: "This launch does not use the Metaplex hybrid path" },
        { status: 400 }
      );
    }
    if (data.launch.hybridStatus !== CPEG_HYBRID_STATUS_CONFIGURED) {
      return NextResponse.json(
        { success: false, error: "Hybrid setup is not complete for this launch yet" },
        { status: 409 }
      );
    }
    const counts = await loadHybridAssetCounts(data.launch.id);
    const summary = await buildHybridStateSummary(data.agent, data.launch, counts);
    if (summary.pegUnitRaw !== data.launch.pegUnitRaw) {
      await prisma.clawPegLaunch
        .update({
          where: { id: data.launch.id },
          data: { pegUnitRaw: summary.pegUnitRaw, hybridSwapAmountRaw: summary.pegUnitRaw },
        })
        .catch(() => null);
    }
    if (parsed.data.count > summary.availableCapacity) {
      return NextResponse.json(
        {
          success: false,
          error: "Not enough cPEG capacity remains for this capture.",
          details: {
            requested: parsed.data.count,
            available_capacity: summary.availableCapacity,
            effective_max_pegs: summary.effectiveMaxPegs,
            peg_unit_raw: summary.pegUnitRaw,
            token_supply_raw: summary.tokenSupplyRaw,
          },
        },
        { status: 409 }
      );
    }

    const custody = getMplHybridCustodyTarget(data.launch, summary.tokenProgramId);
    if (data.launch.cluster === "mainnet-beta" && custody.isNativeReady && !summary.vaultTokenAccountInitialized) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Metaplex Hybrid escrow token account is not initialized yet. The launch authority must run Enable cPEG once more before users can capture.",
          details: {
            expected_mpl_hybrid_escrow: custody.escrowAddress,
            expected_mpl_hybrid_escrow_token_account: custody.escrowTokenAccount,
          },
        },
        { status: 409 }
      );
    }
    const hybridLaunchSnapshot = {
      id: data.launch.id,
      name: data.launch.name,
      symbol: data.launch.symbol,
      cluster: data.launch.cluster,
      tokenMint: data.launch.tokenMint,
      agentTokenMint: data.launch.agentTokenMint,
      hybridCoreCollectionAddress: data.launch.hybridCoreCollectionAddress,
      hybridEscrowAddress: data.launch.hybridEscrowAddress,
      hybridProgramId: data.launch.hybridProgramId,
      hybridStatus: data.launch.hybridStatus,
      feeVaultAddress: data.launch.feeVaultAddress,
      pegUnitRaw: summary.pegUnitRaw,
      maxPegs: summary.effectiveMaxPegs,
      rendererId: data.launch.rendererId,
      rendererVersion: data.launch.rendererVersion,
      collectionSeed: data.launch.collectionSeed,
    };
    let captureAssets: Array<{ asset_address: string; peg_id: number }> = [];
    if (custody.isNativeReady && custody.escrowAddress) {
      const poolRows = await prisma.clawPegHybridAsset.findMany({
        where: { launchId: data.launch.id, status: CPEG_HYBRID_ASSET_STATUS_POOL },
        orderBy: { createdAt: "asc" },
        take: parsed.data.count,
        select: { assetAddress: true, pegId: true },
      });
      captureAssets = poolRows.map((row) => ({ asset_address: row.assetAddress, peg_id: row.pegId }));
      for (const asset of captureAssets) {
        await ensureHybridPoolAssetData(data.agent, hybridLaunchSnapshot, asset.asset_address, asset.peg_id);
      }
      if (captureAssets.length < parsed.data.count) {
        const taken = await listHybridAssetPegIds(data.launch.id);
        for (const row of captureAssets) taken.add(row.peg_id);
        const missing = parsed.data.count - captureAssets.length;
        for (let index = 0; index < missing; index += 1) {
          const seeded = await mintHybridPoolAsset(
            data.agent,
            hybridLaunchSnapshot,
            taken
          );
          taken.add(seeded.pegId);
          await prisma.clawPegHybridAsset.create({
            data: {
              launchId: data.launch.id,
              tokenMint: data.launch.tokenMint,
              collectionAddress: data.launch.hybridCoreCollectionAddress || "",
              assetAddress: seeded.assetAddress,
              pegId: seeded.pegId,
              ownerAddress: seeded.poolOwner,
              status: CPEG_HYBRID_ASSET_STATUS_POOL,
            },
          });
          captureAssets.push({ asset_address: seeded.assetAddress, peg_id: seeded.pegId });
        }
      }
    }

    const result = await buildCaptureTransferInstructions(
      data.agent,
      hybridLaunchSnapshot,
      parsed.data.wallet,
      parsed.data.count,
      captureAssets.map((asset) => asset.asset_address)
    );

    return NextResponse.json({
      success: true,
      capture: {
        token_mint: data.launch.tokenMint,
        cluster: data.launch.cluster,
        wallet: parsed.data.wallet,
        count: parsed.data.count,
        amount_raw: result.amountRaw,
        amount_whole: result.amountWhole,
        user_balance_raw: result.userBalanceRaw,
        user_balance_whole: result.userBalanceWhole,
        peg_unit_raw: result.pegUnitRaw,
        token_supply_raw: result.tokenSupplyRaw,
        decimals: result.decimals,
        token_program_id: result.tokenProgramId,
        vault_token_account: result.vaultAta,
        vault_owner: result.vaultOwner,
        user_token_account: result.userAta,
        assets: captureAssets,
      },
      instructions: result.instructions,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare hybrid capture";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
