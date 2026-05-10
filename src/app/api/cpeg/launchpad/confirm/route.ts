import { Connection, PublicKey } from "@solana/web3.js";
import type { Prisma } from "@prisma/client";
import { createPublicKey, verify } from "crypto";
import bs58 from "bs58";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  CLAWPEG_DEFAULT_RENDERER_ID,
  CLAWPEG_DEFAULT_RENDERER_VERSION,
  getClawPegCluster,
  getClawPegProgramId,
} from "@/lib/clawpeg";
import { verifyClawPegRendererHash } from "@/lib/clawpeg-renderer-registry";
import { getClawPegRpcUrl } from "@/lib/env";
import {
  normalizeCpegAgentRootLink,
} from "@/lib/cpeg-agent-root";
import {
  CPEG_HYBRID_STATUS_READY,
  CPEG_STANDARD_MODE_METAPLEX_HYBRID,
} from "@/lib/cpeg-metaplex-hybrid";

export const dynamic = "force-dynamic";

const PEG_COLLECTION_SIZE = 228;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const ConfirmSchema = z.object({
  name: z.string().min(1).max(48).default("Claw Agent PEG"),
  symbol: z.string().min(1).max(12).default("CPEG"),
  signature: z.string().min(32).optional(),
  wallet_message: z.string().min(32).optional(),
  wallet_signature: z.string().min(32).optional(),
  token_mint: z.string().min(32),
  collection_address: z.string().min(32).nullable().optional(),
  hook_validation_address: z.string().min(32).nullable().optional(),
  authority_address: z.string().min(32).optional(),
  creator_address: z.string().min(32).optional(),
  fee_vault_address: z.string().min(32).optional(),
  standard_mode: z.enum(["custom_registry", "metaplex_hybrid"]).default("custom_registry"),
  renderer_id: z.string().min(1).optional(),
  renderer_version: z.string().min(1).optional(),
  renderer_hash: z.string().min(64).optional(),
  collection_seed: z.string().min(32).optional(),
  peg_unit_raw: z.string().min(1).optional(),
  max_pegs: z.number().int().min(1).optional(),
  royalty_bps: z.number().int().min(0).max(10000).optional(),
  marketplace_fee_bps: z.number().int().min(0).max(10000).optional(),
  launch_fee_lamports: z.string().min(1).optional(),
  renderer_params: z.record(z.unknown()).optional(),
  identity_mode: z.enum(["standalone", "metaplex_agent"]).default("standalone"),
  agent_asset_address: z.string().min(32).optional(),
  agent_identity_pda: z.string().min(32).optional(),
  agent_collection_address: z.string().min(32).optional(),
  agent_wallet_address: z.string().min(32).optional(),
  agent_name: z.string().max(80).optional(),
  agent_token_mint: z.string().min(32).optional(),
  agent_token_launch_id: z.string().optional(),
  hybrid_program_id: z.string().min(32).nullable().optional(),
  hybrid_escrow_address: z.string().min(32).nullable().optional(),
  hybrid_core_collection_address: z.string().min(32).nullable().optional(),
  hybrid_asset_collection_address: z.string().min(32).nullable().optional(),
  hybrid_swap_amount_raw: z.string().min(1).optional(),
  hybrid_capture_fee_lamports: z.string().min(1).optional(),
  hybrid_reroll: z.boolean().optional(),
  hybrid_status: z.string().optional(),
  hybrid_plan: z.record(z.unknown()).optional(),
});

function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function verifySolanaMessageSignature(input: {
  walletAddress: string;
  message: string;
  signatureBase64: string;
}) {
  try {
    const publicKeyBytes = Buffer.from(bs58.decode(input.walletAddress));
    if (publicKeyBytes.length !== 32) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(input.message, "utf8"), key, Buffer.from(input.signatureBase64, "base64"));
  } catch {
    return false;
  }
}

function readPubkey(data: Buffer, cursor: { value: number }) {
  const key = new PublicKey(data.subarray(cursor.value, cursor.value + 32));
  cursor.value += 32;
  return key;
}

function readBytes32(data: Buffer, cursor: { value: number }) {
  const value = data.subarray(cursor.value, cursor.value + 32);
  cursor.value += 32;
  return value;
}

function readU64(data: Buffer, cursor: { value: number }) {
  const value = data.readBigUInt64LE(cursor.value);
  cursor.value += 8;
  return value;
}

function readU32(data: Buffer, cursor: { value: number }) {
  const value = data.readUInt32LE(cursor.value);
  cursor.value += 4;
  return value;
}

function readU16(data: Buffer, cursor: { value: number }) {
  const value = data.readUInt16LE(cursor.value);
  cursor.value += 2;
  return value;
}

function parsePegCollection(data: Buffer) {
  if (data.length < PEG_COLLECTION_SIZE || data[0] !== 1) {
    throw new Error("Collection account is not an initialized cPEG collection");
  }

  const cursor = { value: 0 };
  const isInitialized = data[cursor.value] === 1;
  cursor.value += 1;
  const version = data[cursor.value];
  cursor.value += 1;
  const bump = data[cursor.value];
  cursor.value += 1;
  const authority = readPubkey(data, cursor);
  const tokenMint = readPubkey(data, cursor);
  const rendererHash = readBytes32(data, cursor);
  const collectionSeed = readBytes32(data, cursor);
  const pegUnitRaw = readU64(data, cursor);
  const maxPegs = readU32(data, cursor);
  cursor.value += 4; // total_pegs
  cursor.value += 4; // burned_pegs
  const launchFeeLamports = readU64(data, cursor);
  const royaltyBps = readU16(data, cursor);
  const marketplaceFeeBps = readU16(data, cursor);
  const creator = readPubkey(data, cursor);
  const feeVault = readPubkey(data, cursor);
  const decimals = data[cursor.value] ?? 0;

  return {
    isInitialized,
    version,
    bump,
    authority,
    tokenMint,
    rendererHash: bytesToHex(rendererHash),
    collectionSeed: bytesToHex(collectionSeed),
    pegUnitRaw: pegUnitRaw.toString(),
    maxPegs,
    launchFeeLamports: launchFeeLamports.toString(),
    royaltyBps,
    marketplaceFeeBps,
    creator,
    feeVault,
    decimals,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ConfirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const cluster = getClawPegCluster();
    const rpcUrl = process.env["CPEG_CONFIRM_RPC_URL"] || getClawPegRpcUrl();
    const connection = new Connection(rpcUrl, "confirmed");
    if (input.signature) {
      const signatureStatus = await connection.getSignatureStatus(input.signature, {
        searchTransactionHistory: true,
      });
      if (!signatureStatus.value || signatureStatus.value.err) {
        return NextResponse.json(
          { success: false, error: "Launch transaction is not confirmed on the configured cluster" },
          { status: 400 }
        );
      }
    }

    if (input.standard_mode === CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
      const tokenMint = new PublicKey(input.agent_token_mint || input.token_mint);
      const rendererId = input.renderer_id || CLAWPEG_DEFAULT_RENDERER_ID;
      const rendererVersion = input.renderer_version || CLAWPEG_DEFAULT_RENDERER_VERSION;
      const rendererParamsObject = (input.renderer_params || {}) as Record<string, unknown>;
      const agentRoot = normalizeCpegAgentRootLink({
        identityMode: input.identity_mode,
        agentAssetAddress: input.agent_asset_address || (rendererParamsObject.agentAsset as string | undefined),
        agentIdentityPda: input.agent_identity_pda || (rendererParamsObject.agentIdentity as string | undefined),
        agentCollectionAddress: input.agent_collection_address || (rendererParamsObject.agentCollection as string | undefined),
        agentWalletAddress: input.agent_wallet_address || (rendererParamsObject.agentWallet as string | undefined),
        agentName: input.agent_name,
      });
      if (agentRoot.identityMode !== "metaplex_agent" || !agentRoot.agentAssetAddress || !agentRoot.agentIdentityPda) {
        return NextResponse.json(
          { success: false, error: "Metaplex Agent/Core root is required for this cPEG launch" },
          { status: 400 }
        );
      }
      const rendererHash = input.renderer_hash || "";
      const rendererVerification = verifyClawPegRendererHash({
        hash: rendererHash,
        id: rendererId,
        version: rendererVersion,
        params: rendererParamsObject,
      });
      if (!rendererVerification.ok) {
        return NextResponse.json(
          {
            success: false,
            error:
              rendererVerification.reason ||
              "Renderer hash does not match the published renderer manifest",
            expected_hash: rendererVerification.expectedHash,
            renderer_hash: rendererHash,
          },
          { status: 400 }
        );
      }

      const authorityAddress = input.authority_address || agentRoot.agentWalletAddress;
      if (!authorityAddress) {
        return NextResponse.json(
          { success: false, error: "authority_address is required for Metaplex-native cPEG launches" },
          { status: 400 }
        );
      }
      if (!input.wallet_message || !input.wallet_signature) {
        return NextResponse.json(
          { success: false, error: "Wallet approval is required for cPEG launch" },
          { status: 400 }
        );
      }
      const messageMatchesLaunch =
        input.wallet_message.includes("ClawPEG Launch Approval") &&
        input.wallet_message.includes(tokenMint.toBase58()) &&
        input.wallet_message.includes(rendererHash) &&
        input.wallet_message.includes(authorityAddress);
      const signatureOk =
        messageMatchesLaunch &&
        verifySolanaMessageSignature({
          walletAddress: authorityAddress,
          message: input.wallet_message,
          signatureBase64: input.wallet_signature,
        });
      if (!signatureOk) {
        return NextResponse.json(
          { success: false, error: "Wallet approval signature could not be verified" },
          { status: 400 }
        );
      }
      const rendererParams = rendererParamsObject as Prisma.InputJsonObject;
      const hybridStatus = input.hybrid_status || CPEG_HYBRID_STATUS_READY;
      // Resolve the Clawdmint agent associated with this launch wallet so the
      // hybrid setup/capture/release endpoints can sign with the agent operational
      // wallet. We never read the secret key here; we just persist the agent.id
      // foreign key. Setup endpoints load the encrypted key on demand.
      // Match on the agent identity persisted in the launch payload first
      // (agentAssetAddress is unique on the Agent table) and fall back to wallet
      // matches. This keeps launches signed with a wallet that does not exactly
      // equal the agent ownerWalletAddress still linkable, which is the common
      // case once the operator switches between wallets owned by the same user.
      const linkedAgentOr: Array<Record<string, string>> = [];
      if (agentRoot.agentAssetAddress) {
        linkedAgentOr.push({ metaplexAssetAddress: agentRoot.agentAssetAddress });
      }
      if (agentRoot.agentWalletAddress) {
        linkedAgentOr.push({ solanaWalletAddress: agentRoot.agentWalletAddress });
      }
      linkedAgentOr.push({ solanaWalletAddress: authorityAddress });
      linkedAgentOr.push({ ownerWalletAddress: authorityAddress });
      const linkedAgent = await prisma.agent
        .findFirst({
          where: {
            status: "VERIFIED",
            deployEnabled: true,
            metaplexAssetAddress: { not: null },
            OR: linkedAgentOr,
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })
        .catch(() => null);
      const saved = await prisma.clawPegLaunch.upsert({
        where: { tokenMint: tokenMint.toBase58() },
        update: {
          name: input.name,
          symbol: input.symbol,
          collectionAddress: null,
          hookValidationAddress: null,
          hookProgramId: input.hybrid_program_id || null,
          chain: cluster === "devnet" ? "solana-devnet" : "solana",
          cluster,
          rendererHash,
          collectionSeed: input.collection_seed || rendererHash.slice(0, 64),
          pegUnitRaw: input.peg_unit_raw || input.hybrid_swap_amount_raw || "1000000",
          maxPegs: input.max_pegs || 1000,
          royaltyBps: input.royalty_bps ?? 200,
          marketplaceFeeBps: input.marketplace_fee_bps ?? 200,
          launchFeeLamports: input.launch_fee_lamports || input.hybrid_capture_fee_lamports || "0",
          authorityAddress,
          creatorAddress: input.creator_address || authorityAddress,
          feeVaultAddress: input.fee_vault_address || authorityAddress,
          deployTxHash: input.signature || null,
          rendererParams,
          identityMode: agentRoot.identityMode,
          standardMode: CPEG_STANDARD_MODE_METAPLEX_HYBRID,
          canonicalRoot: agentRoot.canonicalRoot,
          agentAssetAddress: agentRoot.agentAssetAddress,
          agentIdentityPda: agentRoot.agentIdentityPda,
          agentCollectionAddress: agentRoot.agentCollectionAddress,
          agentWalletAddress: agentRoot.agentWalletAddress,
          agentRegistryProgramId: agentRoot.registryProgramId,
          identityLink: agentRoot as unknown as Prisma.InputJsonValue,
          agentTokenMint: tokenMint.toBase58(),
          tokenLaunchId: input.agent_token_launch_id || null,
          hybridProgramId: input.hybrid_program_id || null,
          hybridEscrowAddress: input.hybrid_escrow_address || null,
          hybridCoreCollectionAddress: input.hybrid_core_collection_address || agentRoot.agentCollectionAddress,
          hybridAssetCollectionAddress: input.hybrid_asset_collection_address || null,
          hybridSwapAmountRaw: input.hybrid_swap_amount_raw || input.peg_unit_raw || "1000000",
          hybridCaptureFeeLamports: input.hybrid_capture_fee_lamports || input.launch_fee_lamports || "0",
          hybridReroll: input.hybrid_reroll ?? true,
          hybridStatus,
          hybridPlan: (input.hybrid_plan || {}) as Prisma.InputJsonObject,
          status: "HYBRID_READY",
          launchedAt: new Date(),
          ...(linkedAgent ? { agentId: linkedAgent.id } : {}),
        },
        create: {
          name: input.name,
          symbol: input.symbol,
          tokenMint: tokenMint.toBase58(),
          collectionAddress: null,
          hookValidationAddress: null,
          hookProgramId: input.hybrid_program_id || null,
          chain: cluster === "devnet" ? "solana-devnet" : "solana",
          cluster,
          rendererId,
          rendererVersion,
          rendererHash,
          collectionSeed: input.collection_seed || rendererHash.slice(0, 64),
          rendererParams,
          identityMode: agentRoot.identityMode,
          standardMode: CPEG_STANDARD_MODE_METAPLEX_HYBRID,
          canonicalRoot: agentRoot.canonicalRoot,
          agentAssetAddress: agentRoot.agentAssetAddress,
          agentIdentityPda: agentRoot.agentIdentityPda,
          agentCollectionAddress: agentRoot.agentCollectionAddress,
          agentWalletAddress: agentRoot.agentWalletAddress,
          agentRegistryProgramId: agentRoot.registryProgramId,
          identityLink: agentRoot as unknown as Prisma.InputJsonValue,
          agentTokenMint: tokenMint.toBase58(),
          tokenLaunchId: input.agent_token_launch_id || null,
          hybridProgramId: input.hybrid_program_id || null,
          hybridEscrowAddress: input.hybrid_escrow_address || null,
          hybridCoreCollectionAddress: input.hybrid_core_collection_address || agentRoot.agentCollectionAddress,
          hybridAssetCollectionAddress: input.hybrid_asset_collection_address || null,
          hybridSwapAmountRaw: input.hybrid_swap_amount_raw || input.peg_unit_raw || "1000000",
          hybridCaptureFeeLamports: input.hybrid_capture_fee_lamports || input.launch_fee_lamports || "0",
          hybridReroll: input.hybrid_reroll ?? true,
          hybridStatus,
          hybridPlan: (input.hybrid_plan || {}) as Prisma.InputJsonObject,
          pegUnitRaw: input.peg_unit_raw || input.hybrid_swap_amount_raw || "1000000",
          maxPegs: input.max_pegs || 1000,
          royaltyBps: input.royalty_bps ?? 200,
          marketplaceFeeBps: input.marketplace_fee_bps ?? 200,
          launchFeeLamports: input.launch_fee_lamports || input.hybrid_capture_fee_lamports || "0",
          authorityAddress,
          creatorAddress: input.creator_address || authorityAddress,
          feeVaultAddress: input.fee_vault_address || authorityAddress,
          deployTxHash: input.signature || null,
          status: "HYBRID_READY",
          launchedAt: new Date(),
          ...(linkedAgent ? { agentId: linkedAgent.id } : {}),
        },
      });

      return NextResponse.json({
        success: true,
        launch: {
          id: saved.id,
          name: saved.name,
          symbol: saved.symbol,
          token_mint: saved.tokenMint,
          collection_address: saved.collectionAddress,
          hook_validation_address: saved.hookValidationAddress,
          standard_mode: saved.standardMode,
          hybrid_status: saved.hybridStatus,
          agent_token_mint: saved.agentTokenMint,
          identity_mode: saved.identityMode,
          canonical_root: saved.canonicalRoot,
          agent_asset_address: saved.agentAssetAddress,
          agent_identity_pda: saved.agentIdentityPda,
          tx_hash: saved.deployTxHash,
          status: saved.status,
        },
      });
    }

    const programId = getClawPegProgramId();
    if (!input.collection_address || !input.hook_validation_address) {
      return NextResponse.json(
        { success: false, error: "collection_address and hook_validation_address are required for custom registry launches" },
        { status: 400 }
      );
    }

    const collectionAddress = new PublicKey(input.collection_address);
    const hookValidationAddress = new PublicKey(input.hook_validation_address);
    const tokenMint = new PublicKey(input.token_mint);
    const collectionAccount = await connection.getAccountInfo(collectionAddress, "confirmed");
    const validationAccount = await connection.getAccountInfo(hookValidationAddress, "confirmed");

    if (!collectionAccount || !collectionAccount.owner.equals(programId)) {
      return NextResponse.json(
        { success: false, error: "Collection account is missing or not owned by the cPEG program" },
        { status: 400 }
      );
    }
    if (!validationAccount || !validationAccount.owner.equals(programId)) {
      return NextResponse.json(
        { success: false, error: "Hook validation account is missing or not owned by the cPEG program" },
        { status: 400 }
      );
    }

    const collection = parsePegCollection(Buffer.from(collectionAccount.data));
    if (!collection.tokenMint.equals(tokenMint)) {
      return NextResponse.json(
        { success: false, error: "Collection account token mint does not match request" },
        { status: 400 }
      );
    }

    const rendererId = input.renderer_id || CLAWPEG_DEFAULT_RENDERER_ID;
    const rendererVersion = input.renderer_version || CLAWPEG_DEFAULT_RENDERER_VERSION;
    const rendererParamsObject = (input.renderer_params || {}) as Record<string, unknown>;
    const agentRoot = normalizeCpegAgentRootLink({
      identityMode: input.identity_mode,
      agentAssetAddress: input.agent_asset_address || (rendererParamsObject.agentAsset as string | undefined),
      agentIdentityPda: input.agent_identity_pda || (rendererParamsObject.agentIdentity as string | undefined),
      agentCollectionAddress: input.agent_collection_address || (rendererParamsObject.agentCollection as string | undefined),
      agentWalletAddress: input.agent_wallet_address || (rendererParamsObject.agentWallet as string | undefined),
      agentName: input.agent_name,
    });
    const rendererVerification = verifyClawPegRendererHash({
      hash: collection.rendererHash,
      id: rendererId,
      version: rendererVersion,
      params: rendererParamsObject,
    });
    if (!rendererVerification.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            rendererVerification.reason ||
            "On-chain renderer hash does not match the published renderer manifest",
          expected_hash: rendererVerification.expectedHash,
          on_chain_hash: collection.rendererHash,
        },
        { status: 400 }
      );
    }
    const rendererParams = rendererParamsObject as Prisma.InputJsonObject;
    const saved = await prisma.clawPegLaunch.upsert({
      where: { tokenMint: tokenMint.toBase58() },
      update: {
        name: input.name,
        symbol: input.symbol,
        collectionAddress: collectionAddress.toBase58(),
        hookValidationAddress: hookValidationAddress.toBase58(),
        hookProgramId: programId.toBase58(),
        chain: cluster === "devnet" ? "solana-devnet" : "solana",
        cluster,
        rendererHash: collection.rendererHash,
        collectionSeed: collection.collectionSeed,
        pegUnitRaw: collection.pegUnitRaw,
        maxPegs: collection.maxPegs,
        royaltyBps: collection.royaltyBps,
        marketplaceFeeBps: collection.marketplaceFeeBps,
        launchFeeLamports: collection.launchFeeLamports,
        authorityAddress: collection.authority.toBase58(),
        creatorAddress: collection.creator.toBase58(),
        feeVaultAddress: collection.feeVault.toBase58(),
        deployTxHash: input.signature || null,
        rendererParams,
        identityMode: agentRoot.identityMode,
        canonicalRoot: agentRoot.canonicalRoot,
        agentAssetAddress: agentRoot.agentAssetAddress,
        agentIdentityPda: agentRoot.agentIdentityPda,
        agentCollectionAddress: agentRoot.agentCollectionAddress,
        agentWalletAddress: agentRoot.agentWalletAddress,
        agentRegistryProgramId: agentRoot.registryProgramId,
        identityLink: agentRoot as unknown as Prisma.InputJsonValue,
        status: "LAUNCHED",
        launchedAt: new Date(),
      },
      create: {
        name: input.name,
        symbol: input.symbol,
        tokenMint: tokenMint.toBase58(),
        collectionAddress: collectionAddress.toBase58(),
        hookValidationAddress: hookValidationAddress.toBase58(),
        hookProgramId: programId.toBase58(),
        chain: cluster === "devnet" ? "solana-devnet" : "solana",
        cluster,
        rendererId,
        rendererVersion,
        rendererHash: collection.rendererHash,
        collectionSeed: collection.collectionSeed,
        rendererParams,
        identityMode: agentRoot.identityMode,
        canonicalRoot: agentRoot.canonicalRoot,
        agentAssetAddress: agentRoot.agentAssetAddress,
        agentIdentityPda: agentRoot.agentIdentityPda,
        agentCollectionAddress: agentRoot.agentCollectionAddress,
        agentWalletAddress: agentRoot.agentWalletAddress,
        agentRegistryProgramId: agentRoot.registryProgramId,
        identityLink: agentRoot as unknown as Prisma.InputJsonValue,
        pegUnitRaw: collection.pegUnitRaw,
        maxPegs: collection.maxPegs,
        royaltyBps: collection.royaltyBps,
        marketplaceFeeBps: collection.marketplaceFeeBps,
        launchFeeLamports: collection.launchFeeLamports,
        authorityAddress: collection.authority.toBase58(),
        creatorAddress: collection.creator.toBase58(),
        feeVaultAddress: collection.feeVault.toBase58(),
        deployTxHash: input.signature || null,
        status: "LAUNCHED",
        launchedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      launch: {
        id: saved.id,
        name: saved.name,
        symbol: saved.symbol,
        token_mint: saved.tokenMint,
        collection_address: saved.collectionAddress,
        hook_validation_address: saved.hookValidationAddress,
        identity_mode: saved.identityMode,
        canonical_root: saved.canonicalRoot,
        agent_asset_address: saved.agentAssetAddress,
        agent_identity_pda: saved.agentIdentityPda,
        tx_hash: saved.deployTxHash,
        status: saved.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm cPEG launch";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
