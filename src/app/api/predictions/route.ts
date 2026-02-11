import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// Predictions API — Polymarket Gamma API proxy + Bankr Agent bets
// ═══════════════════════════════════════════════════════════════════════

const GAMMA_API = "https://gamma-api.polymarket.com";
const BANKR_API = "https://api.bankr.bot";

// ─── Types ───────────────────────────────────────────────────────────

export interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  description: string;
  category: string;
  endDate: string;
  image: string;
  icon: string;
  outcomes: string; // JSON stringified array e.g. '["Yes","No"]'
  outcomePrices: string; // JSON stringified e.g. '["0.65","0.35"]'
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
}

export interface PredictionMarket {
  id: string;
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
  polymarketUrl: string;
}

// ─── Cache ───────────────────────────────────────────────────────────

const cacheMap = new Map<string, { markets: PredictionMarket[]; timestamp: number }>();
const CACHE_TTL = 60_000; // 60 seconds

// ─── Helpers ─────────────────────────────────────────────────────────

function parseOutcomes(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return ["Yes", "No"];
  }
}

function parsePrices(raw: string): number[] {
  try {
    return JSON.parse(raw).map(Number);
  } catch {
    return [0.5, 0.5];
  }
}

function transformMarket(m: PolyMarket): PredictionMarket {
  return {
    id: m.id,
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
    polymarketUrl: `https://polymarket.com/event/${m.slug}`,
  };
}

// ─── Bankr Agent (for placing bets) ─────────────────────────────────

async function submitBankrPrompt(apiKey: string, prompt: string): Promise<{ jobId: string } | { error: string }> {
  const res = await fetch(`${BANKR_API}/agent/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errMsg = body.error || body.message || `API error ${res.status}`;
    if (res.status === 403) return { error: "Agent API access not enabled. Enable at bankr.bot/api" };
    if (res.status === 401) return { error: "Invalid or expired API key" };
    return { error: errMsg };
  }

  const data = await res.json();
  return { jobId: data.jobId };
}

async function pollBankrJob(apiKey: string, jobId: string, maxAttempts = 90): Promise<{ success: boolean; response?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${BANKR_API}/agent/job/${jobId}`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === "completed") return { success: true, response: data.response };
    if (data.status === "failed" || data.status === "cancelled") return { success: false, error: data.error || "Job failed" };
  }
  return { success: false, error: "Timeout" };
}

// ─── Category keywords for client-side filtering ────────────────────

const categoryKeywords: Record<string, string[]> = {
  politics: ["president", "election", "congress", "government", "trump", "democrat", "republican", "senate", "vote", "party", "biden", "political", "governor", "mayor", "cabinet", "impeach", "legislation", "bill", "law", "executive order", "deport", "tariff", "sanction"],
  crypto: ["bitcoin", "ethereum", "crypto", "token", "blockchain", "solana", "btc", "eth", "defi", "nft", "coinbase", "binance", "mining", "halving", "stablecoin", "memecoin", "altcoin", "airdrop"],
  sports: ["nfl", "nba", "soccer", "football", "baseball", "ufc", "tennis", "championship", "super bowl", "world cup", "playoffs", "finals", "match", "game", "team", "league", "mlb", "nhl", "premier league", "boxing"],
  science: ["ai ", "artificial intelligence", "climate", "space", "nasa", "fda", "science", "technology", "research", "quantum", "medicine", "vaccine", "virus", "openai", "gpt", "neural", "robotics", "mars"],
  culture: ["oscar", "grammy", "movie", "music", "celebrity", "award", "entertainment", "film", "netflix", "spotify", "tiktok", "album", "box office", "emmy", "streaming"],
};

function matchesCategory(m: PredictionMarket, cat: string): boolean {
  const kws = categoryKeywords[cat];
  if (!kws) return true;
  const text = `${m.question} ${m.description}`.toLowerCase();
  return kws.some((kw) => text.includes(kw));
}

// ─── GET — Fetch markets from /events endpoint ──────────────────────

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || "";
    const search = url.searchParams.get("q") || "";
    const sort = url.searchParams.get("sort") || "volume";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    const cacheKey = `${category}:${sort}:${limit}`;
    const cached = cacheMap.get(cacheKey);

    if (!search && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ success: true, markets: cached.markets, cached: true });
    }

    // Use /events endpoint (recommended by Polymarket docs)
    // Sort by 24h volume to get the most popular/diverse events
    const params = new URLSearchParams({
      limit: String(Math.min(limit, 50)),
      closed: "false",
      order: "volume24hr",
      ascending: "false",
    });

    const apiUrl = `${GAMMA_API}/events?${params.toString()}`;

    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Gamma API error:", res.status, errText);
      return NextResponse.json({ success: false, error: `Gamma API error: ${res.status}` }, { status: 502 });
    }

    const raw = await res.json();
    const events = Array.isArray(raw) ? raw : [];

    // Extract markets from events
    // Each event may contain many sub-markets; pick the top ones by volume
    const allMarkets: PolyMarket[] = [];
    for (const event of events) {
      if (event.markets && Array.isArray(event.markets) && event.markets.length > 0) {
        // Sort sub-markets by volume and take top 3 per event
        const subMarkets = [...event.markets]
          .filter((m: PolyMarket) => m.question && m.outcomePrices && m.active !== false)
          .sort((a: PolyMarket, b: PolyMarket) => (b.volumeNum || 0) - (a.volumeNum || 0))
          .slice(0, 3);

        for (const m of subMarkets) {
          // Inherit event-level data if market doesn't have it
          if (!m.image && event.image) m.image = event.image;
          if (!m.icon && event.icon) m.icon = event.icon;
          if (!m.description && event.description) m.description = event.description;
          if (event.category) m.category = event.category;
          allMarkets.push(m);
        }
      } else {
        // Event returned as flat market-like object
        if (event.question && event.outcomePrices) {
          allMarkets.push(event);
        }
      }
    }

    let markets = allMarkets
      .filter((m) => m.question && m.outcomePrices)
      .map(transformMarket);

    // Category filtering (client-side keyword matching)
    if (category) {
      markets = markets.filter((m) => matchesCategory(m, category));
    }

    // User search filtering
    if (search) {
      const q = search.toLowerCase();
      markets = markets.filter(
        (m) =>
          m.question.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sort === "volume") markets.sort((a, b) => b.volume - a.volume);
    else if (sort === "liquidity") markets.sort((a, b) => b.liquidity - a.liquidity);
    else if (sort === "newest") markets.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    else if (sort === "ending") markets.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

    // Cache non-search results
    if (!search) {
      cacheMap.set(cacheKey, { markets, timestamp: Date.now() });
    }

    return NextResponse.json({ success: true, markets, total: markets.length, cached: false });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST — Place bet or check positions via Bankr Agent ────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, action } = body;

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
        prompt = "Show my current Polymarket positions and their P&L";
        break;
      }
      case "claim": {
        prompt = "Claim all my resolved Polymarket winnings";
        break;
      }
      default:
        return NextResponse.json({ success: false, error: "Unknown action. Use: bet, positions, claim" }, { status: 400 });
    }

    const submitResult = await submitBankrPrompt(apiKey, prompt);
    if ("error" in submitResult) {
      return NextResponse.json({ success: false, error: submitResult.error }, { status: 400 });
    }

    const result = await pollBankrJob(apiKey, submitResult.jobId);

    if (result.success) {
      return NextResponse.json({ success: true, response: result.response, action });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error("Predictions POST error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
