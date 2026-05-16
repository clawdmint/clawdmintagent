"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ArrowDownRight, ArrowUpRight, Wifi, WifiOff } from "lucide-react";
import { SolanaLogo } from "./network-icons";
import { useCpegSite } from "./cpeg-site-context";
import { useTheme } from "./theme-provider";

type SolPrice = {
  price_usd: number;
  change_24h: number | null;
  source: "coingecko" | "binance";
  updated_at: string;
};

type SolPriceResponse =
  | ({ success: true } & SolPrice)
  | {
      success: false;
      error?: string;
      updated_at?: string;
    };

const CACHE_KEY = "clawdmint-sol-price";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function readCachedPrice(): SolPrice | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SolPrice;
    return typeof parsed.price_usd === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function cachePrice(data: SolPrice) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage can be unavailable in private contexts; the ticker still works without cache.
  }
}

export function SolPriceTicker() {
  const { theme } = useTheme();
  const isCpegSite = useCpegSite();
  const [price, setPrice] = useState<SolPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const cached = readCachedPrice();
    if (cached) {
      setPrice(cached);
      setLoading(false);
    }

    let cancelled = false;

    async function loadPrice() {
      try {
        const response = await fetch("/api/sol-price", { cache: "no-store" });
        const body = await response.json() as SolPriceResponse;

        if (cancelled) return;

        if (body.success) {
          const nextPrice = {
            price_usd: body.price_usd,
            change_24h: body.change_24h,
            source: body.source,
            updated_at: body.updated_at,
          };
          setPrice(nextPrice);
          cachePrice(nextPrice);
          setOffline(false);
        } else {
          setOffline(true);
        }
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPrice();
    const interval = window.setInterval(loadPrice, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const formattedPrice = price ? priceFormatter.format(price.price_usd) : loading ? "loading" : "--";
  const change = price?.change_24h;
  const changeLabel = useMemo(() => {
    if (typeof change !== "number") return null;
    const sign = change > 0 ? "+" : "";
    return `${sign}${change.toFixed(2)}%`;
  }, [change]);
  const positive = typeof change === "number" && change >= 0;

  return (
    <>
      <div className="h-8 shrink-0" aria-hidden />
      <div
        className={clsx(
          "fixed inset-x-0 bottom-0 z-[70] h-8 border-t backdrop-blur-xl",
          theme === "dark"
            ? "border-white/[0.08] bg-[#040813]/95 text-gray-300"
            : "border-gray-200 bg-white/95 text-gray-700",
          isCpegSite && "font-mono"
        )}
      >
        <div className="flex h-full w-full items-center justify-between gap-4 px-3 sm:px-4 lg:px-6 2xl:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={clsx(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                theme === "dark" ? "border-cyan-400/20 bg-cyan-400/10" : "border-cyan-200 bg-cyan-50"
              )}
            >
              <SolanaLogo className="h-3.5 w-3.5" />
            </span>
            <span className={clsx("text-[11px] font-bold", theme === "dark" ? "text-white" : "text-gray-950")}>
              SOL
            </span>
            <span className="font-mono text-[11px] font-semibold">{formattedPrice}</span>
            {changeLabel && (
              <span
                className={clsx(
                  "hidden items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold sm:inline-flex",
                  positive
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-rose-500/10 text-rose-400"
                )}
              >
                {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {changeLabel}
              </span>
            )}
          </div>

          <div className={clsx("flex items-center gap-2 font-mono text-[10px]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            {offline ? <WifiOff className="h-3.5 w-3.5 text-amber-400" /> : <Wifi className="h-3.5 w-3.5 text-emerald-400" />}
            <span className="hidden sm:inline">{offline ? "stale" : "live"}</span>
          </div>
        </div>
      </div>
    </>
  );
}
