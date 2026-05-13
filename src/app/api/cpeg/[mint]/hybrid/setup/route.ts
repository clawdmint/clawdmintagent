import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createCollection as createCoreCollection, mplCore } from "@metaplex-foundation/mpl-core";
import { createNoopSigner, createSignerFromKeypair, publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CPEG_HYBRID_STATUS_CONFIGURED,
  CpegHybridEngineError,
  buildHybridStateSummary,
  getMplHybridCustodyTarget,
} from "@/lib/cpeg-hybrid-engine";
import {
  loadHybridLaunchAndAgent,
  loadHybridAssetCounts,
} from "@/lib/cpeg-hybrid-loader";
import {
  CPEG_STANDARD_MODE_METAPLEX_HYBRID,
  deriveMplHybridEscrowAddress,
} from "@/lib/cpeg-metaplex-hybrid";
import { syncMetaplexHybridPoolAssets } from "@/lib/cpeg-hybrid-inventory";
import {
  MPL_HYBRID_PROGRAM_ID,
  createInitEscrowV1Instruction,
  deriveMplHybridEscrowTokenAccount,
} from "@/lib/mpl-hybrid-native";
import { prisma } from "@/lib/db";
import { getMetaplexCoreConnection } from "@/lib/synapse-sap";
import { getAgentOperationalKeypair } from "@/lib/agent-wallets";

export const dynamic = "force-dynamic";

const SetupSchema = z.object({
  authority_address: z.string().min(32),
  setup_signature: z.string().min(32).optional(),
  collection_address: z.string().min(32).optional(),
  hybrid_escrow_address: z.string().min(32).optional(),
});

interface RouteContext {
  params: { mint: string };
}

type UmiInstructionItem = {
  instruction: {
    programId: { toString(): string };
    keys: Array<{ pubkey: { toString(): string }; isSigner: boolean; isWritable: boolean }>;
    data: Uint8Array;
  };
};

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

function serializeInstruction(ix: InstanceType<typeof TransactionInstruction>) {
  return {
    programId: ix.programId.toBase58(),
    accounts: ix.keys.map((key: { pubkey: InstanceType<typeof PublicKey>; isSigner: boolean; isWritable: boolean }) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    dataBase64: Buffer.from(ix.data).toString("base64"),
  };
}

async function verifyAndPersistReadySetup(input: {
  launchId: string;
  tokenMint: string;
  collectionAddress: string;
  escrowAddress: string;
  escrowTokenAccount: string | null;
  tokenProgramId: string | null;
  setupSignature?: string | null;
  maxPegs: number;
  hybridProgramId?: string | null;
}) {
  const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
  const expectedHybridProgramId = new PublicKey(input.hybridProgramId || MPL_HYBRID_PROGRAM_ID.toBase58());
  const escrowInfo = await connection.getAccountInfo(new PublicKey(input.escrowAddress), "confirmed");
  const escrowTokenInfo = input.escrowTokenAccount
    ? await connection.getAccountInfo(new PublicKey(input.escrowTokenAccount), "confirmed")
    : null;

  if (!escrowInfo?.owner.equals(expectedHybridProgramId)) {
    throw new CpegHybridEngineError(409, "Metaplex Hybrid escrow is not initialized yet.", {
      expected_mpl_hybrid_program: expectedHybridProgramId.toBase58(),
      expected_mpl_hybrid_escrow: input.escrowAddress,
      current_owner: escrowInfo?.owner?.toBase58() || null,
    });
  }
  if (!input.tokenProgramId || !escrowTokenInfo?.owner.equals(new PublicKey(input.tokenProgramId))) {
    throw new CpegHybridEngineError(409, "Metaplex Hybrid escrow token account is not initialized yet.", {
      expected_mpl_hybrid_escrow_token_account: input.escrowTokenAccount,
      token_program_id: input.tokenProgramId,
      current_owner: escrowTokenInfo?.owner?.toBase58() || null,
    });
  }

  const sync = await syncMetaplexHybridPoolAssets({
    launchId: input.launchId,
    tokenMint: input.tokenMint,
    collectionAddress: input.collectionAddress,
    configuredEscrowAddress: input.escrowAddress,
    hybridProgramId: input.hybridProgramId,
    maxPegs: input.maxPegs,
  }).catch((error) => ({
    synced: 0,
    updated: 0,
    skipped: 0,
    escrowAddress: input.escrowAddress,
    warning: error instanceof Error ? error.message : "Pool sync failed",
  }));

  const updated = await prisma.clawPegLaunch.update({
    where: { id: input.launchId },
    data: {
      hybridCoreCollectionAddress: input.collectionAddress,
      hybridAssetCollectionAddress: input.collectionAddress,
      hybridEscrowAddress: input.escrowAddress,
      hybridStatus: CPEG_HYBRID_STATUS_CONFIGURED,
      hybridSetupTxHash: input.setupSignature || undefined,
      hybridConfiguredAt: new Date(),
      status: "ACTIVE",
      collectionAddress: input.collectionAddress,
    },
    select: {
      id: true,
      hybridCoreCollectionAddress: true,
      hybridEscrowAddress: true,
      hybridStatus: true,
      hybridSetupTxHash: true,
      hybridConfiguredAt: true,
      status: true,
    },
  });

  return { updated, sync };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = SetupSchema.safeParse(body);
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
        { success: false, error: "Setup is only available for Metaplex hybrid launches" },
        { status: 400 }
      );
    }
    if (data.launch.cluster !== "mainnet-beta") {
      return NextResponse.json(
        { success: false, error: "cPEG is mainnet-only. Switch the launch to Solana mainnet before setup." },
        { status: 409 }
      );
    }
    if (parsed.data.authority_address !== data.launch.authorityAddress) {
      return NextResponse.json(
        { success: false, error: "authority_address does not match the launch authority" },
        { status: 403 }
      );
    }

    const authority = new PublicKey(parsed.data.authority_address);
    const counts = await loadHybridAssetCounts(data.launch.id);
    const summary = await buildHybridStateSummary(data.agent, data.launch, counts);
    const tokenProgramId = summary.tokenProgramId;
    if (!tokenProgramId) {
      throw new CpegHybridEngineError(409, "Agent token mint is not available on mainnet yet");
    }
    const agentAuthority = getAgentOperationalKeypair(data.agent);

    const requestedCollection =
      parsed.data.collection_address ||
      data.launch.hybridCoreCollectionAddress ||
      null;
    const requestedEscrow =
      parsed.data.hybrid_escrow_address ||
      data.launch.hybridEscrowAddress ||
      (requestedCollection ? deriveMplHybridEscrowAddress(requestedCollection) : null);

    if (parsed.data.setup_signature) {
      const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
      const status = await connection.getSignatureStatus(parsed.data.setup_signature, {
        searchTransactionHistory: true,
      });
      if (!status.value || status.value.err) {
        return NextResponse.json(
          { success: false, error: "Metaplex Hybrid setup transaction is not confirmed on mainnet" },
          { status: 400 }
        );
      }
      if (!requestedCollection || !requestedEscrow) {
        throw new CpegHybridEngineError(400, "collection_address and hybrid_escrow_address are required to confirm setup");
      }
      const escrowTokenAccount = deriveMplHybridEscrowTokenAccount(
        data.launch.agentTokenMint || data.launch.tokenMint,
        requestedEscrow,
        tokenProgramId
      ).toBase58();
      const { updated, sync } = await verifyAndPersistReadySetup({
        launchId: data.launch.id,
        tokenMint: data.launch.tokenMint,
        collectionAddress: requestedCollection,
        escrowAddress: requestedEscrow,
        escrowTokenAccount,
        tokenProgramId,
        setupSignature: parsed.data.setup_signature,
        maxPegs: data.launch.maxPegs,
        hybridProgramId: data.launch.hybridProgramId,
      });
      const refreshedCounts = await loadHybridAssetCounts(data.launch.id);
      return NextResponse.json({
        success: true,
        launch: {
          id: updated.id,
          token_mint: data.launch.tokenMint,
          collection_address: updated.hybridCoreCollectionAddress,
          hybrid_escrow_address: updated.hybridEscrowAddress,
          hybrid_escrow_account_initialized: true,
          vault_token_account: escrowTokenAccount,
          vault_token_account_initialized: true,
          vault_owner: updated.hybridEscrowAddress,
          token_program_id: tokenProgramId,
          hybrid_status: updated.hybridStatus,
          setup_tx_signature: updated.hybridSetupTxHash,
          configured_at: updated.hybridConfiguredAt,
          status: updated.status,
          assets: refreshedCounts,
          pool_sync: sync,
        },
      });
    }

    const existingCustody = getMplHybridCustodyTarget(
      {
        ...data.launch,
        hybridCoreCollectionAddress: requestedCollection,
        hybridEscrowAddress: requestedEscrow,
      },
      tokenProgramId
    );
    const existingEscrowTokenAccount = existingCustody.escrowTokenAccount;
    if (
      requestedCollection &&
      requestedEscrow &&
      existingEscrowTokenAccount &&
      existingCustody.isNativeReady
    ) {
      const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
      const escrowInfo = await connection.getAccountInfo(new PublicKey(requestedEscrow), "confirmed");
      const vaultInfo = await connection.getAccountInfo(new PublicKey(existingEscrowTokenAccount), "confirmed");
      const expectedHybridProgramId = new PublicKey(data.launch.hybridProgramId || MPL_HYBRID_PROGRAM_ID.toBase58());
      if (escrowInfo?.owner.equals(expectedHybridProgramId) && vaultInfo?.owner.equals(new PublicKey(tokenProgramId))) {
        const { updated, sync } = await verifyAndPersistReadySetup({
          launchId: data.launch.id,
          tokenMint: data.launch.tokenMint,
          collectionAddress: requestedCollection,
          escrowAddress: requestedEscrow,
          escrowTokenAccount: existingEscrowTokenAccount,
          tokenProgramId,
          setupSignature: null,
          maxPegs: data.launch.maxPegs,
          hybridProgramId: data.launch.hybridProgramId,
        });
        const refreshedCounts = await loadHybridAssetCounts(data.launch.id);
        return NextResponse.json({
          success: true,
          launch: {
            id: updated.id,
            token_mint: data.launch.tokenMint,
            collection_address: updated.hybridCoreCollectionAddress,
            hybrid_escrow_address: updated.hybridEscrowAddress,
            hybrid_escrow_account_initialized: true,
            vault_token_account: existingEscrowTokenAccount,
            vault_token_account_initialized: true,
            vault_owner: updated.hybridEscrowAddress,
            token_program_id: tokenProgramId,
            hybrid_status: updated.hybridStatus,
            setup_tx_signature: updated.hybridSetupTxHash,
            configured_at: updated.hybridConfiguredAt,
            status: updated.status,
            assets: refreshedCounts,
            pool_sync: sync,
          },
        });
      }
    }

    const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
    const umi = createUmi(connection.rpcEndpoint);
    umi.use(mplCore());

    const collectionKeypair = Keypair.generate();
    const collectionSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(collectionKeypair));
    const payerSigner = createNoopSigner(publicKey(authority.toBase58()));
    const agentAuthorityKey = agentAuthority.publicKey;
    const baseUrl = getCpegBaseUrl();
    const collectionAddress = collectionKeypair.publicKey.toBase58();
    const collectionUri = `${baseUrl}/api/cpeg/${data.launch.tokenMint}/metadata`;
    const metadataBaseUri = `${baseUrl}/api/cpeg/${data.launch.tokenMint}/pegs/`;
    const collectionBuilder = createCoreCollection(umi, {
      collection: collectionSigner,
      payer: payerSigner,
      updateAuthority: publicKey(agentAuthorityKey.toBase58()),
      name: `${data.launch.name} Agent PEGs`,
      uri: collectionUri,
    }).useLegacyVersion();
    const collectionInstructions = (collectionBuilder.items as unknown as UmiInstructionItem[])
      .map(umiItemToWeb3Instruction);

    const escrowAddress = deriveMplHybridEscrowAddress(collectionAddress);
    if (!escrowAddress) {
      throw new CpegHybridEngineError(409, "Could not derive the Metaplex Hybrid escrow for the Core collection");
    }
    const escrow = new PublicKey(escrowAddress);
    const tokenMint = new PublicKey(data.launch.agentTokenMint || data.launch.tokenMint);
    const tokenProgram = new PublicKey(tokenProgramId);
    const escrowTokenAccount = deriveMplHybridEscrowTokenAccount(tokenMint, escrow, tokenProgram);
    const feeLocation = (() => {
      try {
        return new PublicKey(data.launch.feeVaultAddress || agentAuthorityKey.toBase58());
      } catch {
        return agentAuthorityKey;
      }
    })();
    const feeAta = getAssociatedTokenAddressSync(
      tokenMint,
      feeLocation,
      false,
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const setupInstructions: InstanceType<typeof TransactionInstruction>[] = [...collectionInstructions];
    const feeAtaInfo = await connection.getAccountInfo(feeAta, "confirmed");
    if (!feeAtaInfo) {
      setupInstructions.push(
        createAssociatedTokenAccountInstruction(
          authority,
          feeAta,
          feeLocation,
          tokenMint,
          tokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    setupInstructions.push(
      createInitEscrowV1Instruction({
        escrow,
        authority: agentAuthorityKey,
        collection: collectionAddress,
        token: tokenMint,
        feeLocation,
        feeAta,
        name: `${data.launch.name} Agent PEG`,
        uri: metadataBaseUri,
        max: Math.max(1, Math.min(10_000, data.launch.maxPegs || 1)),
        min: 1,
        amount: BigInt(summary.pegUnitRaw || data.launch.pegUnitRaw || "1"),
        feeAmount: 0,
        solFeeAmount: 0,
        path: 0,
        tokenProgramId: tokenProgram,
        programId: data.launch.hybridProgramId || undefined,
      })
    );
    const escrowTokenInfo = await connection.getAccountInfo(escrowTokenAccount, "confirmed");
    if (!escrowTokenInfo) {
      setupInstructions.push(
        createAssociatedTokenAccountInstruction(
          authority,
          escrowTokenAccount,
          escrow,
          tokenMint,
          tokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    const transaction = new Transaction();
    for (const ix of setupInstructions) transaction.add(ix);
    const latest = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = authority;
    transaction.recentBlockhash = latest.blockhash;
    transaction.partialSign(collectionKeypair, agentAuthority);

    return NextResponse.json({
      success: true,
      requires_signature: true,
      setup: {
        cluster: data.launch.cluster,
        authority_address: parsed.data.authority_address,
        hybrid_authority_address: agentAuthorityKey.toBase58(),
        collection_address: collectionAddress,
        hybrid_escrow_address: escrowAddress,
        hybrid_escrow_token_account: escrowTokenAccount.toBase58(),
        token_program_id: tokenProgramId,
        custody_model: "metaplex_hybrid_escrow_pda",
        reroll_on_capture: true,
      },
      instructions: setupInstructions.map(serializeInstruction),
      serialized_transaction_base64: transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
      message:
        "Sign this Metaplex-only setup transaction. Your wallet pays rent/fees; Clawdmint does not deploy or upgrade any program.",
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to set up hybrid launch";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
