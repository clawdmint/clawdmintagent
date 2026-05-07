import { Connection, PublicKey } from "@solana/web3.js";
import type { Prisma } from "@prisma/client";
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

export const dynamic = "force-dynamic";

const PEG_COLLECTION_SIZE = 228;

const ConfirmSchema = z.object({
  name: z.string().min(1).max(48).default("Claw Agent PEG"),
  symbol: z.string().min(1).max(12).default("CPEG"),
  signature: z.string().min(32).optional(),
  token_mint: z.string().min(32),
  collection_address: z.string().min(32),
  hook_validation_address: z.string().min(32),
  renderer_id: z.string().min(1).optional(),
  renderer_version: z.string().min(1).optional(),
  renderer_params: z.record(z.unknown()).optional(),
  identity_mode: z.enum(["standalone", "metaplex_agent"]).default("standalone"),
  agent_asset_address: z.string().min(32).optional(),
  agent_identity_pda: z.string().min(32).optional(),
  agent_collection_address: z.string().min(32).optional(),
  agent_wallet_address: z.string().min(32).optional(),
  agent_name: z.string().max(80).optional(),
});

function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
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
    const programId = getClawPegProgramId();
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
