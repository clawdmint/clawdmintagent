/**
 * Solana x402 payment wrapper for Clawdmint.
 *
 * Clawdmint's paid API surface settles with SPL USDC on Solana. The flow is:
 * request -> 402 with x402 payment requirements -> signed Solana transaction in
 * X-PAYMENT/PAYMENT-SIGNATURE -> server verifies, broadcasts, confirms -> data.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getPreferredSolanaRpcUrl } from "@/lib/env";
import { getTransactionExplorerUrl, isSolanaAddress } from "@/lib/network-config";

export const X402_PRICING = {
  REGISTER_AGENT: "$0.01",
  DEPLOY_COLLECTION: "$2.00",
  DEPLOY_AGENT_TOKEN: "$2.00",
  API_COLLECTIONS_READ: "$0.001",
  API_STATS_PREMIUM: "$0.005",
  API_AGENTS_READ: "$0.001",
} as const;

export type X402PricingTier = keyof typeof X402_PRICING;
type X402SolanaNetwork = "solana" | "solana-devnet";

interface X402DiscoveryInputSchema {
  type: "http";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  queryParams?: Record<string, unknown>;
  bodyFields?: Record<string, unknown>;
  bodyType?: "json" | "form" | "multipart";
}

interface X402DiscoveryOutputSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  example?: unknown;
}

interface X402DiscoveryMetadata {
  name?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  input?: X402DiscoveryInputSchema;
  output?: X402DiscoveryOutputSchema | null;
}

interface X402Options {
  price: string;
  description: string;
  mimeType?: string;
  discovery?: X402DiscoveryMetadata;
}

interface SolanaPaymentRequirement {
  scheme: "exact";
  network: X402SolanaNetwork;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    token: "USDC";
    decimals: 6;
    recipientTokenAccount: string;
    cluster: "mainnet-beta" | "devnet";
    /** Required by Coinbase x402 SVM scheme and AgentCash patched exact-SVM flow (SOL fee payer pubkey). */
    feePayer?: string;
  };
  outputSchema?: {
    input: X402DiscoveryInputSchema;
    output: X402DiscoveryOutputSchema | null;
  };
  extensions?: {
    bazaar: {
      discoverable: true;
      info: {
        name?: string;
        description: string;
        category?: string;
        tags?: string[];
        input: X402DiscoveryInputSchema;
        output: X402DiscoveryOutputSchema | null;
      };
      inputSchema?: X402DiscoveryInputSchema;
      outputSchema?: X402DiscoveryOutputSchema | null;
    };
  };
}

interface PaymentPayload {
  x402Version?: number;
  scheme?: string;
  network?: string;
  payload?: {
    transaction?: string;
    serializedTransaction?: string;
  };
  transaction?: string;
  serializedTransaction?: string;
}

/** x402 v2 client payment (e.g. AgentCash / Pay.sh) */
interface PaymentPayloadV2Shape {
  x402Version: 2;
  accepted?: {
    scheme?: string;
    network?: string;
    payTo?: string;
    asset?: string;
    amount?: string;
    maxTimeoutSeconds?: number;
  };
  payload?: Record<string, unknown>;
}

type SolanaConnection = InstanceType<typeof Connection>;
type SolanaPublicKey = InstanceType<typeof PublicKey>;
type SolanaTransaction = InstanceType<typeof Transaction>;
type SolanaVersionedTransaction = InstanceType<typeof VersionedTransaction>;
type SolanaTransactionInstruction = InstanceType<typeof TransactionInstruction>;
type SolanaKeypair = InstanceType<typeof Keypair>;
type ConfirmedTransaction = Awaited<ReturnType<SolanaConnection["getTransaction"]>>;

interface DecodedPaymentTransaction {
  raw: Buffer;
  legacy?: SolanaTransaction;
  versioned?: SolanaVersionedTransaction;
  instructions: DecodedInstruction[];
  signature?: string;
}

interface DecodedInstruction {
  programId: SolanaPublicKey;
  keys: SolanaPublicKey[];
  data: Buffer;
}

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
/** CAIP-2 chain ids used by x402 v2 (Coinbase / AgentCash). */
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const PAYMENT_HEADER_NAMES = ["x-payment", "payment-signature", "X-PAYMENT", "PAYMENT-SIGNATURE"];
const PAYMENT_REQUIRED_HEADER_NAMES = "PAYMENT-REQUIRED, X-PAYMENT-REQUIRED";
const PAYMENT_RESPONSE_HEADER_NAMES = "PAYMENT-RESPONSE, X-PAYMENT-RESPONSE";
const USDC_DECIMALS = 6;
const USDC_BASE_UNITS = BigInt(1_000_000);

function getPayToAddress(): string {
  const candidates = [
    process.env["X402_SOLANA_PAY_TO_ADDRESS"],
    process.env["SOLANA_X402_PAY_TO_ADDRESS"],
    process.env["X402_PAY_TO_ADDRESS"],
    process.env["SOLANA_PLATFORM_FEE_RECIPIENT"],
    process.env["SOLANA_DEPLOYER_ADDRESS"],
    process.env["TREASURY_ADDRESS"],
  ];

  return candidates.find((value) => isSolanaAddress(value))?.trim() || "";
}

function getNetwork(): X402SolanaNetwork {
  const explicit = (
    process.env["X402_SOLANA_NETWORK"] ||
    process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] ||
    "mainnet-beta"
  ).toLowerCase();

  return explicit.includes("devnet") ? "solana-devnet" : "solana";
}

function getCluster(): "mainnet-beta" | "devnet" {
  return getNetwork() === "solana-devnet" ? "devnet" : "mainnet-beta";
}

function getSolanaCaip2ChainId(): string {
  return getCluster() === "devnet" ? SOLANA_DEVNET_CAIP2 : SOLANA_MAINNET_CAIP2;
}

function getUsdcMintAddress(): string {
  const explicit = process.env["X402_SOLANA_USDC_MINT"] || process.env["SOLANA_USDC_MINT"];
  if (explicit && isSolanaAddress(explicit)) {
    return explicit;
  }

  return getNetwork() === "solana-devnet" ? DEVNET_USDC_MINT : MAINNET_USDC_MINT;
}

function getConnection(): SolanaConnection {
  const explicit = process.env["X402_SOLANA_RPC_URL"] || process.env["SOLANA_X402_RPC_URL"];
  if (explicit) {
    return new Connection(explicit, "confirmed");
  }

  const appCluster = process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] === "devnet" ? "solana-devnet" : "solana";
  const fallbackRpc = getNetwork() === "solana-devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";

  return new Connection(appCluster === getNetwork() ? getPreferredSolanaRpcUrl() : fallbackRpc, "confirmed");
}

function getPaymentConfirmTimeoutMs(): number {
  const raw = process.env["X402_SOLANA_CONFIRM_TIMEOUT_MS"]?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 5000 && n <= 120_000) return n;
  }
  return 25_000;
}

function shouldSkipPreflightAfterSimulate(): boolean {
  return process.env["X402_SOLANA_PAYMENT_SKIP_PREFLIGHT"]?.trim().toLowerCase() !== "false";
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isX402Enabled(): boolean {
  return Boolean(getPayToAddress());
}

function parseUsdPriceToMicros(price: string): bigint {
  const normalized = price.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error(`Invalid x402 USDC price: ${price}`);
  }

  const [whole, fractional = ""] = normalized.split(".");
  return BigInt(whole) * USDC_BASE_UNITS + BigInt(fractional.padEnd(USDC_DECIMALS, "0"));
}

function encodeHeaderJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeHeaderJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

function getPaymentHeader(request: NextRequest): string | null {
  for (const name of PAYMENT_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value) return value;
  }

  return null;
}

/**
 * Coinbase x402 SVM scheme (and AgentCash's patched exact scheme) require paymentRequirements.extra.feePayer
 * (SOL fee payer pubkey for the assembled transaction message). The fee payer must sign the transaction;
 * since the x402/svm client only signs as the token authority (`partiallySign`), Clawdmint plays facilitator:
 * we declare a fee payer pubkey we control, and complete the partial signature server-side before broadcast.
 */
function getSvmFeePayerKeypair(): SolanaKeypair | undefined {
  const raw =
    process.env["X402_SOLANA_FEE_PAYER_PRIVATE_KEY"]?.trim() ||
    process.env["X402_SVM_FEE_PAYER_PRIVATE_KEY"]?.trim() ||
    process.env["SOLANA_DEPLOYER_PRIVATE_KEY"]?.trim() ||
    "";

  if (!raw) return undefined;

  try {
    if (raw.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (error) {
    console.warn("[x402/solana] Could not parse fee payer private key:", error);
    return undefined;
  }
}

function resolveSvmFeePayer(request: NextRequest): string | undefined {
  const header =
    request.headers.get("x-s402-fee-payer")?.trim() ||
    request.headers.get("x-x402-fee-payer")?.trim();
  if (header && isSolanaAddress(header)) {
    return header;
  }

  const keypair = getSvmFeePayerKeypair();
  if (keypair) {
    return keypair.publicKey.toBase58();
  }

  const envCandidates = [process.env["X402_SOLANA_SVM_FEE_PAYER"], process.env["X402_SVM_FEE_PAYER"]];
  const raw = envCandidates.find((candidate) => candidate && isSolanaAddress(candidate.trim()));
  return raw?.trim();
}

function signWithFeePayer(decoded: DecodedPaymentTransaction, keypair: SolanaKeypair): DecodedPaymentTransaction {
  if (decoded.versioned) {
    decoded.versioned.sign([keypair]);
    const raw = Buffer.from(decoded.versioned.serialize());
    return {
      ...decoded,
      raw,
      signature: signatureFromBytes(decoded.versioned.signatures[0]) ?? decoded.signature,
    };
  }

  if (decoded.legacy) {
    decoded.legacy.partialSign(keypair);
    const raw = Buffer.from(decoded.legacy.serialize({ requireAllSignatures: false, verifySignatures: false }));
    return {
      ...decoded,
      raw,
      signature: decoded.legacy.signature ? bs58.encode(decoded.legacy.signature) : decoded.signature,
    };
  }

  return decoded;
}

function inferDiscoveryInput(request: NextRequest, options: X402Options): X402DiscoveryInputSchema {
  if (options.discovery?.input) {
    return options.discovery.input;
  }

  const method = (request.method?.toUpperCase() || "GET") as X402DiscoveryInputSchema["method"];
  return { type: "http", method };
}

function buildDiscoveryBlocks(
  request: NextRequest,
  options: X402Options
): Pick<SolanaPaymentRequirement, "outputSchema" | "extensions"> {
  const input = inferDiscoveryInput(request, options);
  const output = options.discovery?.output ?? null;

  return {
    outputSchema: { input, output },
    extensions: {
      bazaar: {
        discoverable: true,
        info: {
          name: options.discovery?.name,
          description: options.description,
          category: options.discovery?.category,
          tags: options.discovery?.tags,
          input,
          output,
        },
        inputSchema: input,
        outputSchema: output,
      },
    },
  };
}

function buildPaymentRequirement(request: NextRequest, options: X402Options): SolanaPaymentRequirement {
  const payTo = new PublicKey(getPayToAddress());
  const asset = new PublicKey(getUsdcMintAddress());
  const recipientTokenAccount = getAssociatedTokenAddressSync(asset, payTo, false, TOKEN_PROGRAM_ID);
  const discoveryBlocks = buildDiscoveryBlocks(request, options);
  const svmFeePayer = resolveSvmFeePayer(request);

  return {
    scheme: "exact",
    network: getNetwork(),
    maxAmountRequired: parseUsdPriceToMicros(options.price).toString(),
    resource: request.url,
    description: options.description,
    mimeType: options.mimeType || "application/json",
    payTo: payTo.toBase58(),
    maxTimeoutSeconds: 300,
    asset: asset.toBase58(),
    extra: {
      token: "USDC",
      decimals: USDC_DECIMALS,
      recipientTokenAccount: recipientTokenAccount.toBase58(),
      cluster: getCluster(),
      ...(svmFeePayer ? { feePayer: svmFeePayer } : {}),
    },
    ...discoveryBlocks,
  };
}

function buildPaymentRequiredResponse(requirement: SolanaPaymentRequirement) {
  return {
    x402Version: 1,
    accepts: [requirement],
    payment: {
      protocol: "x402",
      token: "USDC",
      network: requirement.network,
      cluster: requirement.extra.cluster,
      recipientWallet: requirement.payTo,
      tokenAccount: requirement.extra.recipientTokenAccount,
      mint: requirement.asset,
      amount: requirement.maxAmountRequired,
      amountUSDC: Number(requirement.maxAmountRequired) / 1_000_000,
      message: "Send a signed SPL USDC transfer transaction in X-PAYMENT.",
    },
  };
}

/** x402 v2 payment challenge for `PAYMENT-REQUIRED` header (AgentCash CLI, Pay.sh). */
function buildPaymentRequiredV2(
  requirement: SolanaPaymentRequirement,
  error?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    x402Version: 2,
    resource: {
      url: requirement.resource,
      description: requirement.description,
      mimeType: requirement.mimeType,
    },
    accepts: [
      {
        scheme: requirement.scheme,
        network: getSolanaCaip2ChainId(),
        payTo: requirement.payTo,
        maxTimeoutSeconds: requirement.maxTimeoutSeconds,
        asset: requirement.asset,
        amount: requirement.maxAmountRequired,
        extra: { ...requirement.extra },
      },
    ],
  };

  if (requirement.extensions) {
    body.extensions = requirement.extensions as Record<string, unknown>;
  }
  if (error) {
    body.error = error;
  }
  return body;
}

function paymentRequired(requirement: SolanaPaymentRequirement, error?: string, status = 402): NextResponse {
  const body = {
    ...buildPaymentRequiredResponse(requirement),
    ...(error ? { error } : {}),
  };
  const encodedV1 = encodeHeaderJson(body);
  const encodedV2 = encodeHeaderJson(buildPaymentRequiredV2(requirement, error));

  return NextResponse.json(body, {
    status,
    headers: {
      "PAYMENT-REQUIRED": encodedV2,
      "X-PAYMENT-REQUIRED": encodedV1,
      "Accept-Payment": `x402; network="${requirement.network}"; asset="USDC"; amount="${requirement.maxAmountRequired}"`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": `${PAYMENT_REQUIRED_HEADER_NAMES}, ${PAYMENT_RESPONSE_HEADER_NAMES}`,
    },
  });
}

interface NormalizedPaymentHeader {
  x402Version: number;
  transactionBase64: string;
  scheme?: string;
  /** v1 named network or v2 CAIP-2 id */
  network?: string;
}

function normalizePaymentHeader(header: string): NormalizedPaymentHeader {
  const raw = decodeHeaderJson<Record<string, unknown>>(header);
  const version = typeof raw.x402Version === "number" ? raw.x402Version : 1;

  if (version === 2) {
    const v2 = raw as unknown as PaymentPayloadV2Shape;
    const nested = v2.payload;
    const tx =
      nested && typeof nested === "object"
        ? (typeof nested.transaction === "string" ? nested.transaction : undefined) ||
          (typeof nested.serializedTransaction === "string" ? nested.serializedTransaction : undefined)
        : undefined;

    if (!tx) {
      throw new Error("Missing Solana transaction in x402 v2 payment payload");
    }

    const acc = v2.accepted;
    return {
      x402Version: 2,
      transactionBase64: tx,
      scheme: acc?.scheme,
      network: acc?.network,
    };
  }

  const payload = raw as unknown as PaymentPayload;
  const transaction =
    payload.payload?.transaction ||
    payload.payload?.serializedTransaction ||
    payload.transaction ||
    payload.serializedTransaction;

  if (!transaction) {
    throw new Error("Missing Solana transaction in payment payload");
  }

  return {
    x402Version: payload.x402Version || 1,
    transactionBase64: transaction,
    scheme: payload.scheme,
    network: payload.network,
  };
}

function decodeVersioned(raw: Buffer): DecodedPaymentTransaction | null {
  try {
    const tx = VersionedTransaction.deserialize(raw);
    const staticKeys = tx.message.staticAccountKeys;
    const instructions = tx.message.compiledInstructions.map((ix: { programIdIndex: number; accountKeyIndexes: number[]; data: Uint8Array }) => {
      const programId = staticKeys[ix.programIdIndex];
      if (!programId) {
        throw new Error("Versioned transaction uses unsupported address lookup tables");
      }

      const keys = ix.accountKeyIndexes.map((index: number) => {
        const key = staticKeys[index];
        if (!key) {
          throw new Error("Versioned transaction uses unsupported address lookup tables");
        }
        return key;
      });

      return {
        programId,
        keys,
        data: Buffer.from(ix.data),
      };
    });

    return {
      raw,
      versioned: tx,
      instructions,
      signature: signatureFromBytes(tx.signatures[0]),
    };
  } catch {
    return null;
  }
}

function decodeLegacy(raw: Buffer): DecodedPaymentTransaction {
  const tx = Transaction.from(raw);
  return {
    raw,
    legacy: tx,
    instructions: tx.instructions.map((ix: SolanaTransactionInstruction) => ({
      programId: ix.programId,
      keys: ix.keys.map((key: SolanaTransactionInstruction["keys"][number]) => key.pubkey),
      data: Buffer.from(ix.data),
    })),
    signature: tx.signature ? bs58.encode(tx.signature) : undefined,
  };
}

function decodePaymentTransaction(transactionBase64: string): DecodedPaymentTransaction {
  const raw = Buffer.from(transactionBase64, "base64");
  return decodeVersioned(raw) || decodeLegacy(raw);
}

/** Fee payer pubkey (first signer / header account) encoded in the transaction message. */
function getDecodedFeePayerPk(decoded: DecodedPaymentTransaction): SolanaPublicKey | undefined {
  if (decoded.versioned) {
    const k = decoded.versioned.message.staticAccountKeys[0];
    return k;
  }

  const legacyTx = decoded.legacy;
  if (!legacyTx) {
    return undefined;
  }

  if (legacyTx.feePayer) {
    return legacyTx.feePayer;
  }

  try {
    const compiled = legacyTx.compileMessage();
    const k = compiled.accountKeys[0];
    return k;
  } catch {
    return undefined;
  }
}

function signatureFromBytes(signature?: Uint8Array): string | undefined {
  if (!signature || signature.every((byte) => byte === 0)) {
    return undefined;
  }

  return bs58.encode(Buffer.from(signature));
}

function isTokenProgram(programId: SolanaPublicKey): boolean {
  return programId.equals(TOKEN_PROGRAM_ID) || programId.equals(TOKEN_2022_PROGRAM_ID);
}

function readU64LE(data: Buffer, offset: number): bigint {
  if (data.length < offset + 8) {
    return BigInt(0);
  }

  return data.readBigUInt64LE(offset);
}

function verifyTransferInstruction(
  decoded: DecodedPaymentTransaction,
  requirement: SolanaPaymentRequirement
): { valid: boolean; amount: bigint; payer?: string; reason?: string } {
  const expectedRecipient = new PublicKey(requirement.extra.recipientTokenAccount);
  const expectedMint = new PublicKey(requirement.asset);
  const expectedAmount = BigInt(requirement.maxAmountRequired);

  for (const instruction of decoded.instructions) {
    if (!isTokenProgram(instruction.programId) || instruction.data.length < 1) {
      continue;
    }

    const discriminator = instruction.data[0];

    if (discriminator === 3) {
      const amount = readU64LE(instruction.data, 1);
      const destination = instruction.keys[1];
      const authority = instruction.keys[2];

      if (destination?.equals(expectedRecipient) && amount >= expectedAmount) {
        return {
          valid: true,
          amount,
          payer: authority?.toBase58(),
        };
      }
    }

    if (discriminator === 12) {
      const amount = readU64LE(instruction.data, 1);
      const mint = instruction.keys[1];
      const destination = instruction.keys[2];
      const authority = instruction.keys[3];

      if (mint?.equals(expectedMint) && destination?.equals(expectedRecipient) && amount >= expectedAmount) {
        return {
          valid: true,
          amount,
          payer: authority?.toBase58(),
        };
      }
    }
  }

  return {
    valid: false,
    amount: BigInt(0),
    reason: "Transaction does not contain a USDC transfer to the required Clawdmint recipient token account",
  };
}

async function ensureTransactionNotFailed(
  connection: SolanaConnection,
  signature: string
): Promise<ConfirmedTransaction> {
  const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const value = status.value[0];
  if (!value) return null;

  if (value.err) {
    throw new Error("Payment transaction already exists but failed on-chain");
  }

  if (value.confirmationStatus === "confirmed" || value.confirmationStatus === "finalized") {
    return connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  }

  return null;
}

async function simulatePayment(connection: SolanaConnection, decoded: DecodedPaymentTransaction) {
  const result = decoded.versioned
    ? await connection.simulateTransaction(decoded.versioned)
    : await connection.simulateTransaction(decoded.legacy!);

  if (result.value.err) {
    throw new Error(`Payment transaction simulation failed: ${JSON.stringify(result.value.err)}`);
  }
}

/**
 * Default `confirmTransaction` can exceed agent HTTP client timeouts on congested clusters.
 * Poll signature status with a hard cap so we respond before ~30s upstream limits while still validating success.
 */
async function waitForPaymentSignatureLanded(connection: SolanaConnection, signature: string): Promise<void> {
  const deadline = Date.now() + getPaymentConfirmTimeoutMs();
  const intervalMs = 350;

  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = value[0];

    if (status?.err) {
      throw new Error(`Payment transaction failed on-chain: ${JSON.stringify(status.err)}`);
    }

    if (
      status?.confirmationStatus === "processed" ||
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await sleepMs(intervalMs);
  }

  throw new Error(
    "Payment confirmation timed out on Solana RPC; the transaction may still land. Retry the request or check the explorer signature."
  );
}

async function fetchLandedPaymentTransaction(connection: SolanaConnection, signature: string): Promise<ConfirmedTransaction> {
  const fetchDeadline = Date.now() + Math.min(getPaymentConfirmTimeoutMs(), 12_000);

  while (Date.now() < fetchDeadline) {
    const confirmed =
      (await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })) ??
      (await connection.getTransaction(signature, {
        commitment: "processed",
        maxSupportedTransactionVersion: 0,
      }));

    if (confirmed?.meta !== undefined && confirmed.meta !== null) {
      return confirmed;
    }

    await sleepMs(280);
  }

  throw new Error("Payment transaction landed but details were not returned by RPC yet");
}

async function sendAndConfirmPayment(
  connection: SolanaConnection,
  decoded: DecodedPaymentTransaction
): Promise<string> {
  if (decoded.signature) {
    const existing = await ensureTransactionNotFailed(connection, decoded.signature);
    if (existing) {
      return decoded.signature;
    }
  }

  await simulatePayment(connection, decoded);
  const skipPreflight = shouldSkipPreflightAfterSimulate();
  const signature = await connection.sendRawTransaction(decoded.raw, {
    skipPreflight,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });

  await waitForPaymentSignatureLanded(connection, signature);

  return signature;
}

function getTokenBalanceDelta(
  tx: ConfirmedTransaction,
  requirement: SolanaPaymentRequirement
): bigint {
  const preBalances = tx?.meta?.preTokenBalances || [];
  const postBalances = tx?.meta?.postTokenBalances || [];
  const mint = requirement.asset;
  const owner = requirement.payTo;

  let received = BigInt(0);
  for (const post of postBalances) {
    if (post.mint !== mint || post.owner !== owner) {
      continue;
    }

    const pre = preBalances.find((candidate: (typeof preBalances)[number]) => candidate.accountIndex === post.accountIndex);
    const postAmount = BigInt(post.uiTokenAmount.amount);
    const preAmount = BigInt(pre?.uiTokenAmount.amount || "0");
    const delta = postAmount - preAmount;
    if (delta > received) {
      received = delta;
    }
  }

  return received;
}

async function settleSolanaPayment(
  paymentHeader: string,
  requirement: SolanaPaymentRequirement
) {
  const normalized = normalizePaymentHeader(paymentHeader);
  if (normalized.scheme && normalized.scheme !== "exact") {
    throw new Error("Unsupported x402 scheme");
  }

  const paymentNetworksCompatible =
    !normalized.network ||
    normalized.network === requirement.network ||
    normalized.network === getSolanaCaip2ChainId() ||
    (requirement.network === "solana" && normalized.network === SOLANA_MAINNET_CAIP2) ||
    (requirement.network === "solana-devnet" && normalized.network === SOLANA_DEVNET_CAIP2);

  if (!paymentNetworksCompatible) {
    throw new Error(`Payment network mismatch: expected ${requirement.network}`);
  }

  if (normalized.x402Version === 2) {
    const full = decodeHeaderJson(paymentHeader) as unknown as PaymentPayloadV2Shape;
    const acc = full.accepted;
    if (acc) {
      if (acc.payTo && acc.payTo !== requirement.payTo) {
        throw new Error("Payment recipient mismatch");
      }
      if (acc.asset && acc.asset !== requirement.asset) {
        throw new Error("Payment asset mismatch");
      }
      if (acc.amount && acc.amount !== requirement.maxAmountRequired) {
        throw new Error("Payment amount mismatch");
      }
    }
  }

  let decoded = decodePaymentTransaction(normalized.transactionBase64);
  const advertisedFeePayer = requirement.extra.feePayer;
  if (advertisedFeePayer) {
    const feePayerKey = getDecodedFeePayerPk(decoded);
    if (!feePayerKey) {
      throw new Error("Could not determine transaction fee payer for x402 verification");
    }

    if (feePayerKey.toBase58() !== advertisedFeePayer) {
      throw new Error("Transaction fee payer pubkey does not match payment requirement extras");
    }

    const facilitatorKeypair = getSvmFeePayerKeypair();
    if (facilitatorKeypair && facilitatorKeypair.publicKey.toBase58() === advertisedFeePayer) {
      decoded = signWithFeePayer(decoded, facilitatorKeypair);
    }
  }

  const transfer = verifyTransferInstruction(decoded, requirement);
  if (!transfer.valid) {
    throw new Error(transfer.reason || "Invalid payment transaction");
  }

  const connection = getConnection();
  const signature = await sendAndConfirmPayment(connection, decoded);
  const confirmed = await fetchLandedPaymentTransaction(connection, signature);
  const received = getTokenBalanceDelta(confirmed, requirement) || transfer.amount;

  if (received < BigInt(requirement.maxAmountRequired)) {
    throw new Error(`Insufficient USDC received: ${received.toString()}`);
  }

  return {
    success: true,
    x402Version: normalized.x402Version || 1,
    scheme: "exact",
    network: requirement.network,
    transaction: signature,
    payer: transfer.payer,
    amount: received.toString(),
    asset: requirement.asset,
    payTo: requirement.payTo,
    explorerUrl: getTransactionExplorerUrl(signature, getCluster()),
  };
}

export async function withX402Probe(
  request: NextRequest,
  options: X402Options
): Promise<NextResponse> {
  if (!isX402Enabled()) {
    return NextResponse.json(
      {
        error: "x402 not configured on this deployment",
      },
      { status: 503 }
    );
  }

  const requirement = buildPaymentRequirement(request, options);
  return paymentRequired(requirement);
}

export function getX402OwnershipProofs(): string[] {
  const raw = process.env["X402_OWNERSHIP_PROOFS"] || process.env["X402_OWNERSHIP_PROOF"];
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function withX402Payment(
  request: NextRequest,
  options: X402Options,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  if (!isX402Enabled()) {
    return handler();
  }

  const requirement = buildPaymentRequirement(request, options);
  const paymentHeader = getPaymentHeader(request);
  if (!paymentHeader) {
    return paymentRequired(requirement);
  }

  try {
    const settlement = await settleSolanaPayment(paymentHeader, requirement);
    const response = await handler();
    const encoded = encodeHeaderJson(settlement);

    response.headers.set("PAYMENT-RESPONSE", encoded);
    response.headers.set("X-PAYMENT-RESPONSE", encoded);
    response.headers.set("Access-Control-Expose-Headers", `${PAYMENT_REQUIRED_HEADER_NAMES}, ${PAYMENT_RESPONSE_HEADER_NAMES}`);
    return response;
  } catch (error) {
    console.error("[x402/solana] Payment processing failed:", error);
    return paymentRequired(
      requirement,
      error instanceof Error ? error.message : "Payment processing failed"
    );
  }
}

export function getX402PricingInfo() {
  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const network = getNetwork();
  const payTo = getPayToAddress();
  const asset = getUsdcMintAddress();

  return {
    protocol: "x402",
    version: 1,
    network,
    settlement: "solana-spl-token",
    payTo,
    asset,
    currency: "USDC",
    decimals: Number(USDC_DECIMALS),
    openapi: `${baseUrl}/api/x402/openapi.json`,
    endpoints: [
      {
        method: "POST",
        path: "/api/x402/register",
        url: `${baseUrl}/api/x402/register`,
        price: X402_PRICING.REGISTER_AGENT,
        description: "Register a Clawdmint agent and receive a dedicated Solana wallet",
        mimeType: "application/json",
      },
      {
        method: "POST",
        path: "/api/x402/deploy",
        url: `${baseUrl}/api/x402/deploy`,
        price: X402_PRICING.DEPLOY_COLLECTION,
        description: "Deploy a Solana NFT collection after the agent wallet is funded and verified",
        mimeType: "application/json",
      },
      {
        method: "POST",
        path: "/api/x402/agent-token",
        url: `${baseUrl}/api/x402/agent-token`,
        price: X402_PRICING.DEPLOY_AGENT_TOKEN,
        description: "Paid third-party wrapper for launching a Solana-native Metaplex Genesis agent token. Verified owner agents should use POST /api/v1/agent-tokens instead and do not need AgentCash USDC.",
        mimeType: "application/json",
      },
      {
        method: "GET",
        path: "/api/x402/collections",
        url: `${baseUrl}/api/x402/collections`,
        price: X402_PRICING.API_COLLECTIONS_READ,
        description: "List Solana NFT collections with agent info",
        mimeType: "application/json",
      },
      {
        method: "GET",
        path: "/api/x402/stats",
        url: `${baseUrl}/api/x402/stats`,
        price: X402_PRICING.API_STATS_PREMIUM,
        description: "Premium Clawdmint Solana analytics and statistics",
        mimeType: "application/json",
      },
      {
        method: "GET",
        path: "/api/x402/agents",
        url: `${baseUrl}/api/x402/agents`,
        price: X402_PRICING.API_AGENTS_READ,
        description: "List Clawdmint AI agents with Solana profiles",
        mimeType: "application/json",
      },
    ],
  };
}
