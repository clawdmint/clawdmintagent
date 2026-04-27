"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Bot } from "lucide-react";
import { useTheme } from "./theme-provider";
import { formatCollectionMintPrice, getCollectionNativeToken } from "@/lib/collection-chains";
import { SolanaLogo } from "./network-icons";
import { CollectionCountdown } from "./collection-countdown";

const MIN_COLLECTION_IMAGE_DIMENSION = 256;

interface CollectionCardProps {
  collection: {
    id: string;
    address: string;
    chain: string;
    name: string;
    symbol: string;
    description?: string;
    image_url?: string;
    max_supply: number;
    total_minted: number;
    mint_price_raw?: string;
    mint_price_native?: string;
    status: string;
    agent: {
      id: string;
      name: string;
      avatar_url?: string;
    };
  };
  href?: string;
}

export function CollectionCard({ collection, href }: CollectionCardProps) {
  const { theme } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  const progress = collection.max_supply > 0 ? (collection.total_minted / collection.max_supply) * 100 : 0;
  const isSoldOut = collection.status === "SOLD_OUT" || collection.total_minted >= collection.max_supply;
  const mintPrice = collection.mint_price_native || formatCollectionMintPrice(collection.mint_price_raw || "0", collection.chain);
  const nativeToken = getCollectionNativeToken(collection.chain);
  const isMintLive = collection.status === "ACTIVE" && !isSoldOut;

  useEffect(() => {
    setImageFailed(false);
  }, [collection.image_url]);

  return (
    <Link href={href || `/collection/${collection.address}`} className="block h-full">
      <article
        className={clsx(
          "group relative flex h-full flex-col overflow-hidden rounded-[30px] border transition-all duration-300",
          theme === "dark"
            ? "border-white/[0.08] bg-[#09111d]/90 hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-[0_30px_80px_rgba(34,211,238,0.12)]"
            : "border-gray-200 bg-white/95 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_28px_70px_rgba(14,165,233,0.12)]"
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-400/10 to-transparent opacity-80" />

        <div className="relative aspect-[4/4.85] overflow-hidden">
          {collection.image_url && !imageFailed ? (
            <img
              src={collection.image_url}
              alt={collection.name}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              onError={() => setImageFailed(true)}
              onLoad={(event) => {
                const target = event.currentTarget;
                if (
                  target.naturalWidth < MIN_COLLECTION_IMAGE_DIMENSION ||
                  target.naturalHeight < MIN_COLLECTION_IMAGE_DIMENSION
                ) {
                  setImageFailed(true);
                }
              }}
            />
          ) : (
            <div
              className={clsx(
                "flex h-full w-full items-center justify-center",
                theme === "dark"
                  ? "bg-gradient-to-br from-[#101827] via-[#0b1220] to-black"
                  : "bg-gradient-to-br from-gray-100 via-gray-50 to-white"
              )}
            >
              <span className="text-6xl opacity-15">🖼️</span>
            </div>
          )}

          <div
            className={clsx(
              "absolute inset-0 bg-gradient-to-t via-transparent",
              theme === "dark"
                ? "from-[#09111d] via-[#09111d]/15 to-transparent"
                : "from-white via-white/25 to-transparent"
            )}
          />

          <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-md",
                  theme === "dark"
                    ? "border-white/10 bg-black/35 text-white/90"
                    : "border-white/60 bg-white/80 text-gray-900"
                )}
              >
                <SolanaLogo className="h-3.5 w-3.5" />
                Solana
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <CollectionCountdown address={collection.address} variant="compact" />
              <span
                className={clsx(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-md",
                  isSoldOut
                    ? "border-red-500/20 bg-red-500/10 text-red-300"
                    : theme === "dark"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
              >
                {isSoldOut ? "Sold Out" : isMintLive ? "Live Mint" : "Deployed"}
              </span>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.42)]">
                  {collection.name}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white/65">
                  ${collection.symbol}
                </p>
              </div>
              <div
                className={clsx(
                  "min-w-[108px] rounded-[20px] border px-3.5 py-2.5 text-left backdrop-blur-md",
                  theme === "dark" ? "border-white/10 bg-black/35" : "border-white/60 bg-white/85"
                )}
              >
                <p
                  className={clsx(
                    "font-mono text-[10px] uppercase tracking-[0.18em]",
                    theme === "dark" ? "text-white/55" : "text-gray-500"
                  )}
                >
                  Mint
                </p>
                {parseFloat(mintPrice) === 0 ? (
                  <p className={clsx("mt-1 text-base font-semibold leading-none", theme === "dark" ? "text-white" : "text-gray-900")}>
                    Free
                  </p>
                ) : (
                  <p className={clsx("mt-1 flex items-end gap-1 whitespace-nowrap text-base font-semibold leading-none", theme === "dark" ? "text-white" : "text-gray-900")}>
                    <span>{mintPrice}</span>
                    <span className={clsx("text-[11px] font-medium uppercase tracking-[0.14em]", theme === "dark" ? "text-white/75" : "text-gray-600")}>
                      {nativeToken}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="mb-2">
              <div
                className={clsx(
                  "h-1.5 overflow-hidden rounded-full",
                  theme === "dark" ? "bg-white/10" : "bg-black/10"
                )}
              >
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-700",
                    progress >= 90
                      ? "bg-gradient-to-r from-orange-400 to-red-400"
                      : "bg-gradient-to-r from-cyan-400 to-blue-400"
                  )}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between">
                <span className={clsx("text-[10px] font-medium", theme === "dark" ? "text-white/50" : "text-gray-500")}>
                  {collection.total_minted} / {collection.max_supply}
                </span>
                <span className={clsx("text-[10px] font-bold", theme === "dark" ? "text-white/70" : "text-gray-700")}>
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col space-y-4 p-4">
          <p className={clsx("line-clamp-2 text-sm leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            {collection.description || "Minted by a verified AI agent through Clawdmint's Solana-native Metaplex flow."}
          </p>

          <div
            className={clsx(
              "grid grid-cols-2 gap-2 rounded-2xl border p-3",
              theme === "dark" ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-200 bg-gray-50/70"
            )}
          >
            <div>
              <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                Progress
              </p>
              <p className="mt-1 text-base font-semibold">{Math.round(progress)}%</p>
            </div>
            <div>
              <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                Remaining
              </p>
              <p className="mt-1 text-base font-semibold">{Math.max(collection.max_supply - collection.total_minted, 0)}</p>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600">
                {collection.agent.avatar_url ? (
                  <img
                    src={collection.agent.avatar_url}
                    alt={collection.agent.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Bot className="h-4 w-4 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className={clsx("font-mono text-[10px] uppercase tracking-[0.18em]", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  Created by
                </p>
                <p className="truncate text-sm font-medium">{collection.agent.name}</p>
              </div>
            </div>

            <span
              className={clsx(
                "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
                theme === "dark" ? "bg-white/[0.05] text-gray-300" : "bg-gray-100 text-gray-700"
              )}
            >
              {parseFloat(mintPrice) === 0 ? "Free" : "Paid"}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
