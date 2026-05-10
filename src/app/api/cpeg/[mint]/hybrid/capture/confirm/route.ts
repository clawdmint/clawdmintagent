import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  buildHybridStateSummary,
  confirmCaptureMint,
  getMplHybridCustodyTarget,
} from "@/lib/cpeg-hybrid-engine";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import {
  loadHybridAssetCounts,
  loadHybridLaunchAndAgent,
  listHybridAssetPegIds,
} from "@/lib/cpeg-hybrid-loader";
import { getClawPegRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  wallet: z.string().min(32),
  signature: z.string().min(32),
  count: z.number().int().min(1).max(8).default(1),
  asset_addresses: z.array(z.string().min(32)).max(8).optional(),
});

interface RouteContext {
  params: { mint: string };
}

async function verifyTransferSignature(
  connection: InstanceType<typeof Connection>,
  signature: string,
  vault: InstanceType<typeof PublicKey>,
  expectedRaw: bigint
) {
  const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
  if (!status.value || status.value.err) {
    throw new CpegHybridEngineError(400, "Capture transfer transaction is not confirmed on the configured cluster");
  }
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return; // best effort: status confirmed is sufficient
  const accountKeys: InstanceType<typeof PublicKey>[] = tx.transaction.message.getAccountKeys
    ? tx.transaction.message.getAccountKeys().keySegments().flat()
    : [];
  if (accountKeys.length && !accountKeys.some((key: InstanceType<typeof PublicKey>) => key.equals(vault))) {
    throw new CpegHybridEngineError(400, "Capture transaction does not reference the agent vault");
  }
  const vaultIndex = accountKeys.findIndex((key: InstanceType<typeof PublicKey>) => key.equals(vault));
  if (vaultIndex >= 0 && tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
    type TokenBalanceEntry = { accountIndex: number; uiTokenAmount: { amount: string } };
    const preBalances = tx.meta.preTokenBalances as TokenBalanceEntry[];
    const postBalances = tx.meta.postTokenBalances as TokenBalanceEntry[];
    const pre = preBalances.find((entry: TokenBalanceEntry) => entry.accountIndex === vaultIndex)?.uiTokenAmount.amount || "0";
    const post = postBalances.find((entry: TokenBalanceEntry) => entry.accountIndex === vaultIndex)?.uiTokenAmount.amount || "0";
    if (BigInt(post) - BigInt(pre) < expectedRaw) {
      throw new CpegHybridEngineError(400, "Capture transaction did not lock the required token backing unit");
    }
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = ConfirmSchema.safeParse(body);
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
    if (!data.launch.hybridEscrowAddress) {
      return NextResponse.json(
        { success: false, error: "Hybrid vault is missing on the launch record" },
        { status: 409 }
      );
    }

    const capacityCounts = await loadHybridAssetCounts(data.launch.id);
    const capacitySummary = await buildHybridStateSummary(data.agent, data.launch, capacityCounts);
    const expectedRaw = BigInt(capacitySummary.pegUnitRaw) * BigInt(parsed.data.count);
    const connection = new Connection(getClawPegRpcUrl(), "confirmed");
    const custody = getMplHybridCustodyTarget(data.launch, capacitySummary.tokenProgramId);
    const vaultForVerification =
      custody.isNativeReady && custody.escrowTokenAccount
        ? custody.escrowTokenAccount
        : data.launch.hybridEscrowAddress;
    await verifyTransferSignature(
      connection,
      parsed.data.signature,
      new PublicKey(vaultForVerification || data.launch.hybridEscrowAddress),
      expectedRaw
    );

    // Idempotency: if this signature was already consumed for this launch, return existing assets.
    const alreadyClaimed = await prisma.clawPegHybridAsset.findMany({
      where: { launchId: data.launch.id, captureTxHash: parsed.data.signature },
      select: { assetAddress: true, pegId: true, status: true, capturedAt: true },
    });
    if (alreadyClaimed.length > 0) {
      const counts = await loadHybridAssetCounts(data.launch.id);
      return NextResponse.json({
        success: true,
        already_processed: true,
        assets: alreadyClaimed.map((row) => ({
          asset_address: row.assetAddress,
          peg_id: row.pegId,
          status: row.status,
          captured_at: row.capturedAt?.toISOString() || null,
        })),
        counts,
      });
    }

    if (parsed.data.asset_addresses?.length) {
      const requestedAssets = parsed.data.asset_addresses.slice(0, parsed.data.count);
      if (requestedAssets.length !== parsed.data.count) {
        throw new CpegHybridEngineError(400, "Capture confirmation is missing prepared cPEG assets");
      }
      const rows = await prisma.clawPegHybridAsset.findMany({
        where: {
          launchId: data.launch.id,
          assetAddress: { in: requestedAssets },
        },
      });
      if (rows.length !== requestedAssets.length) {
        throw new CpegHybridEngineError(404, "One or more prepared cPEG assets were not found");
      }
      const now = new Date();
      const updated = [];
      for (const row of rows) {
        if (row.status !== CPEG_HYBRID_ASSET_STATUS_POOL && row.ownerAddress !== parsed.data.wallet) {
          throw new CpegHybridEngineError(409, `cPEG #${row.pegId} is no longer available for capture`);
        }
        await prisma.clawPegHybridAsset.update({
          where: { assetAddress: row.assetAddress },
          data: {
            ownerAddress: parsed.data.wallet,
            status: CPEG_HYBRID_ASSET_STATUS_OWNED,
            captureTxHash: parsed.data.signature,
            capturedAt: now,
          },
        });
        updated.push({
          asset_address: row.assetAddress,
          peg_id: row.pegId,
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
          mint_tx: null,
        });
      }
      const counts = await loadHybridAssetCounts(data.launch.id);
      return NextResponse.json({
        success: true,
        already_processed: false,
        capture_signature: parsed.data.signature,
        assets: updated,
        counts,
      });
    }

    const taken = await listHybridAssetPegIds(data.launch.id);
    if (parsed.data.count > capacitySummary.availableCapacity) {
      throw new CpegHybridEngineError(409, "Not enough cPEG capacity remains for this capture", {
        requested: parsed.data.count,
        available_capacity: capacitySummary.availableCapacity,
        effective_max_pegs: capacitySummary.effectiveMaxPegs,
        peg_unit_raw: capacitySummary.pegUnitRaw,
        token_supply_raw: capacitySummary.tokenSupplyRaw,
      });
    }
    const minted: Array<{ asset_address: string; peg_id: number; mint_tx: string | null }> = [];
    for (let captureIndex = 0; captureIndex < parsed.data.count; captureIndex += 1) {
      const result = await confirmCaptureMint(
        data.agent,
        {
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
          pegUnitRaw: data.launch.pegUnitRaw,
          maxPegs: capacitySummary.effectiveMaxPegs,
          rendererId: data.launch.rendererId,
          rendererVersion: data.launch.rendererVersion,
          collectionSeed: data.launch.collectionSeed,
        },
        parsed.data.wallet,
        taken
      );
      taken.add(result.pegId);
      await prisma.clawPegHybridAsset.create({
        data: {
          launchId: data.launch.id,
          tokenMint: data.launch.tokenMint,
          collectionAddress: data.launch.hybridCoreCollectionAddress || "",
          assetAddress: result.assetAddress,
          pegId: result.pegId,
          ownerAddress: parsed.data.wallet,
          status: CPEG_HYBRID_ASSET_STATUS_OWNED,
          captureTxHash: parsed.data.signature,
          capturedAt: new Date(),
        },
      });
      minted.push({
        asset_address: result.assetAddress,
        peg_id: result.pegId,
        mint_tx: result.mintTxSignature,
      });
    }

    const counts = await loadHybridAssetCounts(data.launch.id);
    return NextResponse.json({
      success: true,
      already_processed: false,
      capture_signature: parsed.data.signature,
      assets: minted.map((entry) => ({
        asset_address: entry.asset_address,
        peg_id: entry.peg_id,
        status: CPEG_HYBRID_ASSET_STATUS_OWNED,
        mint_tx: entry.mint_tx,
      })),
      counts,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to confirm hybrid capture";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
