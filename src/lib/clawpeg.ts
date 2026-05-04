import { Buffer } from "buffer";
import { createHash, randomBytes } from "crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
} from "@solana/spl-token";
import {
  createInitializeInstruction as createInitializeTokenMetadataInstruction,
  pack as packTokenMetadata,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { getEnv } from "@/lib/env";

const CPEG_TAG_OFFSET = 100;
const INITIALIZE_COLLECTION_DISCRIMINATOR = CPEG_TAG_OFFSET;
const INITIALIZE_OWNER_PEG_DISCRIMINATOR = CPEG_TAG_OFFSET + 1;
const SYNC_PEG_DISCRIMINATOR = CPEG_TAG_OFFSET + 2;
const TRANSFER_PEG_DISCRIMINATOR = CPEG_TAG_OFFSET + 3;
const MINT_PEG_DISCRIMINATOR = CPEG_TAG_OFFSET + 6;
const RECORD_TRADE_ART_DISCRIMINATOR = CPEG_TAG_OFFSET + 7;
const LIST_PEG_ESCROW_DISCRIMINATOR = CPEG_TAG_OFFSET + 8;
const BUY_PEG_ESCROW_DISCRIMINATOR = CPEG_TAG_OFFSET + 9;
const CANCEL_PEG_ESCROW_DISCRIMINATOR = CPEG_TAG_OFFSET + 10;
const INITIALIZE_TRANSFER_HOOK_ACCOUNTS_DISCRIMINATOR = CPEG_TAG_OFFSET + 5;
const U16_MAX_BPS = 10_000;

export const CLAWPEG_DEFAULT_RENDERER_ID = "clawpeg-agent-pixel";
export const CLAWPEG_DEFAULT_RENDERER_VERSION = "0.3.0";

export interface ClawPegRevenueConfig {
  launchFeeLamports: bigint;
  marketplaceFeeBps: number;
  creatorRoyaltyBps: number;
  premiumIndexingLamports: bigint;
  partnerApiLamports: bigint;
  whiteLabelLamports: bigint;
}

export interface ClawPegLaunchParams {
  authority: string;
  tokenMint: string;
  creatorAddress: string;
  feeVaultAddress: string;
  rendererHash: string;
  collectionSeed: string;
  pegUnitRaw: bigint;
  maxPegs: number;
  decimals: number;
  royaltyBps: number;
  marketplaceFeeBps: number;
  launchFeeLamports: bigint;
  premiumIndexing?: boolean;
}

export interface ClawPegManifestAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface ClawPegInstructionManifest {
  programId: string;
  accounts: ClawPegManifestAccount[];
  dataBase64: string;
}

export interface ClawPegToken2022MintSetupParams {
  payer: string;
  mint: string;
  mintAuthority: string;
  freezeAuthority?: string | null;
  decimals: number;
  rentLamports: string | number;
  baseRentLamports?: string | number;
  name?: string;
  symbol?: string;
  metadataUri?: string;
}

export interface ClawPegToken2022MintSetupManifest {
  token_program_id: string;
  mint_account_size: number;
  final_mint_account_size?: number;
  rent_lamports: string;
  metadata_extra_rent_lamports?: string;
  metadata_uri?: string;
  instructions: ClawPegInstructionManifest[];
}

export interface ClawPegTransferPegParams {
  sourceOwner: string;
  destinationOwner: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  tokenMint: string;
  pegId: number;
}

export interface ClawPegMintPegParams {
  payer: string;
  owner: string;
  ownerTokenAccount: string;
  tokenMint: string;
  pegId: number;
}

export interface ClawPegRecordTradeArtParams {
  payer: string;
  trader: string;
  tokenMint: string;
  inputMint: string;
  outputMint: string;
  tradeIndex: bigint;
  amountIn: bigint;
  amountOut: bigint;
}

export interface ClawPegListPegEscrowParams {
  seller: string;
  tokenMint: string;
  sellerTokenAccount: string;
  escrowTokenAccount: string;
  pegId: number;
  priceLamports: bigint;
}

export interface ClawPegBuyPegEscrowParams {
  buyer: string;
  seller: string;
  creator: string;
  feeVault: string;
  tokenMint: string;
  buyerTokenAccount: string;
  escrowTokenAccount: string;
  pegId: number;
}

export interface ClawPegCancelPegEscrowParams {
  seller: string;
  tokenMint: string;
  sellerTokenAccount: string;
  escrowTokenAccount: string;
  pegId: number;
}

export interface ClawPegOwnerPegParams {
  payer: string;
  owner: string;
  tokenMint: string;
}

export interface ClawPegSyncPegParams {
  owner: string;
  ownerTokenAccount: string;
  tokenMint: string;
}

export interface ClawPegLaunchManifest {
  chain: "solana" | "solana-devnet";
  cluster: "mainnet-beta" | "devnet";
  program_id: string;
  token_mint: string;
  collection_address: string;
  hook_validation_address: string;
  authority: string;
  instructions: ClawPegInstructionManifest[];
}

export function getClawPegRevenueConfig(): ClawPegRevenueConfig {
  return {
    launchFeeLamports: BigInt(getEnv("CLAWPEG_LAUNCH_FEE_LAMPORTS", "0")),
    marketplaceFeeBps: parseInt(getEnv("CLAWPEG_MARKETPLACE_FEE_BPS", "200"), 10),
    creatorRoyaltyBps: parseInt(getEnv("CLAWPEG_DEFAULT_CREATOR_ROYALTY_BPS", "500"), 10),
    premiumIndexingLamports: BigInt(getEnv("CLAWPEG_PREMIUM_INDEXING_FEE_LAMPORTS", "0")),
    partnerApiLamports: BigInt(getEnv("CLAWPEG_PARTNER_API_FEE_LAMPORTS", "0")),
    whiteLabelLamports: BigInt(getEnv("CLAWPEG_WHITE_LABEL_FEE_LAMPORTS", "0")),
  };
}

export function getClawPegCluster(): "mainnet-beta" | "devnet" {
  // Allow cPEG to live on a different cluster than the rest of Clawdmint (e.g. cPEG on devnet
  // while the collection program / NFT mints stay on mainnet). The dedicated override wins;
  // otherwise fall back to the global Solana cluster.
  const explicit = getEnv("NEXT_PUBLIC_CLAWPEG_CLUSTER", "").trim();
  if (explicit === "devnet" || explicit === "mainnet-beta") {
    return explicit;
  }
  return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet" ? "devnet" : "mainnet-beta";
}

export function getClawPegProgramId(): InstanceType<typeof PublicKey> {
  const programId = getEnv("CLAWPEG_PROGRAM_ID", getEnv("NEXT_PUBLIC_CLAWPEG_PROGRAM_ID", ""));
  if (!programId) {
    throw new Error("CLAWPEG_PROGRAM_ID not configured");
  }
  return new PublicKey(programId);
}

export function getCpegMarketProgramId(): InstanceType<typeof PublicKey> {
  const programId = getEnv("CPEG_MARKET_PROGRAM_ID", getEnv("NEXT_PUBLIC_CPEG_MARKET_PROGRAM_ID", ""));
  if (!programId) {
    throw new Error("CPEG_MARKET_PROGRAM_ID not configured");
  }
  return new PublicKey(programId);
}

export function getClawPegFeeVaultAddress(): string {
  return getEnv("CLAWPEG_FEE_VAULT_ADDRESS", getEnv("SOLANA_PLATFORM_FEE_RECIPIENT", ""));
}

export function createRendererHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createCollectionSeed(): string {
  return randomBytes(32).toString("hex");
}

export function normalizeHex32(value: string, label: string): Buffer {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex string`);
  }
  return Buffer.from(normalized, "hex");
}

function encodeU8(value: number): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(value, 0);
  return buffer;
}

function encodeU16(value: number): Buffer {
  if (value < 0 || value > U16_MAX_BPS) {
    throw new Error("basis points must be between 0 and 10000");
  }
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function encodeU32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function encodeU64(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value, 0);
  return buffer;
}

function instructionToManifest(instruction: InstanceType<typeof TransactionInstruction>): ClawPegInstructionManifest {
  return {
    programId: instruction.programId.toBase58(),
    accounts: instruction.keys.map(
      (key: { pubkey: InstanceType<typeof PublicKey>; isSigner: boolean; isWritable: boolean }) => ({
        pubkey: key.pubkey.toBase58(),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })
    ),
    dataBase64: Buffer.from(instruction.data).toString("base64"),
  };
}

export function findClawPegCollectionAddress(tokenMint: string): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cpeg", "utf8"), new PublicKey(tokenMint).toBuffer()],
    getClawPegProgramId()
  )[0];
}

export function findClawPegHookValidationAddress(tokenMint: string): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas", "utf8"), new PublicKey(tokenMint).toBuffer()],
    getClawPegProgramId()
  )[0];
}

export function findOwnerPegAddress(collectionAddress: string, owner: string): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("owner-peg", "utf8"), new PublicKey(collectionAddress).toBuffer(), new PublicKey(owner).toBuffer()],
    getClawPegProgramId()
  )[0];
}

export function findPegRecordAddress(collectionAddress: string, pegId: number): InstanceType<typeof PublicKey> {
  const pegIdBytes = Buffer.alloc(4);
  pegIdBytes.writeUInt32LE(pegId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("peg", "utf8"), new PublicKey(collectionAddress).toBuffer(), pegIdBytes],
    getClawPegProgramId()
  )[0];
}

export function findTradeArtRecordAddress(collectionAddress: string, tradeIndex: bigint): InstanceType<typeof PublicKey> {
  const tradeIndexBytes = Buffer.alloc(8);
  tradeIndexBytes.writeBigUInt64LE(tradeIndex, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trade-art", "utf8"), new PublicKey(collectionAddress).toBuffer(), tradeIndexBytes],
    getClawPegProgramId()
  )[0];
}

export function findMarketListingAddress(collectionAddress: string, pegId: number): InstanceType<typeof PublicKey> {
  const pegIdBytes = Buffer.alloc(4);
  pegIdBytes.writeUInt32LE(pegId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("listing", "utf8"), new PublicKey(collectionAddress).toBuffer(), pegIdBytes],
    getCpegMarketProgramId()
  )[0];
}

export function serializeClawPegTransferPegInstruction(pegId: number): Buffer {
  return Buffer.concat([Buffer.from([TRANSFER_PEG_DISCRIMINATOR]), encodeU32(pegId)]);
}

export function serializeClawPegMintPegInstruction(pegId: number): Buffer {
  return Buffer.concat([Buffer.from([MINT_PEG_DISCRIMINATOR]), encodeU32(pegId)]);
}

export function serializeClawPegRecordTradeArtInstruction(params: {
  tradeIndex: bigint;
  amountIn: bigint;
  amountOut: bigint;
}): Buffer {
  return Buffer.concat([
    Buffer.from([RECORD_TRADE_ART_DISCRIMINATOR]),
    encodeU64(params.tradeIndex),
    encodeU64(params.amountIn),
    encodeU64(params.amountOut),
  ]);
}

export function serializeClawPegListPegEscrowInstruction(pegId: number, priceLamports: bigint): Buffer {
  return Buffer.concat([
    Buffer.from([LIST_PEG_ESCROW_DISCRIMINATOR]),
    encodeU32(pegId),
    encodeU64(priceLamports),
  ]);
}

export function serializeClawPegBuyPegEscrowInstruction(pegId: number): Buffer {
  return Buffer.concat([Buffer.from([BUY_PEG_ESCROW_DISCRIMINATOR]), encodeU32(pegId)]);
}

export function serializeClawPegCancelPegEscrowInstruction(pegId: number): Buffer {
  return Buffer.concat([Buffer.from([CANCEL_PEG_ESCROW_DISCRIMINATOR]), encodeU32(pegId)]);
}

export function serializeClawPegInitializeOwnerPegInstruction(): Buffer {
  return Buffer.from([INITIALIZE_OWNER_PEG_DISCRIMINATOR]);
}

export function serializeClawPegSyncPegInstruction(): Buffer {
  return Buffer.from([SYNC_PEG_DISCRIMINATOR]);
}

export function serializeClawPegInitializeCollectionInstruction(params: ClawPegLaunchParams): Buffer {
  return Buffer.concat([
    Buffer.from([INITIALIZE_COLLECTION_DISCRIMINATOR]),
    normalizeHex32(params.rendererHash, "rendererHash"),
    normalizeHex32(params.collectionSeed, "collectionSeed"),
    encodeU64(params.pegUnitRaw),
    encodeU32(params.maxPegs),
    encodeU16(params.royaltyBps),
    encodeU64(params.launchFeeLamports),
    encodeU16(params.marketplaceFeeBps),
    encodeU8(params.premiumIndexing ? 1 : 0),
    encodeU8(params.decimals),
  ]);
}

export function serializeClawPegInitializeTransferHookAccountsInstruction(): Buffer {
  return Buffer.from([INITIALIZE_TRANSFER_HOOK_ACCOUNTS_DISCRIMINATOR]);
}

function hasTokenMetadataParams(params: ClawPegToken2022MintSetupParams) {
  return Boolean(params.name && params.symbol && params.metadataUri);
}

export function buildClawPegTokenMetadata(params: {
  mint: string;
  updateAuthority: string;
  name: string;
  symbol: string;
  uri: string;
}): TokenMetadata {
  return {
    updateAuthority: new PublicKey(params.updateAuthority),
    mint: new PublicKey(params.mint),
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    additionalMetadata: [
      ["standard", "cPEG"],
      ["standard_version", "0.1"],
    ],
  };
}

export function getClawPegToken2022MintAccountSize(params?: {
  mint?: string;
  updateAuthority?: string;
  name?: string;
  symbol?: string;
  metadataUri?: string;
}): number {
  if (params?.mint && params.updateAuthority && params.name && params.symbol && params.metadataUri) {
    const metadata = buildClawPegTokenMetadata({
      mint: params.mint,
      updateAuthority: params.updateAuthority,
      name: params.name,
      symbol: params.symbol,
      uri: params.metadataUri,
    });
    return getMintLen(
      [ExtensionType.TransferHook, ExtensionType.MetadataPointer],
      { [ExtensionType.TokenMetadata]: packTokenMetadata(metadata).length }
    );
  }
  return getMintLen([ExtensionType.TransferHook]);
}

export function getClawPegToken2022CreateAccountSize(hasMetadata = false): number {
  return getMintLen(
    hasMetadata
      ? [ExtensionType.TransferHook, ExtensionType.MetadataPointer]
      : [ExtensionType.TransferHook]
  );
}

export function buildClawPegToken2022MintSetupManifest(
  params: ClawPegToken2022MintSetupParams
): ClawPegToken2022MintSetupManifest {
  const payer = new PublicKey(params.payer);
  const mint = new PublicKey(params.mint);
  const mintAuthority = new PublicKey(params.mintAuthority);
  const freezeAuthority = params.freezeAuthority ? new PublicKey(params.freezeAuthority) : null;
  const programId = getClawPegProgramId();
  const tokenMetadata = hasTokenMetadataParams(params)
    ? buildClawPegTokenMetadata({
        mint: params.mint,
        updateAuthority: params.mintAuthority,
        name: params.name as string,
        symbol: params.symbol as string,
        uri: params.metadataUri as string,
      })
    : null;
  const mintAccountSize = getClawPegToken2022CreateAccountSize(Boolean(tokenMetadata));
  const finalMintAccountSize = tokenMetadata
    ? getMintLen(
        [ExtensionType.TransferHook, ExtensionType.MetadataPointer],
        { [ExtensionType.TokenMetadata]: packTokenMetadata(tokenMetadata).length }
      )
    : mintAccountSize;
  const rentLamports =
    typeof params.rentLamports === "number" ? params.rentLamports : Number(params.rentLamports);
  const baseRentLamports =
    params.baseRentLamports === undefined
      ? rentLamports
      : typeof params.baseRentLamports === "number"
        ? params.baseRentLamports
        : Number(params.baseRentLamports);
  const metadataExtraRentLamports = Math.max(0, rentLamports - baseRentLamports);

  if (!Number.isSafeInteger(rentLamports) || rentLamports <= 0) {
    throw new Error("rentLamports must be a positive safe integer");
  }
  if (!Number.isSafeInteger(baseRentLamports) || baseRentLamports <= 0) {
    throw new Error("baseRentLamports must be a positive safe integer");
  }

  const instructions = [
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      space: mintAccountSize,
      lamports: baseRentLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    ...(tokenMetadata
      ? [createInitializeMetadataPointerInstruction(mint, payer, mint, TOKEN_2022_PROGRAM_ID)]
      : []),
    createInitializeTransferHookInstruction(mint, payer, programId, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, params.decimals, mintAuthority, freezeAuthority, TOKEN_2022_PROGRAM_ID),
    ...(tokenMetadata && metadataExtraRentLamports > 0
      ? [
          SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: mint,
            lamports: metadataExtraRentLamports,
          }),
        ]
      : []),
    ...(tokenMetadata
      ? [
          createInitializeTokenMetadataInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mint,
            updateAuthority: mintAuthority,
            mint,
            mintAuthority,
            name: tokenMetadata.name,
            symbol: tokenMetadata.symbol,
            uri: tokenMetadata.uri,
          }),
        ]
      : []),
  ];

  return {
    token_program_id: TOKEN_2022_PROGRAM_ID.toBase58(),
    mint_account_size: mintAccountSize,
    ...(finalMintAccountSize !== mintAccountSize ? { final_mint_account_size: finalMintAccountSize } : {}),
    rent_lamports: rentLamports.toString(),
    ...(metadataExtraRentLamports > 0
      ? { metadata_extra_rent_lamports: metadataExtraRentLamports.toString() }
      : {}),
    ...(tokenMetadata ? { metadata_uri: tokenMetadata.uri } : {}),
    instructions: instructions.map(instructionToManifest),
  };
}

export function buildClawPegLaunchManifest(params: ClawPegLaunchParams): ClawPegLaunchManifest {
  const programId = getClawPegProgramId();
  const tokenMint = new PublicKey(params.tokenMint);
  const authority = new PublicKey(params.authority);
  const creator = new PublicKey(params.creatorAddress);
  const feeVault = new PublicKey(params.feeVaultAddress);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const hookValidationAddress = findClawPegHookValidationAddress(params.tokenMint);
  const initializeCollectionData = serializeClawPegInitializeCollectionInstruction(params);
  const initializeHookData = serializeClawPegInitializeTransferHookAccountsInstruction();
  const cluster = getClawPegCluster();

  return {
    chain: cluster === "devnet" ? "solana-devnet" : "solana",
    cluster,
    program_id: programId.toBase58(),
    token_mint: tokenMint.toBase58(),
    collection_address: collectionAddress.toBase58(),
    hook_validation_address: hookValidationAddress.toBase58(),
    authority: authority.toBase58(),
    instructions: [
      {
        programId: programId.toBase58(),
        accounts: [
          { pubkey: authority.toBase58(), isSigner: true, isWritable: true },
          { pubkey: tokenMint.toBase58(), isSigner: false, isWritable: false },
          { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: true },
          { pubkey: creator.toBase58(), isSigner: false, isWritable: false },
          { pubkey: feeVault.toBase58(), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
        ],
        dataBase64: initializeCollectionData.toString("base64"),
      },
      {
        programId: programId.toBase58(),
        accounts: [
          { pubkey: authority.toBase58(), isSigner: true, isWritable: true },
          { pubkey: tokenMint.toBase58(), isSigner: false, isWritable: false },
          { pubkey: hookValidationAddress.toBase58(), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
        ],
        dataBase64: initializeHookData.toString("base64"),
      },
    ],
  };
}

export function buildClawPegTransferPegManifest(params: ClawPegTransferPegParams): ClawPegInstructionManifest {
  const programId = getClawPegProgramId();
  const sourceOwner = new PublicKey(params.sourceOwner);
  const destinationOwner = new PublicKey(params.destinationOwner);
  const tokenMint = new PublicKey(params.tokenMint);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const sourceOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.sourceOwner);
  const destinationOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.destinationOwner);
  const pegRecord = findPegRecordAddress(collectionAddress.toBase58(), params.pegId);
  const hookValidationAddress = findClawPegHookValidationAddress(params.tokenMint);
  const data = serializeClawPegTransferPegInstruction(params.pegId);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: sourceOwner.toBase58(), isSigner: true, isWritable: false },
      { pubkey: destinationOwner.toBase58(), isSigner: false, isWritable: false },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: sourceOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: destinationOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: pegRecord.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.sourceTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: tokenMint.toBase58(), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.destinationTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
      { pubkey: programId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: hookValidationAddress.toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: data.toString("base64"),
  };
}

export function buildClawPegInitializeOwnerPegManifest(params: ClawPegOwnerPegParams): ClawPegInstructionManifest {
  const programId = getClawPegProgramId();
  const payer = new PublicKey(params.payer);
  const owner = new PublicKey(params.owner);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const ownerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.owner);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: payer.toBase58(), isSigner: true, isWritable: true },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: owner.toBase58(), isSigner: false, isWritable: false },
      { pubkey: ownerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: serializeClawPegInitializeOwnerPegInstruction().toString("base64"),
  };
}

export function buildClawPegSyncPegManifest(params: ClawPegSyncPegParams): ClawPegInstructionManifest {
  const programId = getClawPegProgramId();
  const owner = new PublicKey(params.owner);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const ownerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.owner);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: owner.toBase58(), isSigner: true, isWritable: false },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: ownerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.ownerTokenAccount).toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: serializeClawPegSyncPegInstruction().toString("base64"),
  };
}

export function buildClawPegMintPegManifest(params: ClawPegMintPegParams): ClawPegInstructionManifest {
  const programId = getClawPegProgramId();
  const payer = new PublicKey(params.payer);
  const owner = new PublicKey(params.owner);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const ownerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.owner);
  const pegRecord = findPegRecordAddress(collectionAddress.toBase58(), params.pegId);
  const data = serializeClawPegMintPegInstruction(params.pegId);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: payer.toBase58(), isSigner: true, isWritable: true },
      { pubkey: owner.toBase58(), isSigner: false, isWritable: false },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: true },
      { pubkey: ownerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.ownerTokenAccount).toBase58(), isSigner: false, isWritable: false },
      { pubkey: pegRecord.toBase58(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: data.toString("base64"),
  };
}

export function buildClawPegRecordTradeArtManifest(params: ClawPegRecordTradeArtParams): ClawPegInstructionManifest {
  const programId = getClawPegProgramId();
  const payer = new PublicKey(params.payer);
  const trader = new PublicKey(params.trader);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const tradeArtRecord = findTradeArtRecordAddress(collectionAddress.toBase58(), params.tradeIndex);
  const data = serializeClawPegRecordTradeArtInstruction(params);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: payer.toBase58(), isSigner: true, isWritable: true },
      { pubkey: trader.toBase58(), isSigner: true, isWritable: false },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: tradeArtRecord.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.inputMint).toBase58(), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.outputMint).toBase58(), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: data.toString("base64"),
  };
}

export function buildClawPegListPegEscrowManifest(params: ClawPegListPegEscrowParams): ClawPegInstructionManifest {
  const programId = getCpegMarketProgramId();
  const cpegProgramId = getClawPegProgramId();
  const seller = new PublicKey(params.seller);
  const tokenMint = new PublicKey(params.tokenMint);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const listing = findMarketListingAddress(collectionAddress.toBase58(), params.pegId);
  const sellerOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.seller);
  const escrowOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), listing.toBase58());
  const pegRecord = findPegRecordAddress(collectionAddress.toBase58(), params.pegId);
  const hookValidationAddress = findClawPegHookValidationAddress(params.tokenMint);
  const data = Buffer.concat([Buffer.from([0]), encodeU32(params.pegId), encodeU64(params.priceLamports)]);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: seller.toBase58(), isSigner: true, isWritable: true },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: listing.toBase58(), isSigner: false, isWritable: true },
      { pubkey: sellerOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: escrowOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: pegRecord.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.sellerTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.escrowTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: tokenMint.toBase58(), isSigner: false, isWritable: false },
      { pubkey: cpegProgramId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
      { pubkey: cpegProgramId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: hookValidationAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: data.toString("base64"),
  };
}

export function buildClawPegBuyPegEscrowManifest(params: ClawPegBuyPegEscrowParams): ClawPegInstructionManifest {
  const programId = getCpegMarketProgramId();
  const cpegProgramId = getClawPegProgramId();
  const buyer = new PublicKey(params.buyer);
  const seller = new PublicKey(params.seller);
  const tokenMint = new PublicKey(params.tokenMint);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const listing = findMarketListingAddress(collectionAddress.toBase58(), params.pegId);
  const buyerOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.buyer);
  const escrowOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), listing.toBase58());
  const pegRecord = findPegRecordAddress(collectionAddress.toBase58(), params.pegId);
  const hookValidationAddress = findClawPegHookValidationAddress(params.tokenMint);
  // Trade-art recording is now bundled atomically into every market fill via CPI from
  // cpeg-market -> clawpeg::record_trade_art. The trade_index is the peg_id so each
  // PEG identity has at most one canonical "first sale" art piece, and re-runs are safe
  // because the on-chain instruction is idempotent. This keeps routed trades art-emitting
  // pattern where every swap automatically materializes one piece of art.
  const tradeArt = findTradeArtRecordAddress(collectionAddress.toBase58(), BigInt(params.pegId));
  const data = Buffer.concat([Buffer.from([1]), encodeU32(params.pegId)]);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: buyer.toBase58(), isSigner: true, isWritable: true },
      { pubkey: seller.toBase58(), isSigner: false, isWritable: true },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: listing.toBase58(), isSigner: false, isWritable: true },
      { pubkey: escrowOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: buyerOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: pegRecord.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.escrowTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.buyerTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: tokenMint.toBase58(), isSigner: false, isWritable: false },
      { pubkey: cpegProgramId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
      { pubkey: cpegProgramId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: hookValidationAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.creator).toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.feeVault).toBase58(), isSigner: false, isWritable: true },
      { pubkey: tradeArt.toBase58(), isSigner: false, isWritable: true },
    ],
    dataBase64: data.toString("base64"),
  };
}

export function buildClawPegCancelPegEscrowManifest(params: ClawPegCancelPegEscrowParams): ClawPegInstructionManifest {
  const programId = getCpegMarketProgramId();
  const cpegProgramId = getClawPegProgramId();
  const seller = new PublicKey(params.seller);
  const tokenMint = new PublicKey(params.tokenMint);
  const collectionAddress = findClawPegCollectionAddress(params.tokenMint);
  const listing = findMarketListingAddress(collectionAddress.toBase58(), params.pegId);
  const sellerOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), params.seller);
  const escrowOwnerPeg = findOwnerPegAddress(collectionAddress.toBase58(), listing.toBase58());
  const pegRecord = findPegRecordAddress(collectionAddress.toBase58(), params.pegId);
  const hookValidationAddress = findClawPegHookValidationAddress(params.tokenMint);
  const data = Buffer.concat([Buffer.from([2]), encodeU32(params.pegId)]);

  return {
    programId: programId.toBase58(),
    accounts: [
      { pubkey: seller.toBase58(), isSigner: true, isWritable: false },
      { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: listing.toBase58(), isSigner: false, isWritable: true },
      { pubkey: escrowOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: sellerOwnerPeg.toBase58(), isSigner: false, isWritable: true },
      { pubkey: pegRecord.toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.escrowTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.sellerTokenAccount).toBase58(), isSigner: false, isWritable: true },
      { pubkey: tokenMint.toBase58(), isSigner: false, isWritable: false },
      { pubkey: cpegProgramId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
      { pubkey: cpegProgramId.toBase58(), isSigner: false, isWritable: false },
      { pubkey: hookValidationAddress.toBase58(), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ],
    dataBase64: data.toString("base64"),
  };
}

export interface ClawPegMarketFeeBreakdown {
  priceLamports: string;
  sellerProceedsLamports: string;
  creatorRoyaltyLamports: string;
  protocolFeeLamports: string;
  royaltyBps: number;
  marketplaceFeeBps: number;
}

export interface ParsedClawPegCollectionAccount {
  isInitialized: boolean;
  version: number;
  bump: number;
  authority: string;
  tokenMint: string;
  rendererHash: string;
  collectionSeed: string;
  pegUnit: bigint;
  maxPegs: number;
  totalPegs: number;
  burnedPegs: number;
  launchFeeLamports: bigint;
  royaltyBps: number;
  marketplaceFeeBps: number;
  creator: string;
  feeVault: string;
  decimals: number;
}

export const CLAWPEG_COLLECTION_ACCOUNT_SIZE = 228;

export function parseClawPegCollectionAccount(data: Buffer): ParsedClawPegCollectionAccount {
  if (data.length < CLAWPEG_COLLECTION_ACCOUNT_SIZE) {
    throw new Error(
      `PegCollection account data too small: got ${data.length}, expected >= ${CLAWPEG_COLLECTION_ACCOUNT_SIZE}`
    );
  }
  return {
    isInitialized: data[0] === 1,
    version: data[1],
    bump: data[2],
    authority: new PublicKey(data.subarray(3, 35)).toBase58(),
    tokenMint: new PublicKey(data.subarray(35, 67)).toBase58(),
    rendererHash: data.subarray(67, 99).toString("hex"),
    collectionSeed: data.subarray(99, 131).toString("hex"),
    pegUnit: data.readBigUInt64LE(131),
    maxPegs: data.readUInt32LE(139),
    totalPegs: data.readUInt32LE(143),
    burnedPegs: data.readUInt32LE(147),
    launchFeeLamports: data.readBigUInt64LE(151),
    royaltyBps: data.readUInt16LE(159),
    marketplaceFeeBps: data.readUInt16LE(161),
    creator: new PublicKey(data.subarray(163, 195)).toBase58(),
    feeVault: new PublicKey(data.subarray(195, 227)).toBase58(),
    decimals: data[227],
  };
}

export interface ParsedCpegMarketListingAccount {
  isInitialized: boolean;
  version: number;
  bump: number;
  status: number;
  collection: string;
  seller: string;
  tokenMint: string;
  escrowToken: string;
  pegId: number;
  priceLamports: bigint;
  closedSlot: bigint;
}

export interface ParsedClawPegRecordAccount {
  isInitialized: boolean;
  status: number;
  collection: string;
  owner: string;
  pegId: number;
  seed: string;
  mintedSlot: bigint;
  transferredSlot: bigint;
  burnedSlot: bigint;
}

export const CPEG_MARKET_LISTING_ACCOUNT_SIZE = 152;
export const CPEG_MARKET_LISTING_STATUS_ACTIVE = 1;
export const CPEG_MARKET_LISTING_STATUS_FILLED = 2;
export const CPEG_MARKET_LISTING_STATUS_CANCELLED = 3;
export const CLAWPEG_RECORD_ACCOUNT_SIZE = 126;
export const CLAWPEG_PEG_STATUS_ACTIVE = 1;
export const CLAWPEG_PEG_STATUS_BURNED = 2;

export function parseCpegMarketListingAccount(data: Buffer): ParsedCpegMarketListingAccount {
  if (data.length < CPEG_MARKET_LISTING_ACCOUNT_SIZE) {
    throw new Error(
      `MarketListing account data too small: got ${data.length}, expected >= ${CPEG_MARKET_LISTING_ACCOUNT_SIZE}`
    );
  }
  return {
    isInitialized: data[0] === 1,
    version: data[1],
    bump: data[2],
    status: data[3],
    collection: new PublicKey(data.subarray(4, 36)).toBase58(),
    seller: new PublicKey(data.subarray(36, 68)).toBase58(),
    tokenMint: new PublicKey(data.subarray(68, 100)).toBase58(),
    escrowToken: new PublicKey(data.subarray(100, 132)).toBase58(),
    pegId: data.readUInt32LE(132),
    priceLamports: data.readBigUInt64LE(136),
    closedSlot: data.readBigUInt64LE(144),
  };
}

export function describeCpegMarketListingStatus(status: number): string {
  switch (status) {
    case CPEG_MARKET_LISTING_STATUS_ACTIVE:
      return "ACTIVE";
    case CPEG_MARKET_LISTING_STATUS_FILLED:
      return "FILLED";
    case CPEG_MARKET_LISTING_STATUS_CANCELLED:
      return "CANCELLED";
    default:
      return `UNKNOWN(${status})`;
  }
}

export function parseClawPegRecordAccount(data: Buffer): ParsedClawPegRecordAccount {
  if (data.length < CLAWPEG_RECORD_ACCOUNT_SIZE) {
    throw new Error(
      `PegRecord account data too small: got ${data.length}, expected >= ${CLAWPEG_RECORD_ACCOUNT_SIZE}`
    );
  }
  return {
    isInitialized: data[0] === 1,
    status: data[1],
    collection: new PublicKey(data.subarray(2, 34)).toBase58(),
    owner: new PublicKey(data.subarray(34, 66)).toBase58(),
    pegId: data.readUInt32LE(66),
    seed: data.subarray(70, 102).toString("hex"),
    mintedSlot: data.readBigUInt64LE(102),
    transferredSlot: data.readBigUInt64LE(110),
    burnedSlot: data.readBigUInt64LE(118),
  };
}

export function describeClawPegRecordStatus(status: number): string {
  switch (status) {
    case CLAWPEG_PEG_STATUS_ACTIVE:
      return "ACTIVE";
    case CLAWPEG_PEG_STATUS_BURNED:
      return "BURNED";
    default:
      return `UNKNOWN(${status})`;
  }
}

export function splitClawPegMarketPayment(
  priceLamports: bigint,
  royaltyBps: number,
  marketplaceFeeBps: number
): ClawPegMarketFeeBreakdown {
  if (royaltyBps < 0 || marketplaceFeeBps < 0) {
    throw new Error("basis points must be non-negative");
  }
  if (royaltyBps + marketplaceFeeBps > U16_MAX_BPS) {
    throw new Error("royalty + marketplace fee cannot exceed 10000 bps");
  }
  if (priceLamports < BigInt(0)) {
    throw new Error("price must be non-negative");
  }
  const denom = BigInt(U16_MAX_BPS);
  const protocolFee = (priceLamports * BigInt(marketplaceFeeBps)) / denom;
  const royalty = (priceLamports * BigInt(royaltyBps)) / denom;
  const seller = priceLamports - protocolFee - royalty;
  return {
    priceLamports: priceLamports.toString(),
    sellerProceedsLamports: seller.toString(),
    creatorRoyaltyLamports: royalty.toString(),
    protocolFeeLamports: protocolFee.toString(),
    royaltyBps,
    marketplaceFeeBps,
  };
}

export function quoteClawPegLaunchFee(input: {
  premiumIndexing?: boolean;
  partnerApiEnabled?: boolean;
  whiteLabelDomain?: string | null;
}): {
  launchFeeLamports: string;
  premiumIndexingLamports: string;
  partnerApiLamports: string;
  whiteLabelLamports: string;
  totalLamports: string;
  marketplaceFeeBps: number;
  defaultCreatorRoyaltyBps: number;
} {
  const config = getClawPegRevenueConfig();
  const premium = input.premiumIndexing ? config.premiumIndexingLamports : BigInt(0);
  const partner = input.partnerApiEnabled ? config.partnerApiLamports : BigInt(0);
  const whiteLabel = input.whiteLabelDomain ? config.whiteLabelLamports : BigInt(0);
  const total = config.launchFeeLamports + premium + partner + whiteLabel;

  return {
    launchFeeLamports: config.launchFeeLamports.toString(),
    premiumIndexingLamports: premium.toString(),
    partnerApiLamports: partner.toString(),
    whiteLabelLamports: whiteLabel.toString(),
    totalLamports: total.toString(),
    marketplaceFeeBps: config.marketplaceFeeBps,
    defaultCreatorRoyaltyBps: config.creatorRoyaltyBps,
  };
}
