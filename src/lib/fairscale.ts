import { getEnv } from "./env";
import { prisma } from "./db";

const FAIRSCALE_DEFAULT_BASE_URL = "https://api.fairscale.xyz";
const SUCCESS_TTL_MS = 30 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;
const FAIRSCALE_CACHE_VERSION = "v2";
const UPSERT_DISABLE_ERROR_MARKERS = [
  "fairscalescorecache",
  "does not exist",
  "unknown field",
  "invalid `prisma.fairscaleScoreCache",
];

type FairScaleCacheEntry = {
  expiresAt: number;
  value: WalletReputation | null;
};

type PersistedFairScaleCache = {
  payload: WalletReputation;
  fetchedAt: Date;
  expiresAt: Date;
  availability: string;
};

type FairScaleRawResponse = {
  fairscore?: number | string | null;
  fairScore?: number | string | null;
  fairscore_base?: number | string | null;
  fairscoreBase?: number | string | null;
  score?: number | string | null;
  wallet_score?: number | string | null;
  walletScore?: number | string | null;
  social_score?: number | string | null;
  socialScore?: number | string | null;
  tier?: string | null;
  badges?: unknown;
  features?: Record<string, unknown> | null;
  error?: string;
  message?: string;
};

export type WalletReputation = {
  walletAddress: string;
  score: number | null;
  walletScore: number | null;
  socialScore: number | null;
  tier: string | null;
  badges: string[];
  availability: "available" | "rate_limited" | "unavailable";
  trustSignal: "trusted" | "established" | "monitor" | "warning" | "unscored";
  profileState: "established" | "thin" | "unscored";
  isThinProfile: boolean;
  warningLabel: string | null;
  warningText: string | null;
  breakdown: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  fetchedAt: string;
};


function getFairscaleCache() {
  const globalKey = "__clawdmintFairscaleCache";
  const target = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, FairScaleCacheEntry>;
  };

  if (!target[globalKey]) {
    target[globalKey] = new Map<string, FairScaleCacheEntry>();
  }

  return target[globalKey]!;
}

function getFairscaleApiBaseUrl() {
  return getEnv("FAIRSCALE_API_BASE_URL", FAIRSCALE_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getFairscaleApiKey() {
  return getEnv("FAIRSCALE_API_KEY", "");
}

function hydratePersistedReputation(record: PersistedFairScaleCache | null): WalletReputation | null {
  if (!record || !record.payload || typeof record.payload !== "object") {
    return null;
  }

  return record.payload;
}

async function readPersistedReputation(walletAddress: string) {
  try {
    const record = await prisma.fairscaleScoreCache.findUnique({
      where: { walletAddress },
      select: {
        payload: true,
        fetchedAt: true,
        expiresAt: true,
        availability: true,
      },
    });

    if (!record) {
      return null;
    }

    return {
      payload: hydratePersistedReputation(record as PersistedFairScaleCache),
      fetchedAt: record.fetchedAt,
      expiresAt: record.expiresAt,
      availability: record.availability,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (UPSERT_DISABLE_ERROR_MARKERS.some((marker) => message.includes(marker))) {
      return null;
    }
    throw error;
  }
}

async function persistReputation(
  walletAddress: string,
  reputation: WalletReputation,
  expiresAt: Date,
) {
  try {
    await prisma.fairscaleScoreCache.upsert({
      where: { walletAddress },
      update: {
        payload: reputation,
        availability: reputation.availability,
        fetchedAt: new Date(reputation.fetchedAt),
        expiresAt,
      },
      create: {
        walletAddress,
        payload: reputation,
        availability: reputation.availability,
        fetchedAt: new Date(reputation.fetchedAt),
        expiresAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (UPSERT_DISABLE_ERROR_MARKERS.some((marker) => message.includes(marker))) {
      return;
    }
    throw error;
  }
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeBadgeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const named = (entry as { name?: unknown; label?: unknown }).name ?? (entry as { label?: unknown }).label;
        if (typeof named === "string") return named;
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4);
}

function humanizeFeatureKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildBreakdown(features: Record<string, unknown> | null | undefined) {
  if (!features) {
    return [];
  }

  return Object.entries(features)
    .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim().length > 0)
    .slice(0, 6)
    .map(([key, value]) => ({
      key,
      label: humanizeFeatureKey(key),
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

function getBreakdownValue(
  features: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!features || !(key in features)) {
    return null;
  }

  return normalizeNumber(features[key]);
}

function deriveWalletScore(payload: FairScaleRawResponse, overallScore: number | null) {
  const direct =
    normalizeNumber(payload.wallet_score) ??
    normalizeNumber(payload.walletScore) ??
    normalizeNumber(payload.fairscore_base) ??
    normalizeNumber(payload.fairscoreBase);

  if (direct !== null) {
    return direct;
  }

  const percentileSignals = [
    getBreakdownValue(payload.features, "lst_percentile_score"),
    getBreakdownValue(payload.features, "major_percentile_score"),
    getBreakdownValue(payload.features, "stable_percentile_score"),
    getBreakdownValue(payload.features, "native_sol_percentile"),
  ].filter((value): value is number => value !== null);

  if (percentileSignals.length > 0) {
    const average =
      percentileSignals.reduce((sum, value) => sum + value, 0) / percentileSignals.length;
    return Number(average.toFixed(1));
  }

  return overallScore;
}

function deriveSocialScore(payload: FairScaleRawResponse) {
  return (
    normalizeNumber(payload.social_score) ??
    normalizeNumber(payload.socialScore) ??
    0
  );
}

function deriveTrustSignal(score: number | null): WalletReputation["trustSignal"] {
  if (score === null) return "unscored";
  if (score >= 80) return "trusted";
  if (score >= 60) return "established";
  if (score >= 35) return "monitor";
  return "warning";
}

function deriveWarning(score: number | null) {
  if (score === null) {
    return {
      warningLabel: "Score unavailable",
      warningText: "FairScale did not return enough agent evaluation data for this address yet.",
    };
  }

  if (score < 35) {
    return {
      warningLabel: "Low Fair Score",
      warningText: "This agent currently scores low on trust and activity signals. Treat launches and market activity with additional caution.",
    };
  }

  if (score < 60) {
    return {
      warningLabel: "Limited history",
      warningText: "This agent is still building signal quality. Monitor launch quality and collector behavior closely.",
    };
  }

  return {
    warningLabel: null,
    warningText: null,
  };
}

function deriveProfileState(payload: FairScaleRawResponse, score: number | null) {
  const txCount = getBreakdownValue(payload.features, "tx_count");
  const activeDays = getBreakdownValue(payload.features, "active_days");
  const socialScore = deriveSocialScore(payload);
  const walletScore = deriveWalletScore(payload, score);

  if (score === null) {
    return {
      isThinProfile: false,
      profileState: "unscored" as const,
    };
  }

  const thinByActivity =
    (txCount !== null && txCount <= 1) ||
    (activeDays !== null && activeDays <= 1);

  const thinBySignals = score < 50 && (socialScore ?? 0) === 0 && walletScore === null;

  if (thinByActivity || thinBySignals) {
    return {
      isThinProfile: true,
      profileState: "thin" as const,
    };
  }

  return {
    isThinProfile: false,
    profileState: "established" as const,
  };
}

function normalizeReputation(walletAddress: string, payload: FairScaleRawResponse): WalletReputation {
  const score =
    normalizeNumber(payload.fairscore) ??
    normalizeNumber(payload.fairScore) ??
    normalizeNumber(payload.score);

  const walletScore = deriveWalletScore(payload, score);
  const socialScore = deriveSocialScore(payload);

  const trustSignal = deriveTrustSignal(score);
  const { isThinProfile, profileState } = deriveProfileState(payload, score);
  const { warningLabel, warningText } = deriveWarning(score);
  const effectiveWarning =
    isThinProfile
      ? {
          warningLabel: "Early wallet",
          warningText:
            "This Fair Score is based on a very fresh agent wallet profile. Treat it as preliminary until the agent builds more history.",
        }
      : { warningLabel, warningText };

  return {
    walletAddress,
    score,
    walletScore,
    socialScore,
    tier: typeof payload.tier === "string" && payload.tier.trim().length > 0 ? payload.tier : null,
    badges: normalizeBadgeList(payload.badges),
    availability: "available",
    trustSignal,
    profileState,
    isThinProfile,
    warningLabel: effectiveWarning.warningLabel,
    warningText: effectiveWarning.warningText,
    breakdown: buildBreakdown(payload.features),
    fetchedAt: new Date().toISOString(),
  };
}

function buildUnavailableReputation(
  walletAddress: string,
  availability: WalletReputation["availability"],
): WalletReputation {
  const isRateLimited = availability === "rate_limited";

  return {
    walletAddress,
    score: null,
    walletScore: null,
    socialScore: null,
    tier: null,
    badges: [],
    availability,
    trustSignal: "unscored",
    profileState: "unscored",
    isThinProfile: false,
    warningLabel: isRateLimited ? "Rate limited" : "Temporarily unavailable",
    warningText: isRateLimited
      ? "FairScale is rate limiting this wallet lookup right now. We will retry automatically once the limit clears."
      : "FairScale reputation is temporarily unavailable for this wallet. Launch trust will appear again when the upstream check succeeds.",
    breakdown: [],
    fetchedAt: new Date().toISOString(),
  };
}

export async function getWalletReputation(walletAddress: string): Promise<WalletReputation | null> {
  const trimmedAddress = walletAddress.trim();
  if (!trimmedAddress) {
    return null;
  }

  const apiKey = getFairscaleApiKey();
  if (!apiKey) {
    return null;
  }

  const cacheKey = `${FAIRSCALE_CACHE_VERSION}:${trimmedAddress.toLowerCase()}`;
  const cache = getFairscaleCache();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const persisted = await readPersistedReputation(trimmedAddress);
  if (persisted?.payload && persisted.expiresAt.getTime() > Date.now()) {
    cache.set(cacheKey, {
      expiresAt: persisted.expiresAt.getTime(),
      value: persisted.payload,
    });
    return persisted.payload;
  }

  const url = new URL("/score", getFairscaleApiBaseUrl());
  url.searchParams.set("wallet", trimmedAddress);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        fairkey: apiKey,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      if (persisted?.payload) {
        cache.set(cacheKey, {
          expiresAt: Date.now() + ERROR_TTL_MS,
          value: persisted.payload,
        });
        return persisted.payload;
      }

      const fallback =
        response.status === 429
          ? buildUnavailableReputation(trimmedAddress, "rate_limited")
          : buildUnavailableReputation(trimmedAddress, "unavailable");
      cache.set(cacheKey, {
        expiresAt: Date.now() + ERROR_TTL_MS,
        value: fallback,
      });
      return fallback;
    }

    const payload = (await response.json()) as FairScaleRawResponse;
    const normalized = normalizeReputation(trimmedAddress, payload);
    const successExpiresAt = new Date(Date.now() + SUCCESS_TTL_MS);
    cache.set(cacheKey, {
      expiresAt: successExpiresAt.getTime(),
      value: normalized,
    });
    await persistReputation(trimmedAddress, normalized, successExpiresAt);
    return normalized;
  } catch (error) {
    console.warn("FairScale lookup failed:", error);
    if (persisted?.payload) {
      cache.set(cacheKey, {
        expiresAt: Date.now() + ERROR_TTL_MS,
        value: persisted.payload,
      });
      return persisted.payload;
    }

    const fallback = buildUnavailableReputation(trimmedAddress, "unavailable");
    cache.set(cacheKey, {
      expiresAt: Date.now() + ERROR_TTL_MS,
      value: fallback,
    });
    return fallback;
  }
}
