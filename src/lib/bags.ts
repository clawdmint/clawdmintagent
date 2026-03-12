import { getEnv } from "./env";
import { calculateBagsScore, type StoredBagsRecipientConfig } from "./collection-bags";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

const BAGS_API_BASE = "https://public-api-v2.bags.fm";

export interface BagsTokenInfoRequest {
  name: string;
  symbol: string;
  image: string;
  description?: string | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
}

export interface BagsPreparedTokenInfo {
  tokenMint: string;
  tokenMetadata?: string | null;
  tokenLaunch?: string | null;
  ipfs?: string | null;
  metadataUri?: string | null;
}

export interface BagsPreparedFeeShareConfig {
  configKey: string;
  transactions: string[];
  transactionsBase64: string[];
  transactionBundleIds: string[];
}

export interface BagsPreparedLaunchTransaction {
  transaction: string;
  transactionBase64: string;
}

export interface BagsCollectionAnalytics {
  lifetimeFeesLamports: string | null;
  claimedFeesLamports: string | null;
  creatorsCount: number;
  score: number;
  rawLifetime: unknown;
  rawClaimStats: unknown;
  rawCreators: unknown;
}

interface BagsLaunchRequest {
  tokenMint: string;
  tokenMetadata?: string | null;
  tokenLaunch?: string | null;
  ipfs?: string | null;
  wallet: string;
  configKey?: string | null;
  initialBuyLamports: string;
}

interface FeeShareWalletLookup {
  provider: "twitter" | "kick" | "github";
  username: string;
}

export function isBagsConfigured(): boolean {
  return Boolean(getEnv("BAGS_API_KEY", ""));
}

function getBagsApiBaseUrl(): string {
  return getEnv("BAGS_API_BASE_URL", BAGS_API_BASE).replace(/\/$/, "");
}

function getBagsApiKey(): string {
  const apiKey = getEnv("BAGS_API_KEY", "");
  if (!apiKey) {
    throw new Error("BAGS_API_KEY not configured");
  }
  return apiKey;
}

async function bagsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBagsApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getBagsApiKey(),
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && "message" in data && typeof data.message === "string" && data.message) ||
      (data && typeof data === "object" && "error" in data && typeof data.error === "string" && data.error) ||
      `Bags API error (${response.status})`;
    throw new Error(detail);
  }

  return data as T;
}

function getPayloadCandidates(payload: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [payload];

  for (const key of ["response", "data", "result"]) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      candidates.push(value as Record<string, unknown>);
    }
  }

  return candidates;
}

function extractStringValue(payload: Record<string, unknown>, keys: string[]): string | null {
  const candidates = getPayloadCandidates(payload);
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function extractStringArrayValue(payload: Record<string, unknown>, keys: string[]): string[] {
  const candidates = getPayloadCandidates(payload);
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (Array.isArray(value)) {
        return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
      }
    }
  }

  return [];
}

function tryParseSerializedTransaction(bytes: Buffer): boolean {
  try {
    VersionedTransaction.deserialize(bytes);
    return true;
  } catch {
    try {
      Transaction.from(bytes);
      return true;
    } catch {
      return false;
    }
  }
}

function normalizeSerializedTransaction(serialized: string): string {
  const trimmed = serialized.trim();
  if (!trimmed) {
    throw new Error("Empty Bags transaction payload");
  }

  const base64Bytes = Buffer.from(trimmed, "base64");
  if (base64Bytes.length > 0 && tryParseSerializedTransaction(base64Bytes)) {
    return base64Bytes.toString("base64");
  }

  const base58Bytes = Buffer.from(bs58.decode(trimmed));
  if (base58Bytes.length > 0 && tryParseSerializedTransaction(base58Bytes)) {
    return base58Bytes.toString("base64");
  }

  throw new Error("Unexpected Bags transaction encoding");
}

export async function createBagsTokenInfo(input: BagsTokenInfoRequest): Promise<BagsPreparedTokenInfo> {
  const payload = await bagsFetch<Record<string, unknown>>("/api/v1/token-launch/create-token-info", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      symbol: input.symbol,
      image: input.image,
      description: input.description || undefined,
      website: input.website || undefined,
      twitter: input.twitter || undefined,
      telegram: input.telegram || undefined,
    }),
  });

  const tokenMint = extractStringValue(payload, ["tokenMint", "token_mint"]);
  const tokenMetadata = extractStringValue(payload, ["tokenMetadata", "token_metadata"]);
  const tokenLaunch = extractStringValue(payload, ["tokenLaunch", "token_launch"]);
  const ipfs = extractStringValue(payload, ["ipfs", "metadataUri", "metadata_uri", "uri"]);

  if (!tokenMint) {
    throw new Error("Unexpected Bags token-info response");
  }

  return {
    tokenMint,
    tokenMetadata,
    tokenLaunch,
    ipfs,
    metadataUri: ipfs,
  };
}

export async function lookupBagsFeeShareWallet(input: FeeShareWalletLookup): Promise<string> {
  const params = new URLSearchParams({
    provider: input.provider,
    username: input.username,
  });

  const payload = await bagsFetch<Record<string, unknown>>(`/api/v1/fee-share/wallet/v2?${params.toString()}`, {
    method: "GET",
  });

  const wallet =
    extractStringValue(payload, ["wallet", "feeShareWallet", "fee_share_wallet"]) ||
    extractStringValue((payload.result as Record<string, unknown>) || {}, ["wallet", "feeShareWallet", "fee_share_wallet"]);

  if (!wallet) {
    throw new Error(`Could not resolve Bags fee share wallet for ${input.provider}:${input.username}`);
  }

  return wallet;
}

export async function createBagsFeeShareConfig(input: {
  payer: string;
  baseMint: string;
  feeShares: StoredBagsRecipientConfig[];
  partnerWallet?: string | null;
  partnerConfig?: string | null;
}): Promise<BagsPreparedFeeShareConfig> {
  const claimersArray = input.feeShares.map((entry) => {
    if (!entry.wallet) {
      throw new Error(`Missing wallet for ${entry.label} fee share`);
    }
    return entry.wallet;
  });

  const basisPointsArray = input.feeShares.map((entry) => entry.bps);
  const payload = await bagsFetch<Record<string, unknown>>("/api/v1/fee-share/config", {
    method: "POST",
    body: JSON.stringify({
      payer: input.payer,
      baseMint: input.baseMint,
      claimersArray,
      basisPointsArray,
      partner: input.partnerWallet || undefined,
      partnerConfig: input.partnerConfig || undefined,
    }),
  });

  const configKey = extractStringValue(payload, ["configKey", "config_key"]);
  const transactions = extractStringArrayValue(payload, ["transactions"]);
  const transactionBundleIds = extractStringArrayValue(payload, ["transactionBundleIds", "transaction_bundle_ids"]);

  if (!configKey) {
    throw new Error("Unexpected Bags fee-share response");
  }

  return {
    configKey,
    transactions,
    transactionsBase64: transactions.map(normalizeSerializedTransaction),
    transactionBundleIds,
  };
}

export async function createBagsLaunchTransaction(
  input: BagsLaunchRequest
): Promise<BagsPreparedLaunchTransaction> {
  const payload = await bagsFetch<Record<string, unknown>>("/api/v1/token-launch/create-launch-transaction", {
    method: "POST",
    body: JSON.stringify({
      tokenMint: input.tokenMint,
      tokenMetadata: input.tokenMetadata || input.ipfs || undefined,
      tokenLaunch: input.tokenLaunch || undefined,
      ipfs: input.ipfs || input.tokenMetadata || undefined,
      wallet: input.wallet,
      configKey: input.configKey || undefined,
      initialBuyLamports: input.initialBuyLamports,
    }),
  });

  const transaction = extractStringValue(payload, ["transaction", "serializedTransaction", "serialized_transaction"]);
  if (!transaction) {
    throw new Error("Unexpected Bags launch transaction response");
  }

  return {
    transaction,
    transactionBase64: normalizeSerializedTransaction(transaction),
  };
}

function extractLamportsFromPayload(payload: Record<string, unknown>): string | null {
  const keys = [
    "lifetimeFeesLamports",
    "claimedFeesLamports",
    "totalFeesEarned",
    "totalFeesClaimed",
    "totalFeesEarnedByCreator",
    "totalFeesClaimedByCreator",
    "feesEarned",
    "feesClaimed",
  ];

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value).toString();
    }
  }

  return null;
}

export async function fetchBagsCollectionAnalytics(tokenMint: string): Promise<BagsCollectionAnalytics> {
  const [lifetimePayload, claimStatsPayload, creatorsPayload] = await Promise.all([
    bagsFetch<Record<string, unknown>>(`/api/v1/creator/${tokenMint}/lifetime-fees-earned`, { method: "GET" }),
    bagsFetch<Record<string, unknown>>(`/api/v1/creator/${tokenMint}/claim-stats`, { method: "GET" }),
    bagsFetch<Record<string, unknown>>(`/api/v1/creator/${tokenMint}/token-creators`, { method: "GET" }),
  ]);

  const lifetimeFeesLamports =
    extractLamportsFromPayload(lifetimePayload) ||
    extractLamportsFromPayload((lifetimePayload.data as Record<string, unknown>) || {});
  const claimedFeesLamports =
    extractLamportsFromPayload(claimStatsPayload) ||
    extractLamportsFromPayload((claimStatsPayload.data as Record<string, unknown>) || {});
  const creators =
    (Array.isArray(creatorsPayload.creators) && creatorsPayload.creators) ||
    (Array.isArray((creatorsPayload.data as Record<string, unknown>)?.creators) &&
      ((creatorsPayload.data as Record<string, unknown>).creators as unknown[])) ||
    [];

  return {
    lifetimeFeesLamports,
    claimedFeesLamports,
    creatorsCount: creators.length,
    score: calculateBagsScore(lifetimeFeesLamports, claimedFeesLamports),
    rawLifetime: lifetimePayload,
    rawClaimStats: claimStatsPayload,
    rawCreators: creatorsPayload,
  };
}
