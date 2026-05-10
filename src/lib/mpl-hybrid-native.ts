import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const MPL_HYBRID_PROGRAM_ID = new PublicKey("MPL4o4wMzndgh8T1NVDxELQCj5UQfYTYEkabX3wNKtb");
export const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
export const MPL_HYBRID_DEFAULT_SOL_FEE_ACCOUNT = new PublicKey("GjF4LqmEhV33riVyAwHwiEeAHx4XXFn2yMY3fmMigoP3");
export const SYSVAR_SLOT_HASHES_ID = new PublicKey("SysvarS1otHashes111111111111111111111111111");

const INIT_ESCROW_V1_DISCRIMINATOR = Buffer.from([193, 10, 167, 121, 222, 6, 21, 146]);
const INIT_NFT_DATA_V1_DISCRIMINATOR = Buffer.from([235, 157, 80, 8, 35, 66, 54, 130]);
const CAPTURE_V1_DISCRIMINATOR = Buffer.from([22, 23, 128, 17, 40, 133, 224, 228]);
const RELEASE_V1_DISCRIMINATOR = Buffer.from([86, 208, 216, 30, 127, 65, 71, 80]);
const UPDATE_ESCROW_V1_DISCRIMINATOR = Buffer.from([72, 45, 208, 14, 174, 238, 27, 95]);

// Path bit indices used by mpl-hybrid: NoRerollMetadata = bit 0.
export const MPL_HYBRID_PATH_NO_REROLL_METADATA = 1 << 0;

type Web3PublicKey = InstanceType<typeof PublicKey>;
type PublicKeyInput = string | Web3PublicKey;

function toPublicKey(value: PublicKeyInput, label: string) {
  try {
    return typeof value === "string" ? new PublicKey(value) : value;
  } catch {
    throw new Error(`${label} must be a valid Solana address`);
  }
}

function writeString(value: string) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

function writeU64(value: bigint | number | string) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return buffer;
}

function writeU16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

export function deriveMplHybridEscrowPda(
  collection: PublicKeyInput,
  programId: PublicKeyInput = MPL_HYBRID_PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), toPublicKey(collection, "collection").toBuffer()],
    toPublicKey(programId, "mpl_hybrid_program_id")
  )[0];
}

export function deriveMplHybridEscrowTokenAccount(
  tokenMint: PublicKeyInput,
  escrow: PublicKeyInput,
  tokenProgramId: PublicKeyInput = TOKEN_PROGRAM_ID
) {
  return getAssociatedTokenAddressSync(
    toPublicKey(tokenMint, "token_mint"),
    toPublicKey(escrow, "hybrid_escrow"),
    true,
    toPublicKey(tokenProgramId, "token_program_id"),
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function deriveMplHybridNftDataPda(
  asset: PublicKeyInput,
  programId: PublicKeyInput = MPL_HYBRID_PROGRAM_ID
) {
  // mpl-hybrid's init_nft_data_v1 declares the PDA as
  // seeds = ["nft".as_bytes(), asset.key().as_ref()] — using anything other
  // than the literal "nft" prefix surfaces as ConstraintSeeds (Anchor 2006)
  // when the program tries to (re)derive the account inside the handler.
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nft"), toPublicKey(asset, "asset").toBuffer()],
    toPublicKey(programId, "mpl_hybrid_program_id")
  )[0];
}

export interface InitEscrowV1InstructionInput {
  escrow: PublicKeyInput;
  authority: PublicKeyInput;
  collection: PublicKeyInput;
  token: PublicKeyInput;
  feeLocation: PublicKeyInput;
  feeAta: PublicKeyInput;
  name: string;
  uri: string;
  max: bigint | number | string;
  min: bigint | number | string;
  amount: bigint | number | string;
  feeAmount: bigint | number | string;
  solFeeAmount: bigint | number | string;
  path?: number;
  tokenProgramId?: PublicKeyInput;
  programId?: PublicKeyInput;
}

export function createInitEscrowV1Instruction(input: InitEscrowV1InstructionInput) {
  const programId = toPublicKey(input.programId || MPL_HYBRID_PROGRAM_ID, "mpl_hybrid_program_id");
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: toPublicKey(input.escrow, "escrow"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.authority, "authority"), isSigner: true, isWritable: true },
      { pubkey: toPublicKey(input.collection, "collection"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.token, "token"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.feeLocation, "fee_location"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.feeAta, "fee_ata"), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.tokenProgramId || TOKEN_PROGRAM_ID, "token_program_id"), isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INIT_ESCROW_V1_DISCRIMINATOR,
      writeString(input.name),
      writeString(input.uri),
      writeU64(input.max),
      writeU64(input.min),
      writeU64(input.amount),
      writeU64(input.feeAmount),
      writeU64(input.solFeeAmount),
      writeU16(input.path ?? 0),
    ]),
  });
}

export interface InitNftDataV1InstructionInput {
  nftData: PublicKeyInput;
  authority: PublicKeyInput;
  asset: PublicKeyInput;
  collection: PublicKeyInput;
  token: PublicKeyInput;
  feeLocation: PublicKeyInput;
  name: string;
  uri: string;
  max: bigint | number | string;
  min: bigint | number | string;
  amount: bigint | number | string;
  feeAmount: bigint | number | string;
  solFeeAmount: bigint | number | string;
  path?: number;
  programId?: PublicKeyInput;
}

export function createInitNftDataV1Instruction(input: InitNftDataV1InstructionInput) {
  return new TransactionInstruction({
    programId: toPublicKey(input.programId || MPL_HYBRID_PROGRAM_ID, "mpl_hybrid_program_id"),
    keys: [
      { pubkey: toPublicKey(input.nftData, "nft_data"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.authority, "authority"), isSigner: true, isWritable: true },
      { pubkey: toPublicKey(input.asset, "asset"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.collection, "collection"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.token, "token"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.feeLocation, "fee_location"), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INIT_NFT_DATA_V1_DISCRIMINATOR,
      writeString(input.name),
      writeString(input.uri),
      writeU64(input.max),
      writeU64(input.min),
      writeU64(input.amount),
      writeU64(input.feeAmount),
      writeU64(input.solFeeAmount),
      writeU16(input.path ?? 0),
    ]),
  });
}

export interface CaptureOrReleaseV1InstructionInput {
  owner: PublicKeyInput;
  authority?: PublicKeyInput;
  escrow: PublicKeyInput;
  asset: PublicKeyInput;
  collection: PublicKeyInput;
  userTokenAccount: PublicKeyInput;
  escrowTokenAccount: PublicKeyInput;
  token: PublicKeyInput;
  feeTokenAccount: PublicKeyInput;
  feeSolAccount?: PublicKeyInput;
  feeProjectAccount: PublicKeyInput;
  tokenProgramId?: PublicKeyInput;
  programId?: PublicKeyInput;
}

function createCaptureOrReleaseInstruction(
  discriminator: Buffer,
  input: CaptureOrReleaseV1InstructionInput
) {
  const owner = toPublicKey(input.owner, "owner");
  const authority = input.authority ? toPublicKey(input.authority, "authority") : owner;
  const authorityIsExplicitSigner = Boolean(input.authority);
  return new TransactionInstruction({
    programId: toPublicKey(input.programId || MPL_HYBRID_PROGRAM_ID, "mpl_hybrid_program_id"),
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: authorityIsExplicitSigner || authority.equals(owner), isWritable: true },
      { pubkey: toPublicKey(input.escrow, "escrow"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.asset, "asset"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.collection, "collection"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.userTokenAccount, "user_token_account"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.escrowTokenAccount, "escrow_token_account"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.token, "token"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.feeTokenAccount, "fee_token_account"), isSigner: false, isWritable: true },
      {
        pubkey: toPublicKey(input.feeSolAccount || MPL_HYBRID_DEFAULT_SOL_FEE_ACCOUNT, "fee_sol_account"),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: toPublicKey(input.feeProjectAccount, "fee_project_account"), isSigner: false, isWritable: true },
      { pubkey: SYSVAR_SLOT_HASHES_ID, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.tokenProgramId || TOKEN_PROGRAM_ID, "token_program_id"), isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

export function createCaptureV1Instruction(input: CaptureOrReleaseV1InstructionInput) {
  return createCaptureOrReleaseInstruction(CAPTURE_V1_DISCRIMINATOR, input);
}

export function createReleaseV1Instruction(input: CaptureOrReleaseV1InstructionInput) {
  return createCaptureOrReleaseInstruction(RELEASE_V1_DISCRIMINATOR, input);
}

export interface UpdateEscrowV1InstructionInput {
  escrow: PublicKeyInput;
  authority: PublicKeyInput;
  collection: PublicKeyInput;
  token: PublicKeyInput;
  feeLocation: PublicKeyInput;
  name?: string | null;
  uri?: string | null;
  max?: bigint | number | string | null;
  min?: bigint | number | string | null;
  amount?: bigint | number | string | null;
  feeAmount?: bigint | number | string | null;
  solFeeAmount?: bigint | number | string | null;
  path?: number | null;
  programId?: PublicKeyInput;
}

function writeOptionString(value: string | null | undefined) {
  if (value == null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), writeString(value)]);
}

function writeOptionU64(value: bigint | number | string | null | undefined) {
  if (value == null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), writeU64(value)]);
}

function writeOptionU16(value: number | null | undefined) {
  if (value == null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), writeU16(value)]);
}

export function createUpdateEscrowV1Instruction(input: UpdateEscrowV1InstructionInput) {
  return new TransactionInstruction({
    programId: toPublicKey(input.programId || MPL_HYBRID_PROGRAM_ID, "mpl_hybrid_program_id"),
    keys: [
      { pubkey: toPublicKey(input.escrow, "escrow"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.authority, "authority"), isSigner: true, isWritable: true },
      { pubkey: toPublicKey(input.collection, "collection"), isSigner: false, isWritable: true },
      { pubkey: toPublicKey(input.token, "token"), isSigner: false, isWritable: false },
      { pubkey: toPublicKey(input.feeLocation, "fee_location"), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      UPDATE_ESCROW_V1_DISCRIMINATOR,
      writeOptionString(input.name ?? null),
      writeOptionString(input.uri ?? null),
      writeOptionU64(input.max ?? null),
      writeOptionU64(input.min ?? null),
      writeOptionU64(input.amount ?? null),
      writeOptionU64(input.feeAmount ?? null),
      writeOptionU64(input.solFeeAmount ?? null),
      writeOptionU16(input.path ?? null),
    ]),
  });
}

export interface MplHybridEscrowState {
  collection: string;
  authority: string;
  token: string;
  feeLocation: string;
  name: string;
  uri: string;
  max: bigint;
  min: bigint;
  amount: bigint;
  feeAmount: bigint;
  solFeeAmount: bigint;
  count: bigint;
  path: number;
  bump: number;
}

// Best-effort decode of an EscrowV1 account's borsh layout. Returns null if the
// data does not look like the expected layout, so callers can fall through to
// re-initializing or skipping path migration without crashing.
export function decodeMplHybridEscrowAccount(data: Buffer | Uint8Array): MplHybridEscrowState | null {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length < 8 + 32 * 4 + 4 + 4 + 8 * 6 + 2 + 1) return null;
  let cursor = 8; // skip Anchor account discriminator
  const readPubkey = () => {
    const value = new PublicKey(buffer.subarray(cursor, cursor + 32)).toBase58();
    cursor += 32;
    return value;
  };
  const readString = () => {
    const length = buffer.readUInt32LE(cursor);
    cursor += 4;
    if (cursor + length > buffer.length) return "";
    const value = buffer.subarray(cursor, cursor + length).toString("utf8");
    cursor += length;
    return value;
  };
  const readU64 = () => {
    const value = buffer.readBigUInt64LE(cursor);
    cursor += 8;
    return value;
  };
  try {
    const collection = readPubkey();
    const authority = readPubkey();
    const token = readPubkey();
    const feeLocation = readPubkey();
    const name = readString();
    const uri = readString();
    const max = readU64();
    const min = readU64();
    const amount = readU64();
    const feeAmount = readU64();
    const solFeeAmount = readU64();
    const count = readU64();
    const path = buffer.readUInt16LE(cursor);
    cursor += 2;
    const bump = buffer.readUInt8(cursor);
    return { collection, authority, token, feeLocation, name, uri, max, min, amount, feeAmount, solFeeAmount, count, path, bump };
  } catch {
    return null;
  }
}
