import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import { getEnv, getPreferredSolanaRpcUrl } from "./env";

const INITIALIZE_COLLECTION_DISCRIMINATOR = 0;
const MINT_NFT_DISCRIMINATOR = 1;
const U16_MAX = 65_535;

export interface SolanaDeployCollectionParams {
  authority: string;
  payoutAddress: string;
  collectionId: string;
  name: string;
  symbol: string;
  baseUri: string;
  maxSupply: number;
  mintPriceLamports: bigint;
  royaltyBps: number;
}

export interface SolanaMintCollectionParams {
  collectionAddress: string;
  minter: string;
  quantity: number;
}

export interface SolanaManifestAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface SolanaInstructionManifest {
  programId: string;
  accounts: SolanaManifestAccount[];
  dataBase64: string;
}

export interface SolanaDeploymentManifest {
  chain: "solana" | "solana-devnet";
  cluster: "mainnet-beta" | "devnet";
  program_id: string;
  collection_address: string;
  authority: string;
  instructions: SolanaInstructionManifest[];
}

function ensureShortString(value: string, label: string): Buffer {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length > U16_MAX) {
    throw new Error(`${label} is too long`);
  }
  return buffer;
}

function encodeU16(value: number): Buffer {
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

function encodeString(value: string, label: string): Buffer {
  const data = ensureShortString(value, label);
  return Buffer.concat([encodeU16(data.length), data]);
}

function getSolanaCluster(): "mainnet-beta" | "devnet" {
  return getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet" ? "devnet" : "mainnet-beta";
}

export function getSolanaRpcUrl(): string {
  return getPreferredSolanaRpcUrl();
}

export function getSolanaConnection(): InstanceType<typeof Connection> {
  return new Connection(getSolanaRpcUrl(), "confirmed");
}

export function getSolanaCollectionProgramId(): InstanceType<typeof PublicKey> {
  const programId = getEnv("SOLANA_COLLECTION_PROGRAM_ID", getEnv("NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID", ""));
  if (!programId) {
    throw new Error("SOLANA_COLLECTION_PROGRAM_ID not configured");
  }

  return new PublicKey(programId);
}

export function findSolanaCollectionAddress(authority: string, collectionId: string): InstanceType<typeof PublicKey> {
  const authorityKey = new PublicKey(authority);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf8"), authorityKey.toBuffer(), Buffer.from(collectionId, "utf8")],
    getSolanaCollectionProgramId()
  )[0];
}

export function serializeInitializeCollectionInstruction(
  params: SolanaDeployCollectionParams
): Buffer {
  const payoutAddress = new PublicKey(params.payoutAddress);

  return Buffer.concat([
    Buffer.from([INITIALIZE_COLLECTION_DISCRIMINATOR]),
    encodeString(params.collectionId, "collection_id"),
    encodeString(params.name, "name"),
    encodeString(params.symbol, "symbol"),
    encodeString(params.baseUri, "base_uri"),
    encodeU32(params.maxSupply),
    encodeU64(params.mintPriceLamports),
    encodeU16(params.royaltyBps),
    payoutAddress.toBuffer(),
  ]);
}

export function serializeMintInstruction(params: SolanaMintCollectionParams): Buffer {
  return Buffer.concat([
    Buffer.from([MINT_NFT_DISCRIMINATOR]),
    encodeU32(params.quantity),
  ]);
}

export function buildSolanaDeploymentManifest(
  params: SolanaDeployCollectionParams
): SolanaDeploymentManifest {
  const programId = getSolanaCollectionProgramId();
  const authority = new PublicKey(params.authority);
  const collectionAddress = findSolanaCollectionAddress(params.authority, params.collectionId);
  const instructionData = serializeInitializeCollectionInstruction(params);

  return {
    chain: getSolanaCluster() === "devnet" ? "solana-devnet" : "solana",
    cluster: getSolanaCluster(),
    program_id: programId.toBase58(),
    collection_address: collectionAddress.toBase58(),
    authority: authority.toBase58(),
    instructions: [
      {
        programId: programId.toBase58(),
        accounts: [
          { pubkey: authority.toBase58(), isSigner: true, isWritable: true },
          { pubkey: collectionAddress.toBase58(), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
        ],
        dataBase64: instructionData.toString("base64"),
      },
    ],
  };
}

export async function verifySolanaDeploymentSignature(signature: string): Promise<boolean> {
  const { getMetaplexCoreConnection } = await import("./synapse-sap");
  const connection = getMetaplexCoreConnection({ commitment: "confirmed" });
  const status = await connection.getSignatureStatus(signature, {
    searchTransactionHistory: true,
  });

  return Boolean(status.value && status.value.confirmationStatus && !status.value.err);
}
