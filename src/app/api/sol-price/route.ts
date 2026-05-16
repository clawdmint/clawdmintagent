import { NextResponse } from "next/server";

type SolPricePayload = {
  success: true;
  price_usd: number;
  change_24h: number | null;
  source: "coingecko" | "binance";
  updated_at: string;
};

async function fetchCoinGecko(): Promise<SolPricePayload> {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true",
    { next: { revalidate: 30 } }
  );

  if (!response.ok) {
    throw new Error(`CoinGecko returned ${response.status}`);
  }

  const body = await response.json() as {
    solana?: {
      usd?: number;
      usd_24h_change?: number;
    };
  };
  const price = body.solana?.usd;

  if (typeof price !== "number") {
    throw new Error("CoinGecko response did not include SOL price.");
  }

  return {
    success: true,
    price_usd: price,
    change_24h: typeof body.solana?.usd_24h_change === "number" ? body.solana.usd_24h_change : null,
    source: "coingecko",
    updated_at: new Date().toISOString(),
  };
}

async function fetchBinance(): Promise<SolPricePayload> {
  const response = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT", {
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`Binance returned ${response.status}`);
  }

  const body = await response.json() as {
    lastPrice?: string;
    priceChangePercent?: string;
  };
  const price = Number(body.lastPrice);
  const change = Number(body.priceChangePercent);

  if (!Number.isFinite(price)) {
    throw new Error("Binance response did not include SOL price.");
  }

  return {
    success: true,
    price_usd: price,
    change_24h: Number.isFinite(change) ? change : null,
    source: "binance",
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await fetchCoinGecko());
  } catch (coinGeckoError) {
    try {
      return NextResponse.json(await fetchBinance());
    } catch (binanceError) {
      console.warn("[SOL price] unavailable", { coinGeckoError, binanceError });
      return NextResponse.json(
        {
          success: false,
          error: "SOL price is temporarily unavailable.",
          updated_at: new Date().toISOString(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=15, stale-while-revalidate=45",
          },
        }
      );
    }
  }
}
