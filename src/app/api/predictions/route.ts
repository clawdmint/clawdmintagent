import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GAMMA_API = "https://gamma-api.polymarket.com";
const BANKR_API = "https://api.bankr.bot";

// ─── Types ───────────────────────────────────────────────────────────

export interface PolyMarket {
  id: string;
  condition_id?: string;
  question: string;
  slug: string;
  description: string;
  category: string;
  endDate: string;
  image: string;
  icon: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  volumeNum: number;
  volume24hr: number;
  liquidity: string;
  liquidityNum: number;
  active: boolean;
  closed: boolean;
  new: boolean;
  featured: boolean;
  oneDayPriceChange: number;
  bestBid: number;
  bestAsk: number;
  competitive: number;
  spread: number;
  lastTradePrice: number;
  clobTokenIds?: string;
}

export interface PredictionMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  description: string;
  category: string;
  endDate: string;
  image: string;
  icon: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24h: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  isNew: boolean;
  featured: boolean;
  oneDayPriceChange: number;
  spread: number;
  lastTradePrice: number;
  competitive: number;
  polymarketUrl: string;
  clobTokenIds: string[];
}

// ─── Cache ───────────────────────────────────────────────────────────

const cacheMap = new Map<string, { markets: PredictionMarket[]; timestamp: number }>();
const CACHE_TTL = 45_000;

// ─── Helpers ─────────────────────────────────────────────────────────

function parseOutcomes(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return ["Yes", "No"]; }
}
function parsePrices(raw: string): number[] {
  try { return JSON.parse(raw).map(Number); } catch { return [0.5, 0.5]; }
}
function parseClobTokenIds(raw?: string): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function transformMarket(m: PolyMarket): PredictionMarket {
  return {
    id: m.id,
    conditionId: m.condition_id || "",
    question: m.question,
    slug: m.slug,
    description: m.description || "",
    category: m.category || "Other",
    endDate: m.endDate,
    image: m.image || m.icon || "",
    icon: m.icon || m.image || "",
    outcomes: parseOutcomes(m.outcomes),
    outcomePrices: parsePrices(m.outcomePrices),
    volume: m.volumeNum || parseFloat(m.volume) || 0,
    volume24h: m.volume24hr || 0,
    liquidity: m.liquidityNum || parseFloat(m.liquidity) || 0,
    active: m.active && !m.closed,
    closed: m.closed,
    isNew: m.new || false,
    featured: m.featured || false,
    oneDayPriceChange: m.oneDayPriceChange || 0,
    spread: m.spread || 0,
    lastTradePrice: m.lastTradePrice || 0,
    competitive: m.competitive || 0,
    polymarketUrl: `https://polymarket.com/event/${m.slug}`,
    clobTokenIds: parseClobTokenIds(m.clobTokenIds),
  };
}

// ─── Category keywords ───────────────────────────────────────────────

const categoryKeywords: Record<string, string[]> = {
  politics: ["president", "election", "congress", "government", "trump", "democrat", "republican", "senate", "vote", "party", "biden", "political", "governor", "mayor", "cabinet", "impeach", "legislation", "bill", "law", "executive order", "deport", "tariff", "sanction", "fed", "federal reserve", "nomination"],
  crypto: ["bitcoin", "ethereum", "crypto", "token", "blockchain", "solana", "btc", "eth", "defi", "nft", "coinbase", "binance", "mining", "halving", "stablecoin", "memecoin", "altcoin", "airdrop", "price"],
  sports: ["nfl", "nba", "soccer", "football", "baseball", "ufc", "tennis", "championship", "super bowl", "world cup", "playoffs", "finals", "match", "game", "team", "league", "mlb", "nhl", "premier league", "boxing", "f1", "formula"],
  science: ["ai ", "artificial intelligence", "climate", "space", "nasa", "fda", "science", "technology", "research", "quantum", "medicine", "vaccine", "virus", "openai", "gpt", "neural", "robotics", "mars"],
  culture: ["oscar", "grammy", "movie", "music", "celebrity", "award", "entertainment", "film", "netflix", "spotify", "tiktok", "album", "box office", "emmy", "streaming"],
};

function matchesCategory(m: PredictionMarket, cat: string): boolean {
  const kws = categoryKeywords[cat];
  if (!kws) return true;
  const text = `${m.question} ${m.description}`.toLowerCase();
  return kws.some((kw) => text.includes(kw));
}

// ─── Fetch multiple pages from Gamma API ─────────────────────────────

async function fetchGammaMarkets(limit: number): Promise<PolyMarket[]> {
  const allMarkets: PolyMarket[] = [];
  const seen = new Set<string>();

  const queries = [
    { order: "volume24hr", ascending: "false", limit: String(Math.min(limit, 100)) },
    { order: "liquidity", ascending: "false", limit: "50" },
    { order: "startDate", ascending: "false", limit: "30" },
  ];

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const params = new URLSearchParams({ ...q, closed: "false" });
      const res = await fetch(`${GAMMA_API}/events?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    })
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const events = Array.isArray(result.value) ? result.value : [];

    for (const event of events) {
      if (event.markets && Array.isArray(event.markets)) {
        const subMarkets = [...event.markets]
          .filter((m: PolyMarket) => m.question && m.outcomePrices && m.active !== false)
          .sort((a: PolyMarket, b: PolyMarket) => (b.volumeNum || 0) - (a.volumeNum || 0))
          .slice(0, 5);

        for (const m of subMarkets) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          if (!m.image && event.image) m.image = event.image;
          if (!m.icon && event.icon) m.icon = event.icon;
          if (!m.description && event.description) m.description = event.description;
          if (event.category) m.category = event.category;
          allMarkets.push(m);
        }
      } else if (event.question && event.outcomePrices) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          allMarkets.push(event);
        }
      }
    }
  }

  return allMarkets;
}

// ═══════════════════════════════════════════════════════════════════════
// GET — Fetch markets
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || "";
    const search = url.searchParams.get("q") || "";
    const sort = url.searchParams.get("sort") || "volume";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 200);

    const cacheKey = `all:${limit}`;
    const cached = cacheMap.get(cacheKey);

    let allMarkets: PredictionMarket[];

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      allMarkets = cached.markets;
    } else {
      const raw = await fetchGammaMarkets(limit);
      allMarkets = raw
        .filter((m) => m.question && m.outcomePrices)
        .map(transformMarket);
      cacheMap.set(cacheKey, { markets: allMarkets, timestamp: Date.now() });
    }

    let markets = [...allMarkets];

    if (category) {
      markets = markets.filter((m) => matchesCategory(m, category));
    }
    if (search) {
      const q = search.toLowerCase();
      markets = markets.filter(
        (m) =>
          m.question.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }

    if (sort === "volume") markets.sort((a, b) => b.volume - a.volume);
    else if (sort === "liquidity") markets.sort((a, b) => b.liquidity - a.liquidity);
    else if (sort === "newest") markets.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    else if (sort === "ending") markets.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    else if (sort === "competitive") markets.sort((a, b) => Math.abs(0.5 - a.outcomePrices[0]) - Math.abs(0.5 - b.outcomePrices[0]));

    return NextResponse.json({ success: true, markets, total: markets.length });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch markets" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST — Submit actions (non-blocking) or poll job status
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // ── Poll job status (no API key needed in body, but jobId is) ──
    if (action === "poll") {
      const { apiKey, jobId } = body;
      if (!apiKey || !jobId) {
        return NextResponse.json({ success: false, error: "apiKey and jobId required" }, { status: 400 });
      }

      try {
        const res = await fetch(`${BANKR_API}/agent/job/${jobId}`, {
          headers: { "X-API-Key": apiKey },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return NextResponse.json({ success: false, status: "pending" });
        }
        const data = await res.json();

        if (data.status === "completed") {
          return NextResponse.json({ success: true, status: "completed", response: data.response });
        }
        if (data.status === "failed" || data.status === "cancelled") {
          return NextResponse.json({ success: false, status: "failed", error: data.error || "Job failed" });
        }
        return NextResponse.json({ success: false, status: data.status || "pending" });
      } catch {
        return NextResponse.json({ success: false, status: "pending" });
      }
    }

    // ── All other actions require API key ──
    const { apiKey } = body;
    if (!apiKey || !apiKey.startsWith("bk_")) {
      return NextResponse.json({ success: false, error: "Invalid Bankr API key" }, { status: 400 });
    }

    let prompt: string;

    switch (action) {
      case "bet": {
        const { market, outcome, amount } = body;
        if (!market || !outcome || !amount) {
          return NextResponse.json({ success: false, error: "market, outcome, and amount required" }, { status: 400 });
        }
        prompt = `Place a $${amount} bet on "${outcome}" for the Polymarket question: "${market}"`;
        break;
      }
      case "positions": {
        prompt = "Show my current Polymarket positions and their P&L in detail";
        break;
      }
      case "claim": {
        prompt = "Claim all my resolved Polymarket winnings";
        break;
      }
      case "balance": {
        prompt = "Show my Polymarket wallet balance and USDC balance";
        break;
      }
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }

    // Submit to Bankr and immediately return jobId
    const res = await fetch(`${BANKR_API}/agent/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error || errBody.message || `API error ${res.status}`;
      if (res.status === 403) return NextResponse.json({ success: false, error: "Agent API access not enabled. Enable at bankr.bot/api" }, { status: 403 });
      if (res.status === 401) return NextResponse.json({ success: false, error: "Invalid or expired API key" }, { status: 401 });
      return NextResponse.json({ success: false, error: errMsg }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, jobId: data.jobId, action });
  } catch (error) {
    console.error("Predictions POST error:", error);
    return NextResponse.json({ success: false, error: "Request failed" }, { status: 500 });
  }
}
