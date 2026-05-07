import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMetadataPointerInstruction,
  createReallocateInstruction,
  getMint,
  getTokenMetadata,
} from "@solana/spl-token";
import {
  createInitializeInstruction as createInitializeTokenMetadataInstruction,
  createUpdateFieldInstruction as createUpdateTokenMetadataFieldInstruction,
} from "@solana/spl-token-metadata";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getClawPegRpcUrl } from "@/lib/env";
import { getClawPegToken2022MintAccountSize } from "@/lib/clawpeg";
import { cpegAgentRootToTokenMetadata, normalizeCpegAgentRootLink } from "@/lib/cpeg-agent-root";

export const dynamic = "force-dynamic";

const PrepareSchema = z.object({
  payer: z.string().min(32),
});

interface RouteContext {
  params: { mint: string };
}

type SolanaTransactionInstruction = InstanceType<typeof TransactionInstruction>;

function instructionToManifest(instruction: SolanaTransactionInstruction) {
  return {
    programId: instruction.programId.toBase58(),
    accounts: instruction.keys.map((account: SolanaTransactionInstruction["keys"][number]) => ({
      pubkey: account.pubkey.toBase58(),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    dataBase64: Buffer.from(instruction.data).toString("base64"),
  };
}

function getCpegMetadataUri(tokenMint: string) {
  const base =
    process.env["NEXT_PUBLIC_CPEG_APP_URL"] ||
    "https://cpeg.clawdmint.xyz";
  return `${base.replace(/\/$/, "")}/api/cpeg/${tokenMint}/metadata`;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const parsed = PrepareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      name: true,
      symbol: true,
      tokenMint: true,
      cluster: true,
      identityMode: true,
      agentAssetAddress: true,
      agentIdentityPda: true,
      agentCollectionAddress: true,
      agentWalletAddress: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ success: false, error: "cPEG launch not found" }, { status: 404 });
  }

  const mint = new PublicKey(launch.tokenMint);
  const payer = new PublicKey(parsed.data.payer);
  const connection = new Connection(getClawPegRpcUrl(), "confirmed");
  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const mintAuthority = mintInfo.mintAuthority;
  if (!mintAuthority) {
    return NextResponse.json(
      { success: false, error: "Mint authority is revoked. Token metadata cannot be initialized by this prepare route." },
      { status: 409 }
    );
  }

  const existingMetadata = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null);
  if (existingMetadata) {
    return NextResponse.json({
      success: true,
      already_initialized: true,
      metadata: {
        name: existingMetadata.name,
        symbol: existingMetadata.symbol,
        uri: existingMetadata.uri,
      },
      instructions: [],
    });
  }

  const metadataUri = getCpegMetadataUri(launch.tokenMint);
  const agentRoot = normalizeCpegAgentRootLink({
    identityMode: launch.identityMode,
    agentAssetAddress: launch.agentAssetAddress,
    agentIdentityPda: launch.agentIdentityPda,
    agentCollectionAddress: launch.agentCollectionAddress,
    agentWalletAddress: launch.agentWalletAddress,
  });
  const metadataEntries = cpegAgentRootToTokenMetadata(agentRoot);
  const targetSize = getClawPegToken2022MintAccountSize({
    mint: launch.tokenMint,
    updateAuthority: mintAuthority.toBase58(),
    name: launch.name,
    symbol: launch.symbol,
    metadataUri,
    additionalMetadata: metadataEntries,
  });
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");
  if (!mintAccount) {
    return NextResponse.json({ success: false, error: "Mint account not found" }, { status: 404 });
  }
  const rentNeeded = await connection.getMinimumBalanceForRentExemption(targetSize);
  const extraRentLamports = Math.max(0, rentNeeded - mintAccount.lamports);

  const instructions: SolanaTransactionInstruction[] = [];
  if (extraRentLamports > 0) {
    instructions.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: mint, lamports: extraRentLamports }));
  }
  instructions.push(
    createReallocateInstruction(
      mint,
      payer,
      [ExtensionType.MetadataPointer],
      mintAuthority,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMetadataPointerInstruction(mint, mintAuthority, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeTokenMetadataInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: mintAuthority,
      mint,
      mintAuthority,
      name: launch.name,
      symbol: launch.symbol,
      uri: metadataUri,
    })
  );
  for (const [field, value] of metadataEntries) {
    instructions.push(
      createUpdateTokenMetadataFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: mintAuthority,
        field,
        value,
      })
    );
  }

  return NextResponse.json({
    success: true,
    token_mint: launch.tokenMint,
    metadata_uri: metadataUri,
    target_mint_account_size: targetSize,
    extra_rent_lamports: extraRentLamports.toString(),
    mint_authority: mintAuthority.toBase58(),
    instructions: instructions.map(instructionToManifest),
  });
}
