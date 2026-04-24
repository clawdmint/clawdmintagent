import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import bs58 from "bs58";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getEnv } from "./env";
import {
  findSolanaCollectionAddress,
  serializeInitializeCollectionInstruction,
  type SolanaDeployCollectionParams,
} from "./solana-collections";
import { getLaunchSolanaConnection } from "./synapse-sap";

const AGENT_WALLET_ENCRYPTION_ALGO = "aes-256-gcm";
const AGENT_WALLET_IV_LENGTH = 12;
const COLLECTION_ACCOUNT_SIZE = 510;
const SOL_DECIMALS = 1_000_000_000;

export class AgentWalletError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AgentWalletError";
    this.status = status;
    this.details = details;
  }
}

interface AgentWalletRecordLike {
  id?: string;
  name?: string | null;
  solanaWalletAddress?: string | null;
  solanaWalletEncryptedKey?: string | null;
}

export interface GeneratedAgentWallet {
  address: string;
  encryptedSecretKey: string;
  secretKeyBase58: string;
}

export interface AgentWalletBalance {
  lamports: bigint;
  sol: string;
}

export interface AutomaticDeployResult {
  cluster: "mainnet-beta" | "devnet";
  authority: string;
  collectionAddress: string;
  signature: string;
  walletBalance: AgentWalletBalance;
  recommendedDeployBalanceLamports: string;
  recommendedDeployBalanceSol: string;
}

function deriveAgentWalletEncryptionKey(): Buffer {
  const configured = getEnv("AGENT_WALLET_ENCRYPTION_KEY", "").trim();
  const fallback = getEnv("AGENT_HMAC_SECRET", "").trim();
  const source = configured || fallback;

  if (!source) {
    throw new AgentWalletError(
      500,
      "Agent wallet encryption key is not configured",
      "Set AGENT_WALLET_ENCRYPTION_KEY or AGENT_HMAC_SECRET"
    );
  }

  return createHash("sha256").update(source).digest();
}

function formatLamports(lamports: bigint): string {
  const whole = lamports / BigInt(SOL_DECIMALS);
  const fraction = lamports % BigInt(SOL_DECIMALS);
  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

function parseEncryptedPayload(value: string) {
  const [version, ivBase64, tagBase64, cipherBase64] = value.split(":");
  if (version !== "v1" || !ivBase64 || !tagBase64 || !cipherBase64) {
    throw new AgentWalletError(500, "Agent wallet secret is corrupted");
  }

  return {
    iv: Buffer.from(ivBase64, "base64"),
    tag: Buffer.from(tagBase64, "base64"),
    cipher: Buffer.from(cipherBase64, "base64"),
  };
}

function decryptAgentWalletSecretKey(encryptedSecretKey: string): Uint8Array {
  const key = deriveAgentWalletEncryptionKey();
  const payload = parseEncryptedPayload(encryptedSecretKey);
  const decipher = createDecipheriv(AGENT_WALLET_ENCRYPTION_ALGO, key, payload.iv);
  decipher.setAuthTag(payload.tag);

  const plaintext = Buffer.concat([decipher.update(payload.cipher), decipher.final()]);
  return new Uint8Array(plaintext);
}

function encryptAgentWalletSecretKey(secretKey: Uint8Array): string {
  const key = deriveAgentWalletEncryptionKey();
  const iv = randomBytes(AGENT_WALLET_IV_LENGTH);
  const cipher = createCipheriv(AGENT_WALLET_ENCRYPTION_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(secretKey)), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function assertAgentWallet(agent: AgentWalletRecordLike) {
  if (!agent.solanaWalletAddress || !agent.solanaWalletEncryptedKey) {
    throw new AgentWalletError(
      400,
      "Agent wallet is not configured",
      "Register again or contact Clawdmint support"
    );
  }
}

export function generateAgentOperationalWallet(): GeneratedAgentWallet {
  const wallet = Keypair.generate();

  return {
    address: wallet.publicKey.toBase58(),
    encryptedSecretKey: encryptAgentWalletSecretKey(wallet.secretKey),
    secretKeyBase58: bs58.encode(wallet.secretKey),
  };
}

export function getAgentOperationalKeypair(agent: AgentWalletRecordLike): InstanceType<typeof Keypair> {
  assertAgentWallet(agent);

  const secretKey = decryptAgentWalletSecretKey(agent.solanaWalletEncryptedKey!);
  const keypair = Keypair.fromSecretKey(secretKey);

  if (keypair.publicKey.toBase58() !== agent.solanaWalletAddress) {
    throw new AgentWalletError(500, "Agent wallet secret does not match stored address");
  }

  return keypair;
}

export function getAgentOperationalWalletAddress(agent: AgentWalletRecordLike): string {
  assertAgentWallet(agent);
  return agent.solanaWalletAddress!;
}

export async function getAgentWalletBalance(address: string): Promise<AgentWalletBalance> {
  const connection = getLaunchSolanaConnection();
  const lamports = BigInt(await connection.getBalance(new PublicKey(address), "confirmed"));

  return {
    lamports,
    sol: formatLamports(lamports),
  };
}

export async function getRecommendedCollectionDeployBalanceLamports(): Promise<bigint> {
  const connection = getLaunchSolanaConnection();
  const rentLamports = BigInt(await connection.getMinimumBalanceForRentExemption(COLLECTION_ACCOUNT_SIZE));
  return rentLamports + BigInt(100_000);
}

export async function deployCollectionWithAgentWallet(
  agent: AgentWalletRecordLike,
  params: SolanaDeployCollectionParams
): Promise<AutomaticDeployResult> {
  const signer = getAgentOperationalKeypair(agent);
  const connection = getLaunchSolanaConnection({ commitment: "confirmed" });
  const collectionAddress = findSolanaCollectionAddress(params.authority, params.collectionId);
  const instruction = new TransactionInstruction({
    programId: new PublicKey(getEnv("SOLANA_COLLECTION_PROGRAM_ID", getEnv("NEXT_PUBLIC_SOLANA_COLLECTION_PROGRAM_ID", ""))),
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: collectionAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeInitializeCollectionInstruction(params),
  });

  const recommendedBalanceLamports = await getRecommendedCollectionDeployBalanceLamports();
  const walletBalance = await getAgentWalletBalance(signer.publicKey.toBase58());
  if (walletBalance.lamports < recommendedBalanceLamports) {
    throw new AgentWalletError(400, "Agent wallet does not have enough SOL to deploy", {
      wallet_address: signer.publicKey.toBase58(),
      balance_lamports: walletBalance.lamports.toString(),
      balance_sol: walletBalance.sol,
      recommended_lamports: recommendedBalanceLamports.toString(),
      recommended_sol: formatLamports(recommendedBalanceLamports),
    });
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToLegacyMessage();
  const transaction = new VersionedTransaction(message);
  transaction.sign([signer]);

  try {
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    const cluster = getEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta") === "devnet" ? "devnet" : "mainnet-beta";
    return {
      cluster,
      authority: signer.publicKey.toBase58(),
      collectionAddress: collectionAddress.toBase58(),
      signature,
      walletBalance,
      recommendedDeployBalanceLamports: recommendedBalanceLamports.toString(),
      recommendedDeployBalanceSol: formatLamports(recommendedBalanceLamports),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Solana deployment error";
    throw new AgentWalletError(500, `Failed to send agent wallet deployment transaction: ${message}`);
  }
}
