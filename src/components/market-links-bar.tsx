"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "./theme-provider";

const BAGS_URL = "https://bags.fm/DzQ1LQGTuUqc2ftZMHqxTpmTNjkNdhKx1BtF1XQtBAGS";
const CONTRACT_ADDRESS = "DzQ1LQGTuUqc2ftZMHqxTpmTNjkNdhKx1BtF1XQtBAGS";
const DEXSCREENER_URL = "https://dexscreener.com/solana/fovubejz9vpyshnmn9wyqbwd8tt7tpegw5icju3wynjd";
const HACKATHON_URL = "https://bags.fm/apps/4d04efcf-4342-45c5-9174-1af3719a3307";

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
  {
    label: "HACK",
    display: "bags hackathon",
    href: HACKATHON_URL,
    copyValue: HACKATHON_URL,
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
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-center">
          <div
            className={clsx(
              "w-full max-w-5xl overflow-x-auto scrollbar-none",
              theme === "dark" ? "rounded-[24px]" : "rounded-[22px]"
            )}
          >
            <div
              className={clsx(
                "mx-auto flex min-w-max items-center gap-2 rounded-[24px] border px-2 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.18)] md:grid md:min-w-0 md:grid-cols-4 md:items-stretch",
                theme === "dark"
                  ? "border-white/[0.08] bg-[linear-gradient(180deg,rgba(11,18,37,0.96),rgba(4,9,22,0.92))]"
                  : "border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,255,0.96))]"
              )}
            >
              {marketItems.map((item) => {
                const copied = copiedValue === item.copyValue;

                return (
                  <div
                    key={item.label}
                    className={clsx(
                      "flex shrink-0 items-center gap-2 rounded-[18px] border px-3 py-2 transition-all md:min-w-0 md:w-full md:justify-between",
                      theme === "dark"
                        ? "border-white/[0.06] bg-white/[0.03] hover:border-cyan-400/20 hover:bg-white/[0.05]"
                        : "border-gray-200/80 bg-white/80 hover:border-cyan-200 hover:bg-white"
                    )}
                  >
                    <span
                      className={clsx(
                        "rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em]",
                        theme === "dark"
                          ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/20"
                          : "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200"
                      )}
                    >
                      {item.label}
                    </span>

                    <span
                      className={clsx(
                        "max-w-[148px] truncate font-mono text-[11px] md:max-w-none md:flex-1",
                        theme === "dark" ? "text-gray-200" : "text-gray-700"
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
                          "rounded-full p-1.5 transition-colors",
                          theme === "dark"
                            ? "text-gray-500 hover:bg-white/[0.06] hover:text-cyan-300"
                            : "text-gray-400 hover:bg-cyan-50 hover:text-cyan-700"
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
                        "rounded-full p-1.5 transition-colors",
                        copied
                          ? theme === "dark"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-emerald-100 text-emerald-700"
                          : theme === "dark"
                            ? "text-gray-500 hover:bg-white/[0.06] hover:text-cyan-300"
                            : "text-gray-400 hover:bg-cyan-50 hover:text-cyan-700"
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
    </div>
  );
}
