import { NextRequest, NextResponse } from "next/server";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  create as createCoreAsset,
  mplCore,
  safeFetchCollectionV1,
} from "@metaplex-foundation/mpl-core";
import {
  createNoopSigner,
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { z } from "zod";
import {
  CPEG_HYBRID_ASSET_STATUS_POOL,
  CPEG_HYBRID_ASSET_STATUS_OWNED,
  CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  type MplHybridCustodyTarget,
  buildHybridStateSummary,
  buildCaptureTransferInstructions,
  fetchHybridCoreAssetOwner,
  getMplHybridCustodyTarget,
} from "@/lib/cpeg-hybrid-engine";
import { loadHybridAssetCounts, loadHybridLaunchAndAgent } from "@/lib/cpeg-hybrid-loader";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { syncMetaplexHybridPoolAssets } from "@/lib/cpeg-hybrid-inventory";
import {
  MPL_HYBRID_PATH_NO_REROLL_METADATA,
  createInitNftDataV1Instruction,
  createUpdateEscrowV1Instruction,
  decodeMplHybridEscrowAccount,
  deriveMplHybridNftDataPda,
} from "@/lib/mpl-hybrid-native";
import { getMetaplexCoreConnection } from "@/lib/synapse-sap";
import { prisma } from "@/lib/db";
import { getAgentOperationalKeypair } from "@/lib/agent-wallets";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  wallet: z.string().min(32),
  count: z.number().int().min(1).max(8).default(1),
});

interface RouteContext {
  params: { mint: string };
}

type HybridLoadData = NonNullable<Awaited<ReturnType<typeof loadHybridLaunchAndAgent>>>;

type UmiInstructionItem = {
  instruction: {
    programId: { toString(): string };
    keys: Array<{ pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }>;
    data: Uint8Array;
  };
};

type LazyCaptureAsset = {
  asset_address: string;
  peg_id: number;
  source: "pool" | "lazy_mint";
};

type LazyAssetReservation = LazyCaptureAsset & {
  assetKeypair: InstanceType<typeof Keypair>;
};

const PENDING_CAPTURE_TTL_MS = 20 * 60 * 1000;

function getCpegBaseUrl() {
  return (
    process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://cpeg.clawdmint.xyz"
  ).replace(/\/$/, "");
}

function umiItemToWeb3Instruction(item: UmiInstructionItem) {
  const ix = item.instruction;
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId.toString()),
    keys: ix.keys.map((meta) => ({
      pubkey: new PublicKey(meta.pubkey.toString()),
      isSigner: meta.isSigner,
      isWritable: meta.isWritable,
    })),
    data: Buffer.from(ix.data),
  });
}

function findRandomPegId(used: Set<number>, maxPegs: number) {
  const cap = Math.max(1, Math.min(10_000, maxPegs || 1));
  // Sparse case: pegId space is much larger than the used set, so a few random
  // draws almost always find a free slot without scanning the entire range.
  if (used.size < cap) {
    const maxAttempts = Math.min(64, cap);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = 1 + Math.floor(Math.random() * cap);
      if (!used.has(candidate)) return candidate;
    }
    // Dense case (or unlucky draws): materialize the free list and pick one
    // uniformly at random. Bounded by maxPegs <= 10,000 so the cost is fine.
    const free: number[] = [];
    for (let pegId = 1; pegId <= cap; pegId += 1) {
      if (!used.has(pegId)) free.push(pegId);
    }
    if (free.length > 0) {
      const index = Math.floor(Math.random() * free.length);
      return free[index];
    }
  }
  throw new CpegHybridEngineError(409, "All cPEG IDs are already reserved or captured for this launch");
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
  );
}

async function reserveLazyCaptureAssets(input: {
  launchId: string;
  tokenMint: string;
  collectionAddress: string;
  wallet: string;
  maxPegs: number;
  count: number;
}) {
  const staleBefore = new Date(Date.now() - PENDING_CAPTURE_TTL_MS);
  await prisma.clawPegHybridAsset.deleteMany({
    where: {
      launchId: input.launchId,
      status: CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
      captureTxHash: null,
      createdAt: { lt: staleBefore },
    },
  });

  const reservations: LazyAssetReservation[] = [];
  for (let index = 0; index < input.count; index += 1) {
    let reserved = false;
    for (let attempt = 0; attempt < Math.max(8, input.maxPegs); attempt += 1) {
      const existing = await prisma.clawPegHybridAsset.findMany({
        where: { launchId: input.launchId },
        select: { pegId: true },
      });
      const used = new Set(existing.map((row) => row.pegId));
      for (const row of reservations) used.add(row.peg_id);
      const pegId = findRandomPegId(used, input.maxPegs);
      const assetKeypair = Keypair.generate();
      const assetAddress = assetKeypair.publicKey.toBase58();
      try {
        await prisma.clawPegHybridAsset.create({
          data: {
            launchId: input.launchId,
            tokenMint: input.tokenMint,
            collectionAddress: input.collectionAddress,
            assetAddress,
            pegId,
            ownerAddress: input.wallet,
            status: CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
          },
        });
        reservations.push({
          asset_address: assetAddress,
          peg_id: pegId,
          source: "lazy_mint",
          assetKeypair,
        });
        reserved = true;
        break;
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }
    if (!reserved) {
      throw new CpegHybridEngineError(409, "Could not reserve a deterministic cPEG ID for this capture");
    }
  }
  return reservations;
}

async function clearLazyReservations(reservations: LazyAssetReservation[]) {
  if (reservations.length === 0) return;
  await prisma.clawPegHybridAsset
    .deleteMany({
      where: {
        assetAddress: { in: reservations.map((asset) => asset.asset_address) },
        status: CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
        captureTxHash: null,
      },
    })
    .catch(() => null);
}

async function buildLazyMintPrefix(input: {
  data: HybridLoadData;
  custody: MplHybridCustodyTarget;
  pegUnitRaw: string;
  userWallet: string;
  reservations: LazyAssetReservation[];
}) {
  if (!input.data.launch.hybridCoreCollectionAddress || !input.custody.escrowAddress) {
    throw new CpegHybridEngineError(409, "Metaplex Hybrid collection or escrow is not configured");
  }
  const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
  const umi = createUmi(connection.rpcEndpoint);
  umi.use(mplCore());
  const agentAuthority = getAgentOperationalKeypair(input.data.agent);
  const agentSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(agentAuthority));
  umi.use(signerIdentity(agentSigner));
  const payerSigner = createNoopSigner(publicKey(input.userWallet));
  const collectionAccount = await safeFetchCollectionV1(
    umi,
    publicKey(input.data.launch.hybridCoreCollectionAddress)
  );
  if (!collectionAccount) {
    throw new CpegHybridEngineError(409, "Core Agent PEG collection account is not present on mainnet");
  }
  if (collectionAccount.updateAuthority.toString() !== agentAuthority.publicKey.toBase58()) {
    throw new CpegHybridEngineError(
      409,
      "This cPEG collection was not enabled with the Metaplex Agent authority required for lazy capture. Run Enable cPEG again to create the agent-authorized Hybrid collection."
    );
  }

  const baseUrl = getCpegBaseUrl();
  const tokenMint = new PublicKey(input.data.launch.agentTokenMint || input.data.launch.tokenMint);
  const feeLocation = (() => {
    try {
      return new PublicKey(input.data.launch.feeVaultAddress || agentAuthority.publicKey.toBase58());
    } catch {
      return agentAuthority.publicKey;
    }
  })();
  const instructions: InstanceType<typeof TransactionInstruction>[] = [];
  for (const reservation of input.reservations) {
    const assetSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(reservation.assetKeypair));
    const name = `${input.data.launch.symbol} cPEG #${reservation.peg_id}`;
    const uri = `${baseUrl}/api/cpeg/${input.data.launch.tokenMint}/pegs/${reservation.peg_id}`;
    const builder = createCoreAsset(umi, {
      asset: assetSigner,
      collection: collectionAccount,
      authority: agentSigner,
      payer: payerSigner,
      owner: publicKey(input.custody.escrowAddress),
      name,
      uri,
    }).useLegacyVersion();
    instructions.push(...(builder.items as unknown as UmiInstructionItem[]).map(umiItemToWeb3Instruction));

    const assetPublicKey = new PublicKey(reservation.asset_address);
    instructions.push(
      createInitNftDataV1Instruction({
        nftData: deriveMplHybridNftDataPda(
          assetPublicKey,
          input.data.launch.hybridProgramId || undefined
        ),
        authority: agentAuthority.publicKey,
        asset: assetPublicKey,
        collection: input.data.launch.hybridCoreCollectionAddress,
        token: tokenMint,
        feeLocation,
        name,
        uri,
        max: Math.max(1, Math.min(10_000, input.data.launch.maxPegs || 1)),
        min: 0,
        amount: BigInt(input.pegUnitRaw || "1"),
        feeAmount: 0,
        solFeeAmount: 0,
        path: MPL_HYBRID_PATH_NO_REROLL_METADATA,
        programId: input.data.launch.hybridProgramId || undefined,
      })
    );
  }

  return {
    instructions,
    signers: input.reservations.map((asset) => asset.assetKeypair),
  };
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
    await prisma.clawPegHybridAsset.deleteMany({
      where: {
        launchId: data.launch.id,
        status: CPEG_HYBRID_ASSET_STATUS_PENDING_CAPTURE,
        captureTxHash: null,
        createdAt: { lt: new Date(Date.now() - PENDING_CAPTURE_TTL_MS) },
      },
    });
    let counts = await loadHybridAssetCounts(data.launch.id);
    let summary = await buildHybridStateSummary(data.agent, data.launch, counts);
    if (summary.pegUnitRaw !== data.launch.pegUnitRaw) {
      await prisma.clawPegLaunch
        .update({
          where: { id: data.launch.id },
          data: { pegUnitRaw: summary.pegUnitRaw, hybridSwapAmountRaw: summary.pegUnitRaw },
        })
        .catch(() => null);
    }

    const custody = getMplHybridCustodyTarget(data.launch, summary.tokenProgramId);
    let poolSyncWarning: string | null = null;
    if (data.launch.cluster === "mainnet-beta" && custody.isNativeReady && !summary.hybridEscrowAccountInitialized) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Metaplex Hybrid escrow PDA is not initialized yet. The launch authority must run Enable cPEG once more before users can capture.",
          details: {
            expected_mpl_hybrid_escrow: custody.escrowAddress,
            current_mpl_hybrid_escrow_owner: summary.hybridEscrowAccountOwner,
          },
        },
        { status: 409 }
      );
    }
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
    if (parsed.data.count > summary.availableCapacity) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Not enough cPEG capacity is available for this capture.",
          details: {
            requested: parsed.data.count,
            available_capacity: summary.availableCapacity,
            pool_assets: summary.poolAssets,
            effective_max_pegs: summary.effectiveMaxPegs,
            peg_unit_raw: summary.pegUnitRaw,
            token_supply_raw: summary.tokenSupplyRaw,
            pool_sync_warning: poolSyncWarning,
          },
        },
        { status: 409 }
      );
    }
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
    const captureAssets: LazyCaptureAsset[] = [];
    const lazyReservations: LazyAssetReservation[] = [];
    const prefixInstructions: InstanceType<typeof TransactionInstruction>[] = [];
    const additionalSigners: InstanceType<typeof Keypair>[] = [];
    if (custody.isNativeReady && custody.escrowAddress) {
      // Auto-migrate the on-chain escrow path if it was initialized in legacy
      // "reroll metadata on capture" mode. That mode forces mpl-core update_v1
      // with the collection authority as a co-signer; user wallets cannot
      // satisfy this and the program rejects capture_v1 with
      // InvalidUpdateAuthority (0x177c). The agent operational keypair already
      // partial-signs the prepared transaction whenever an instruction lists
      // it as a signer, so prepending update_escrow keeps the user signing
      // exactly one transaction.
      const escrowMetaConnection = getMetaplexCoreConnection({ commitment: "confirmed" });
      const escrowPubkey = new PublicKey(custody.escrowAddress);
      const escrowInfo = await escrowMetaConnection.getAccountInfo(escrowPubkey, "confirmed").catch(() => null);
      if (escrowInfo) {
        const decoded = decodeMplHybridEscrowAccount(escrowInfo.data);
        const needsMigration = Boolean(decoded) && (decoded!.path & MPL_HYBRID_PATH_NO_REROLL_METADATA) === 0;
        if (needsMigration) {
          const agentAuthority = getAgentOperationalKeypair(data.agent);
          if (decoded!.authority !== agentAuthority.publicKey.toBase58()) {
            throw new CpegHybridEngineError(
              409,
              "Metaplex Hybrid escrow was initialized with a different authority and cannot be auto-migrated. Recreate the launch's escrow with the current Clawdmint Metaplex authority.",
              {
                escrow_address: custody.escrowAddress,
                expected_authority: agentAuthority.publicKey.toBase58(),
                escrow_authority: decoded!.authority,
              }
            );
          }
          if (decoded!.count > BigInt(1)) {
            throw new CpegHybridEngineError(
              409,
              "Metaplex Hybrid escrow is in legacy reroll-metadata mode but the program no longer allows auto-migration after swaps have started. Recreate the launch's escrow.",
              {
                escrow_address: custody.escrowAddress,
                escrow_swap_count: decoded!.count.toString(),
              }
            );
          }
          prefixInstructions.push(
            createUpdateEscrowV1Instruction({
              escrow: escrowPubkey,
              authority: agentAuthority.publicKey,
              collection: decoded!.collection,
              token: decoded!.token,
              feeLocation: decoded!.feeLocation,
              path: MPL_HYBRID_PATH_NO_REROLL_METADATA,
              programId: data.launch.hybridProgramId || undefined,
            })
          );
        }
      }
      const poolRows = await prisma.clawPegHybridAsset.findMany({
        where: { launchId: data.launch.id, status: CPEG_HYBRID_ASSET_STATUS_POOL },
        orderBy: { pegId: "asc" },
        take: Math.max(parsed.data.count * 4, parsed.data.count + 20),
        select: { assetAddress: true, pegId: true },
      });
      const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
      for (const row of poolRows) {
        if (captureAssets.length >= parsed.data.count) break;
        const onChainOwner = await fetchHybridCoreAssetOwner(row.assetAddress).catch(() => null);
        if (onChainOwner !== custody.escrowAddress) {
          if (onChainOwner) {
            await prisma.clawPegHybridAsset.update({
              where: { assetAddress: row.assetAddress },
              data: { ownerAddress: onChainOwner, status: CPEG_HYBRID_ASSET_STATUS_OWNED },
            }).catch(() => null);
          }
          continue;
        }
        const nftData = deriveMplHybridNftDataPda(
          new PublicKey(row.assetAddress),
          data.launch.hybridProgramId || undefined
        );
        const nftDataInfo = await connection.getAccountInfo(nftData, "confirmed").catch(() => null);
        if (!nftDataInfo) continue;
        captureAssets.push({ asset_address: row.assetAddress, peg_id: row.pegId, source: "pool" });
      }
      const lazyNeeded = parsed.data.count - captureAssets.length;
      if (lazyNeeded > 0) {
        if (lazyNeeded > 1) {
          throw new CpegHybridEngineError(
            400,
            "Lazy cPEG creation is prepared one asset per transaction on mainnet. Reduce count to 1 when the Hybrid pool is empty.",
            {
              requested: parsed.data.count,
              pool_assets_ready: captureAssets.length,
              lazy_assets_required: lazyNeeded,
            }
          );
        }
        if (!data.launch.hybridCoreCollectionAddress) {
          throw new CpegHybridEngineError(409, "Metaplex Agent PEG collection is not configured for lazy capture");
        }
        const reservations = await reserveLazyCaptureAssets({
          launchId: data.launch.id,
          tokenMint: data.launch.tokenMint,
          collectionAddress: data.launch.hybridCoreCollectionAddress,
          wallet: parsed.data.wallet,
          maxPegs: summary.effectiveMaxPegs,
          count: lazyNeeded,
        });
        lazyReservations.push(...reservations);
        try {
          const lazyPrefix = await buildLazyMintPrefix({
            data,
            custody,
            pegUnitRaw: summary.pegUnitRaw,
            userWallet: parsed.data.wallet,
            reservations,
          });
          prefixInstructions.push(...lazyPrefix.instructions);
          additionalSigners.push(...lazyPrefix.signers);
          captureAssets.push(...reservations);
        } catch (error) {
          await clearLazyReservations(reservations);
          throw error;
        }
      }
      if (captureAssets.length < parsed.data.count) {
        throw new CpegHybridEngineError(
          409,
          "Metaplex Hybrid could not prepare enough Agent PEG Core assets for this capture.",
          {
            requested: parsed.data.count,
            ready_assets: captureAssets.length,
            pool_assets: poolRows.length,
            expected_mpl_hybrid_escrow: custody.escrowAddress,
          }
        );
      }
    }

    let result: Awaited<ReturnType<typeof buildCaptureTransferInstructions>>;
    try {
      result = await buildCaptureTransferInstructions(
        data.agent,
        hybridLaunchSnapshot,
        parsed.data.wallet,
        parsed.data.count,
        captureAssets.map((asset) => asset.asset_address),
        prefixInstructions,
        additionalSigners
      );
    } catch (error) {
      await clearLazyReservations(lazyReservations);
      throw error;
    }

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
        pool_sync_warning: poolSyncWarning,
        serialized_transaction_base64: result.serializedTransactionBase64,
      },
      instructions: result.instructions,
      serialized_transaction_base64: result.serializedTransactionBase64,
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare hybrid capture";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
