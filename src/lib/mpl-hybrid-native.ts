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
const CAPTURE_V1_DISCRIMINATOR = Buffer.from([22, 23, 128, 17, 40, 133, 224, 228]);
const RELEASE_V1_DISCRIMINATOR = Buffer.from([86, 208, 216, 30, 127, 65, 71, 80]);

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
  return new TransactionInstruction({
    programId: toPublicKey(input.programId || MPL_HYBRID_PROGRAM_ID, "mpl_hybrid_program_id"),
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: authority.equals(owner), isWritable: true },
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
