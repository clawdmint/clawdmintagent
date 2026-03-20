"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "./theme-provider";

const BAGS_URL = "https://bags.fm/DzQ1LQGTuUqc2ftZMHqxTpmTNjkNdhKx1BtF1XQtBAGS";
const CONTRACT_ADDRESS = "DzQ1LQGTuUqc2ftZMHqxTpmTNjkNdhKx1BtF1XQtBAGS";
const DEXSCREENER_URL = "https://dexscreener.com/solana/fovubejz9vpyshnmn9wyqbwd8tt7tpegw5icju3wynjd";

const marketItems = [
  {
    label: "BAGS",
    display: "bags.fm",
    href: BAGS_URL,
    copyValue: BAGS_URL,
  },
  {
    label: "CA",
    display: CONTRACT_ADDRESS,
    href: null,
    copyValue: CONTRACT_ADDRESS,
  },
  {
    label: "DEX",
    display: "dexscreener",
    href: DEXSCREENER_URL,
    copyValue: DEXSCREENER_URL,
  },
] as const;

function truncateMiddle(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function MarketLinksBar() {
  const { theme } = useTheme();
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue((current) => (current === value ? null : current)), 1800);
    } catch (error) {
      console.error("Failed to copy market link:", error);
    }
  };

  return (
    <div
      className={clsx(
        "sticky top-14 z-40 border-b backdrop-blur-xl",
        theme === "dark"
          ? "border-white/[0.04] bg-[#040916]/85"
          : "border-gray-200/70 bg-white/90"
      )}
    >
      <div className="container mx-auto px-4 py-2">
        <div className="flex justify-center">
          <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap scrollbar-none">
          <span
            className={clsx(
              "shrink-0 font-mono text-[10px] uppercase tracking-[0.22em]",
              theme === "dark" ? "text-cyan-400/80" : "text-cyan-700"
            )}
          >
            Market Rails
          </span>

          {marketItems.map((item) => {
            const copied = copiedValue === item.copyValue;

            return (
              <div
                key={item.label}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5",
                  theme === "dark"
                    ? "border-white/[0.06] bg-white/[0.03]"
                    : "border-gray-200 bg-gray-50"
                )}
              >
                <span
                  className={clsx(
                    "rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
                    theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-100 text-cyan-700"
                  )}
                >
                  {item.label}
                </span>

                <span
                  className={clsx(
                    "max-w-[140px] truncate font-mono text-[11px]",
                    theme === "dark" ? "text-gray-300" : "text-gray-700"
                  )}
                  title={item.copyValue}
                >
                  {item.label === "CA" ? truncateMiddle(item.display) : item.display}
                </span>

                {item.href && (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "rounded-md p-1 transition-colors",
                      theme === "dark"
                        ? "text-gray-500 hover:bg-white/[0.06] hover:text-cyan-300"
                        : "text-gray-400 hover:bg-white hover:text-cyan-700"
                    )}
                    aria-label={`Open ${item.label}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => void handleCopy(item.copyValue)}
                  className={clsx(
                    "rounded-md p-1 transition-colors",
                    copied
                      ? theme === "dark"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-emerald-100 text-emerald-700"
                      : theme === "dark"
                        ? "text-gray-500 hover:bg-white/[0.06] hover:text-cyan-300"
                        : "text-gray-400 hover:bg-white hover:text-cyan-700"
                  )}
                  aria-label={`Copy ${item.label}`}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
