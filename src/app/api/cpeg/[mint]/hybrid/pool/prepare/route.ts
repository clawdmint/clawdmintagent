import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { create as createCoreAsset, mplCore, safeFetchCollectionV1 } from "@metaplex-foundation/mpl-core";
import { createNoopSigner, createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
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
import { loadHybridAssetCounts, loadHybridLaunchAndAgent, listHybridAssetPegIds } from "@/lib/cpeg-hybrid-loader";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import {
  MPL_HYBRID_PATH_NO_REROLL_METADATA,
  createInitNftDataV1Instruction,
  deriveMplHybridNftDataPda,
} from "@/lib/mpl-hybrid-native";
import { getMetaplexCoreConnection } from "@/lib/synapse-sap";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  authority_address: z.string().min(32),
  count: z.number().int().min(1).max(3).default(1),
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

function findNextPegId(taken: Set<number>, maxPegs: number) {
  const cap = Math.max(1, Math.min(10_000, maxPegs || 1));
  for (let id = 1; id <= cap; id += 1) {
    if (!taken.has(id)) return id;
  }
  return null;
}

function buildAssetMetadata(input: { symbol: string; tokenMint: string; pegId: number }) {
  const base = getCpegBaseUrl();
  return {
    name: `${input.symbol} cPEG #${input.pegId}`,
    uri: `${base}/api/cpeg/${input.tokenMint}/pegs/${input.pegId}`,
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
        { success: false, error: "Pool funding is only available for Metaplex hybrid launches" },
        { status: 400 }
      );
    }
    if (data.launch.cluster !== "mainnet-beta") {
      return NextResponse.json(
        { success: false, error: "Agent PEG pool funding is mainnet-only." },
        { status: 409 }
      );
    }
    if (data.launch.hybridStatus !== CPEG_HYBRID_STATUS_CONFIGURED) {
      return NextResponse.json(
        { success: false, error: "Run Enable cPEG before funding the Agent PEG pool." },
        { status: 409 }
      );
    }
    if (parsed.data.authority_address !== data.launch.authorityAddress) {
      return NextResponse.json(
        { success: false, error: "authority_address does not match the launch authority" },
        { status: 403 }
      );
    }
    if (!data.launch.hybridCoreCollectionAddress || !data.launch.hybridEscrowAddress) {
      return NextResponse.json(
        { success: false, error: "Metaplex Hybrid collection or escrow is missing." },
        { status: 409 }
      );
    }

    const authority = new PublicKey(parsed.data.authority_address);
    const counts = await loadHybridAssetCounts(data.launch.id);
    const summary = await buildHybridStateSummary(data.agent, data.launch, counts);
    const custody = getMplHybridCustodyTarget(data.launch, summary.tokenProgramId);
    if (!custody.isNativeReady || !custody.escrowAddress || !summary.hybridEscrowAccountInitialized) {
      return NextResponse.json(
        { success: false, error: "Metaplex Hybrid escrow is not initialized yet." },
        { status: 409 }
      );
    }
    if (!summary.tokenProgramId) {
      return NextResponse.json(
        { success: false, error: "Agent token mint is not available on mainnet yet." },
        { status: 409 }
      );
    }

    const taken = await listHybridAssetPegIds(data.launch.id);
    const pegIds: number[] = [];
    for (let index = 0; index < parsed.data.count; index += 1) {
      const next = findNextPegId(taken, summary.effectiveMaxPegs || data.launch.maxPegs);
      if (!next) break;
      taken.add(next);
      pegIds.push(next);
    }
    if (pegIds.length !== parsed.data.count) {
      return NextResponse.json(
        {
          success: false,
          error: "No free Agent PEG ids remain for this launch.",
          details: { requested: parsed.data.count, available_ids: pegIds.length },
        },
        { status: 409 }
      );
    }

    const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
    const umi = createUmi(connection.rpcEndpoint);
    umi.use(mplCore());
    const authoritySigner = createNoopSigner(publicKey(authority.toBase58()));
    umi.use(signerIdentity(authoritySigner));
    const collection = await safeFetchCollectionV1(umi, publicKey(data.launch.hybridCoreCollectionAddress));
    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Metaplex Core Agent PEG collection is not present on-chain." },
        { status: 409 }
      );
    }

    const tokenMint = new PublicKey(data.launch.agentTokenMint || data.launch.tokenMint);
    const feeLocation = (() => {
      try {
        return new PublicKey(data.launch.feeVaultAddress || parsed.data.authority_address);
      } catch {
        return authority;
      }
    })();
    const assetKeypairs: InstanceType<typeof Keypair>[] = [];
    const assets: Array<{ asset_address: string; peg_id: number; nft_data_address: string }> = [];
    const instructions: InstanceType<typeof TransactionInstruction>[] = [];

    for (const pegId of pegIds) {
      const assetKeypair = Keypair.generate();
      assetKeypairs.push(assetKeypair);
      const assetSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(assetKeypair));
      const metadata = buildAssetMetadata({
        symbol: data.launch.symbol,
        tokenMint: data.launch.tokenMint,
        pegId,
      });
      const builder = createCoreAsset(umi, {
        asset: assetSigner,
        authority: authoritySigner,
        payer: authoritySigner,
        collection,
        owner: publicKey(custody.escrowAddress),
        name: metadata.name,
        uri: metadata.uri,
      }).useLegacyVersion();
      instructions.push(...(builder.items as unknown as UmiInstructionItem[]).map(umiItemToWeb3Instruction));

      const nftData = deriveMplHybridNftDataPda(assetKeypair.publicKey, data.launch.hybridProgramId || undefined);
      instructions.push(
        createInitNftDataV1Instruction({
          nftData,
          authority,
          asset: assetKeypair.publicKey,
          collection: data.launch.hybridCoreCollectionAddress,
          token: tokenMint,
          feeLocation,
          name: metadata.name,
          uri: metadata.uri,
          max: Math.max(1, Math.min(10_000, data.launch.maxPegs || 1)),
          min: 1,
          amount: BigInt(summary.pegUnitRaw || data.launch.pegUnitRaw || "1"),
          feeAmount: 0,
          solFeeAmount: 0,
          path: MPL_HYBRID_PATH_NO_REROLL_METADATA,
          programId: data.launch.hybridProgramId || undefined,
        })
      );
      assets.push({
        asset_address: assetKeypair.publicKey.toBase58(),
        peg_id: pegId,
        nft_data_address: nftData.toBase58(),
      });
    }

    const transaction = new Transaction();
    for (const ix of instructions) transaction.add(ix);
    const latest = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = authority;
    transaction.recentBlockhash = latest.blockhash;
    transaction.partialSign(...assetKeypairs);

    return NextResponse.json({
      success: true,
      requires_signature: true,
      pool: {
        cluster: data.launch.cluster,
        authority_address: parsed.data.authority_address,
        collection_address: data.launch.hybridCoreCollectionAddress,
        hybrid_escrow_address: custody.escrowAddress,
        count: assets.length,
        assets,
      },
      instructions: instructions.map(serializeInstruction),
      serialized_transaction_base64: transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
    });
  } catch (error) {
    if (error instanceof CpegHybridEngineError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to prepare Agent PEG pool funding";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
