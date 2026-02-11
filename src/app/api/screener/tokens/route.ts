import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// BankrScreener Token API v2
// Multi-source: Clanker (Bankr filter + core tokens) + DexScreener
// Smart sorting, dead-token filtering, featured tokens
// ═══════════════════════════════════════════════════════════════════════

const CLANKER_API = "https://www.clanker.world/api/tokens";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";

// ─── Core Bankr ecosystem tokens (always included even if socialInterface != Bankr) ───
const CORE_TOKENS = [
  { symbol: "BNKR", address: "0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b" },
  { symbol: "CLANKER", address: "0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb" },
  { symbol: "CLAWD", address: "0x9f86dB9f08fD27D9222F6917bB67FfC62e0CCA98" },
  { symbol: "MOLT", address: "0xB695559b747183Ff82098F0C3b2e93C3d44a7FEE" },
  { symbol: "BNKRW", address: "0xf48bC234765A7Ce1AbbFEA49505D5E86fA588815" },
  { symbol: "CLAWDIA", address: "0xbbd9aDe14DC19F7d3797B07b52bBf576979C40D6" },
  { symbol: "MACHINES", address: "0x7F6F8bB145c12e7d5D8CD9eC56ED3B03dE9d2981" },
  { symbol: "OPENCLAW", address: "0x5Da9be67963f7C24CF0770b50c35dA6E2EB2c6a9" },
  { symbol: "THINK", address: "0xe6eE5bc3Ee9c8986eFc35CD53f0f2E8da8c12f53" },
  { symbol: "BUTLER", address: "0x84B9C2BE29577E12DfC61C56E5c1D0C49d3bfE8e" },
];

interface ClankerToken {
  id: number;
  created_at: string;
  contract_address: string;
  name: string;
  symbol: string;
  description?: string;
  img_url?: string;
  pool_address?: string;
  type?: string;
  pair?: string;
  chain_id?: number;
  deployed_at?: string;
  tx_hash?: string;
  msg_sender?: string;
  warnings?: string[];
  priceUsd?: number;
  metadata?: {
    socialMediaUrls?: { platform: string; url: string }[];
    auditUrls?: string[];
    description?: string;
  };
  social_context?: {
    platform?: string;
    messageId?: string;
    interface?: string;
  };
  tags?: {
    champagne?: boolean;
    verified?: boolean;
    knownInterfaceDeployer?: boolean;
  };
  related?: {
    user?: {
      username?: string;
      avatar_url?: string;
      display_name?: string;
    };
    market?: {
      marketCap?: number;
      priceUsd?: number;
      priceChangePercent1h?: number;
      priceChangePercent6h?: number;
      priceChangePercent24h?: number;
      priceChange24h?: number;
      volume24h?: number;
    };
  };
}

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { label?: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

export interface ScreenerToken {
  id: number;
  name: string;
  symbol: string;
  contractAddress: string;
  imageUrl: string | null;
  description: string | null;
  deployedAt: string;
  deployer: string | null;
  deployerName: string | null;
  pair: string;
  chainId: number;
  priceUsd: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  volumeH1: number | null;
  volumeH6: number | null;
  volumeM5: number | null;
  txns24h: number | null;
  txnsH1: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buysH1: number | null;
  sellsH1: number | null;
  buysM5: number | null;
  sellsM5: number | null;
  liquidity: number | null;
  marketCap: number | null;
  fdv: number | null;
  dexScreenerUrl: string | null;
  warnings: string[];
  socials: { platform: string; url: string }[];
  website: string | null;
  isCore: boolean;
  isVerified: boolean;
  hasLiquidity: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ═══════════════════════════════════════════════════════════════════════

interface CacheEntry {
  tokens: ScreenerToken[];
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 25_000; // 25 seconds

// ═══════════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════════════════════════════════

// Fetch a single page from Clanker (max 20 per request)
async function fetchClankerPage(params: URLSearchParams): Promise<{ tokens: ClankerToken[]; cursor: string | null }> {
  try {
    const res = await fetch(`${CLANKER_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.error("Clanker API error:", res.status);
      return { tokens: [], cursor: null };
    }
    const json = await res.json();
    return {
      tokens: json.data || [],
      cursor: json.cursor || null,
    };
  } catch (e) {
    console.error("Clanker fetch error:", e);
    return { tokens: [], cursor: null };
  }
}

// Fetch Bankr-interface tokens (multiple pages)
async function fetchBankrTokens(limit: number, sortBy = "market-cap", sort = "desc"): Promise<ClankerToken[]> {
  const allTokens: ClankerToken[] = [];
  let cursor: string | undefined;
  const maxPages = Math.ceil(limit / 20);

  for (let page = 0; page < maxPages; page++) {
    const remaining = limit - allTokens.length;
    if (remaining <= 0) break;

    const params = new URLSearchParams({
      socialInterface: "Bankr",
      includeMarket: "true",
      includeUser: "true",
      sort,
      sortBy,
      limit: String(Math.min(remaining, 20)),
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchClankerPage(params);
    allTokens.push(...result.tokens);
    cursor = result.cursor ?? undefined;

    if (!cursor || result.tokens.length === 0) break;
  }
  return allTokens;
}

// Fetch newest tokens from ALL Clanker (not just Bankr) for New Pairs view
async function fetchNewestTokens(limit: number): Promise<ClankerToken[]> {
  const allTokens: ClankerToken[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  // Fetch up to 8 pages (160 tokens) to get enough after deduplication
  const maxPages = Math.max(Math.ceil(limit / 20), 8);

  for (let page = 0; page < maxPages; page++) {
    if (allTokens.length >= limit) break;

    const params = new URLSearchParams({
      socialInterface: "Bankr",
      includeMarket: "true",
      includeUser: "true",
      sort: "desc",
      sortBy: "deployed-at",
      limit: "20",
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchClankerPage(params);
    
    // Deduplicate by contract_address (Clanker returns dupes)
    for (const token of result.tokens) {
      const addr = token.contract_address?.toLowerCase();
      if (addr && !seen.has(addr)) {
        seen.add(addr);
        allTokens.push(token);
      }
    }
    
    cursor = result.cursor ?? undefined;
    if (!cursor || result.tokens.length === 0) break;
  }
  return allTokens.slice(0, limit);
}

// Fetch core tokens individually from Clanker (by search query)
async function fetchCoreTokens(): Promise<ClankerToken[]> {
  const coreTokens: ClankerToken[] = [];
  const batchSymbols = CORE_TOKENS.map((t) => t.symbol);

  // Fetch each core token by search query (parallel, batch of 5)
  const batches: string[][] = [];
  for (let i = 0; i < batchSymbols.length; i += 5) {
    batches.push(batchSymbols.slice(i, i + 5));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (symbol) => {
        try {
          const params = new URLSearchParams({
            q: symbol,
            includeMarket: "true",
            includeUser: "true",
            sort: "desc",
            sortBy: "market-cap",
            limit: "3",
          });
          const result = await fetchClankerPage(params);
          // Find exact match by contract address
          const coreEntry = CORE_TOKENS.find((c) => c.symbol === symbol);
          if (coreEntry) {
            const match = result.tokens.find(
              (t) => t.contract_address?.toLowerCase() === coreEntry.address.toLowerCase()
            );
            if (match) coreTokens.push(match);
          }
        } catch { /* skip */ }
      })
    );
  }

  return coreTokens;
}

// Fetch search results from Clanker
async function fetchSearchResults(query: string, limit: number): Promise<ClankerToken[]> {
  const params = new URLSearchParams({
    q: query,
    includeMarket: "true",
    includeUser: "true",
    sort: "desc",
    sortBy: "market-cap",
    limit: String(Math.min(limit, 20)),
  });
  const result = await fetchClankerPage(params);
  return result.tokens;
}

// Fetch DexScreener data for multiple addresses
async function fetchDexScreenerData(addresses: string[]): Promise<Map<string, DexPair>> {
  const map = new Map<string, DexPair>();
  if (addresses.length === 0) return map;

  // DexScreener accepts up to 30 addresses comma-separated
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`${DEXSCREENER_API}/${chunk.join(",")}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = await res.json();
        const pairs: DexPair[] = json.pairs || [];

        // Keep the pair with highest liquidity for each token
        for (const pair of pairs) {
          // Only include Base chain pairs
          if (pair.chainId !== "base") continue;
          const addr = pair.baseToken.address.toLowerCase();
          const existing = map.get(addr);
          if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
            map.set(addr, pair);
          }
        }
      } catch (e) {
        console.error("DexScreener fetch error:", e);
      }
    }),
  );

  return map;
}

// ═══════════════════════════════════════════════════════════════════════
// MERGE & TRANSFORM
// ═══════════════════════════════════════════════════════════════════════

function mergeData(clankerTokens: ClankerToken[], dexData: Map<string, DexPair>): ScreenerToken[] {
  return clankerTokens.map((token) => {
    const addr = token.contract_address?.toLowerCase() || "";
    const dex = dexData.get(addr);
    const market = token.related?.market;
    const isCore = CORE_TOKENS.some((c) => c.address.toLowerCase() === addr);

    // Merge social links from Clanker metadata + DexScreener info
    const socialMap = new Map<string, string>();
    let website: string | null = null;

    if (token.metadata?.socialMediaUrls) {
      for (const s of token.metadata.socialMediaUrls) {
        const platform = s.platform?.toLowerCase().trim();
        if (platform && s.url) {
          if (platform === "website" || platform === "web") {
            website = s.url;
          } else {
            socialMap.set(platform, s.url);
          }
        }
      }
    }

    if (dex?.info?.socials) {
      for (const s of dex.info.socials) {
        const platform = s.type?.toLowerCase().trim();
        if (platform && s.url && !socialMap.has(platform)) {
          socialMap.set(platform, s.url);
        }
      }
    }

    if (!website && dex?.info?.websites && dex.info.websites.length > 0) {
      website = dex.info.websites[0].url;
    }

    const socials = Array.from(socialMap.entries()).map(([platform, url]) => ({ platform, url }));

    // Use DexScreener as primary price source, fall back to Clanker
    const priceUsd = dex ? parseFloat(dex.priceUsd) : (token.priceUsd ?? market?.priceUsd ?? null);
    const marketCap = dex?.marketCap ?? market?.marketCap ?? null;
    const volume24h = dex?.volume?.h24 ?? market?.volume24h ?? null;
    const liquidity = dex?.liquidity?.usd ?? null;

    // Price changes: DexScreener > Clanker related.market
    const priceChange1h = dex?.priceChange?.h1 ?? market?.priceChangePercent1h ?? null;
    const priceChange6h = dex?.priceChange?.h6 ?? market?.priceChangePercent6h ?? null;
    const priceChange24h = dex?.priceChange?.h24 ?? market?.priceChangePercent24h ?? market?.priceChange24h ?? null;

    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      contractAddress: token.contract_address,
      imageUrl: token.img_url || dex?.info?.imageUrl || null,
      description: token.description || null,
      deployedAt: token.deployed_at || token.created_at,
      deployer: token.msg_sender || null,
      deployerName: token.related?.user?.display_name || token.related?.user?.username || null,
      pair: token.pair || "WETH",
      chainId: token.chain_id || 8453,
      priceUsd,
      priceChange5m: dex?.priceChange?.m5 ?? null,
      priceChange1h,
      priceChange6h,
      priceChange24h,
      volume24h,
      volumeH1: dex?.volume?.h1 ?? null,
      volumeH6: dex?.volume?.h6 ?? null,
      volumeM5: dex?.volume?.m5 ?? null,
      txns24h: dex ? dex.txns.h24.buys + dex.txns.h24.sells : null,
      txnsH1: dex ? dex.txns.h1.buys + dex.txns.h1.sells : null,
      buys24h: dex?.txns?.h24?.buys ?? null,
      sells24h: dex?.txns?.h24?.sells ?? null,
      buysH1: dex?.txns?.h1?.buys ?? null,
      sellsH1: dex?.txns?.h1?.sells ?? null,
      buysM5: dex?.txns?.m5?.buys ?? null,
      sellsM5: dex?.txns?.m5?.sells ?? null,
      liquidity,
      marketCap,
      fdv: dex?.fdv ?? null,
      dexScreenerUrl: dex?.url ?? `https://dexscreener.com/base/${addr}`,
      warnings: token.warnings || [],
      socials,
      website,
      isCore,
      isVerified: !!token.tags?.champagne || !!token.tags?.verified,
      hasLiquidity: (liquidity ?? 0) > 100,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SORT & FILTER
// ═══════════════════════════════════════════════════════════════════════

type SortField = "market-cap" | "volume-24h" | "price-percent-h24" | "price-percent-h1" | "deployed-at" | "liquidity" | "txns-24h";

function sortTokens(tokens: ScreenerToken[], sortBy: SortField, sortDir: "asc" | "desc"): ScreenerToken[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...tokens].sort((a, b) => {
    let aVal: number;
    let bVal: number;

    switch (sortBy) {
      case "market-cap":
        aVal = a.marketCap ?? 0;
        bVal = b.marketCap ?? 0;
        break;
      case "volume-24h":
        aVal = a.volume24h ?? 0;
        bVal = b.volume24h ?? 0;
        break;
      case "price-percent-h24":
        aVal = a.priceChange24h ?? 0;
        bVal = b.priceChange24h ?? 0;
        break;
      case "price-percent-h1":
        aVal = a.priceChange1h ?? 0;
        bVal = b.priceChange1h ?? 0;
        break;
      case "deployed-at":
        aVal = new Date(a.deployedAt).getTime();
        bVal = new Date(b.deployedAt).getTime();
        break;
      case "liquidity":
        aVal = a.liquidity ?? 0;
        bVal = b.liquidity ?? 0;
        break;
      case "txns-24h":
        aVal = a.txns24h ?? 0;
        bVal = b.txns24h ?? 0;
        break;
      default:
        aVal = a.marketCap ?? 0;
        bVal = b.marketCap ?? 0;
    }

    return (aVal - bVal) * dir;
  });
}

function filterDeadTokens(tokens: ScreenerToken[], keepCore: boolean): ScreenerToken[] {
  return tokens.filter((t) => {
    // Always keep core tokens
    if (keepCore && t.isCore) return true;
    // A token is "real" if it has DexScreener data (liquidity, volume, or txns)
    const hasDexData = (t.liquidity ?? 0) > 50 || (t.volume24h ?? 0) > 0 || (t.txns24h ?? 0) > 0;
    if (hasDexData) return true;
    // Without DexScreener data, only keep if Clanker mcap is very high (likely real)
    // Tokens at ~$50K mcap with 0 activity are ghost tokens
    if ((t.marketCap ?? 0) > 200_000 && t.priceUsd && t.priceUsd > 0) return true;
    // Filter out ghost tokens
    return false;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sortDir = (url.searchParams.get("sort") || "desc") as "asc" | "desc";
    const sortByRaw = url.searchParams.get("sortBy") || "market-cap";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "60"), 200);
    const query = url.searchParams.get("q") || undefined;
    const noCache = url.searchParams.get("noCache") === "true";

    // Map legacy sort values
    const sortByMap: Record<string, SortField> = {
      "market-cap": "market-cap",
      "deployed-at": "deployed-at",
      "price-percent-h24": "price-percent-h24",
      "volume-24h": "volume-24h",
      "liquidity": "liquidity",
      "txns-24h": "txns-24h",
    };
    const sortBy: SortField = sortByMap[sortByRaw] || "market-cap";

    // Cache key
    const cacheKey = query ? `search:${query}` : `${sortBy}:${sortDir}:${limit}`;
    const cached = cache.get(cacheKey);
    if (!noCache && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        success: true,
        tokens: cached.tokens,
        total: cached.tokens.length,
        cached: true,
      });
    }

    let allClankerTokens: ClankerToken[] = [];

    if (query) {
      // ─── SEARCH MODE ───
      allClankerTokens = await fetchSearchResults(query, limit);
    } else if (sortBy === "deployed-at") {
      // ─── NEW PAIRS MODE: Fetch newest tokens from all Clanker ───
      allClankerTokens = await fetchNewestTokens(Math.min(limit, 200));
    } else {
      // ─── MAIN MODE: Bankr tokens + Core tokens ───
      const [bankrTokens, coreTokens] = await Promise.all([
        fetchBankrTokens(Math.min(limit, 100)),
        fetchCoreTokens(),
      ]);

      // Merge, deduplicate by contract_address
      const seen = new Set<string>();
      allClankerTokens = [];

      // Core tokens first
      for (const token of coreTokens) {
        const addr = token.contract_address?.toLowerCase();
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          allClankerTokens.push(token);
        }
      }

      // Then Bankr-interface tokens
      for (const token of bankrTokens) {
        const addr = token.contract_address?.toLowerCase();
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          allClankerTokens.push(token);
        }
      }
    }

    // ─── Fetch DexScreener data for all tokens ───
    const addresses = allClankerTokens
      .map((t) => t.contract_address)
      .filter(Boolean);
    const dexData = await fetchDexScreenerData(addresses);

    // ─── Merge data ───
    let tokens = mergeData(allClankerTokens, dexData);

    // ─── Filter dead tokens (unless searching or viewing new pairs) ───
    if (!query && sortBy !== "deployed-at") {
      tokens = filterDeadTokens(tokens, true);
    } else if (sortBy === "deployed-at") {
      // For "new pairs" view, only filter truly empty tokens (no contract, no name)
      tokens = tokens.filter((t) => t.contractAddress && t.symbol);
      // Deduplicate by contract address (Clanker sometimes returns duplicates)
      const deduped = new Map<string, ScreenerToken>();
      for (const t of tokens) {
        const key = t.contractAddress.toLowerCase();
        if (!deduped.has(key)) deduped.set(key, t);
      }
      tokens = Array.from(deduped.values());
    }

    // ─── Sort by actual DexScreener data (not Clanker's stale data) ───
    tokens = sortTokens(tokens, sortBy, sortDir);

    // ─── Apply limit ───
    tokens = tokens.slice(0, limit);

    // ─── Cache ───
    cache.set(cacheKey, { tokens, timestamp: Date.now() });

    return NextResponse.json({
      success: true,
      tokens,
      total: tokens.length,
      cached: false,
    });
  } catch (error) {
    console.error("Screener API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch token data" },
      { status: 500 },
    );
  }
}
