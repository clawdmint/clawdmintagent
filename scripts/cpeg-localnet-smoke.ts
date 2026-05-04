import fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.CPEG_LOCALNET_PROGRAM_ID ?? "G5cBjAyXF72m5xyG9zXLW9sVWRaVdEDqYg28bh8mMigc"
);
const CPEG_TAG_OFFSET = 100;
const RPC_URL = process.env.CPEG_LOCALNET_RPC_URL ?? "http://127.0.0.1:8899";
const KEYPAIR_PATH =
  process.env.CPEG_LOCALNET_KEYPAIR ?? "C:\\tmp\\solana-install\\clawpeg-localnet-deployer.json";

function readKeypair(path: string) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function u64(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value, 0);
  return buffer;
}

function initCollectionData(): Buffer {
  return Buffer.concat([
    Buffer.from([CPEG_TAG_OFFSET]),
    Buffer.alloc(32, 1),
    Buffer.alloc(32, 2),
    u64(BigInt(1_000_000)),
    u32(128),
    u16(500),
    u64(BigInt(0)),
    u16(200),
    Buffer.from([0]),
    Buffer.from([6]),
  ]);
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = readKeypair(KEYPAIR_PATH);
  const tokenMint = Keypair.generate().publicKey;
  const [collection] = PublicKey.findProgramAddressSync(
    [Buffer.from("cpeg"), tokenMint.toBuffer()],
    PROGRAM_ID
  );
  const [validation] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), tokenMint.toBuffer()],
    PROGRAM_ID
  );

  const initializeCollection = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: collection, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initCollectionData(),
  });

  const initializeHookAccounts = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: validation, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([CPEG_TAG_OFFSET + 5]),
  });

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(initializeCollection, initializeHookAccounts),
    [payer],
    { commitment: "confirmed" }
  );
  const collectionAccount = await connection.getAccountInfo(collection, "confirmed");
  const validationAccount = await connection.getAccountInfo(validation, "confirmed");

  console.log(JSON.stringify({
    signature,
    programId: PROGRAM_ID.toBase58(),
    payer: payer.publicKey.toBase58(),
    tokenMint: tokenMint.toBase58(),
    collection: collection.toBase58(),
    collectionDataLength: collectionAccount?.data.length ?? 0,
    validation: validation.toBase58(),
    validationDataLength: validationAccount?.data.length ?? 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
