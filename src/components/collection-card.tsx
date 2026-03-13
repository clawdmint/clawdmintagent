"use client";

import Link from "next/link";
import { useRef, useCallback, useState, useEffect } from "react";
import { useTheme } from "./theme-provider";
import { clsx } from "clsx";
import { Bot } from "lucide-react";
import { formatCollectionMintPrice, getCollectionNativeToken, isEvmCollectionChain } from "@/lib/collection-chains";
import { SolanaLogo } from "./network-icons";
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
    bags_score?: number;
    bags?: {
      enabled: boolean;
      status: string;
      token_address: string | null;
      token_symbol: string | null;
      mint_access: "public" | "bags_balance";
    } | null;
    agent: {
      id: string;
      name: string;
      avatar_url?: string;
    };
  };
}

export function CollectionCard({ collection }: CollectionCardProps) {
  const { theme } = useTheme();
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const progress = (collection.total_minted / collection.max_supply) * 100;
  const isSoldOut = collection.status === "SOLD_OUT" || collection.total_minted >= collection.max_supply;
  const mintPrice = collection.mint_price_native || formatCollectionMintPrice(collection.mint_price_raw || "0", collection.chain);
  const nativeToken = getCollectionNativeToken(collection.chain);
  const isMintLive = isEvmCollectionChain(collection.chain);
  const bagsLive = Boolean(collection.bags?.enabled && collection.bags.status === "LIVE" && collection.bags.token_address);
  const tokenGated = collection.bags?.mint_access === "bags_balance";

  useEffect(() => {
    setImageFailed(false);
  }, [collection.image_url]);

  // 3D tilt effect on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
  }, []);

  return (
    <Link href={`/collection/${collection.address}`}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={clsx(
          "group relative h-full rounded-2xl overflow-hidden card-shine",
          "transition-[transform,box-shadow] duration-300 ease-out will-change-transform",
          theme === "dark"
            ? "bg-[#0d1117] ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:shadow-2xl hover:shadow-cyan-500/10"
            : "bg-white ring-1 ring-gray-200 hover:ring-gray-300 hover:shadow-2xl hover:shadow-gray-300/50"
        )}
      >
        {/* Image - Full bleed, Zora-style */}
        <div className="relative aspect-[4/5] overflow-hidden">
          {collection.image_url && !imageFailed ? (
            <img
              src={collection.image_url}
              alt={collection.name}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
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
            <div className={clsx(
              "w-full h-full flex items-center justify-center",
              theme === "dark"
                ? "bg-gradient-to-br from-gray-800 via-gray-900 to-black"
                : "bg-gradient-to-br from-gray-100 via-gray-50 to-white"
            )}>
              <span className="text-6xl opacity-15">🖼️</span>
            </div>
          )}

          {/* Gradient overlay from bottom */}
          <div className={clsx(
            "absolute inset-0 bg-gradient-to-t via-transparent",
            theme === "dark"
              ? "from-[#0d1117] via-[#0d1117]/20 to-transparent"
              : "from-white via-white/30 to-transparent"
          )} />

          {/* Status badge */}
          {isSoldOut && (
            <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] uppercase tracking-widest font-bold text-white/90">
              Sold Out
            </div>
          )}
          {!isSoldOut && collection.status === "ACTIVE" && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-md rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/90">{isMintLive ? "Live" : "Deployed"}</span>
            </div>
          )}

          {/* Price badge - floating */}
          <div className={clsx(
            "absolute top-3 left-3 px-3 py-1.5 rounded-lg backdrop-blur-md text-sm font-bold tracking-tight",
            theme === "dark"
              ? "bg-black/50 text-white"
              : "bg-white/80 text-gray-900"
          )}>
            {parseFloat(mintPrice) === 0 ? "Free" : `${mintPrice} ${nativeToken}`}
          </div>

          {(bagsLive || tokenGated) && (
            <div className="absolute left-3 right-3 top-14 flex flex-wrap gap-2">
              {bagsLive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200 backdrop-blur-md">
                  <SolanaLogo className="h-3 w-3" />
                  Bags
                </span>
              )}
              {tokenGated && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200 backdrop-blur-md">
                  Gate
                </span>
              )}
            </div>
          )}

          {/* Bottom info overlay - appears on image */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            {/* Progress bar */}
            <div className="mb-3">
              <div className={clsx(
                "h-1 rounded-full overflow-hidden",
                theme === "dark" ? "bg-white/10" : "bg-black/10"
              )}>
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
              <div className="flex justify-between mt-1">
                <span className={clsx(
                  "text-[10px] font-medium",
                  theme === "dark" ? "text-white/50" : "text-gray-500"
                )}>
                  {collection.total_minted}/{collection.max_supply}
                </span>
                <span className={clsx(
                  "text-[10px] font-bold",
                  theme === "dark" ? "text-white/70" : "text-gray-700"
                )}>
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Text content - below image */}
        <div className="p-4 pt-2">
          <h3 className="text-heading-sm group-hover:text-cyan-500 transition-colors line-clamp-1 mb-1">
            {collection.name}
          </h3>

          <div className="flex items-center justify-between gap-3 mb-2">
            <span className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
              theme === "dark"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            )}>
              <SolanaLogo className="w-3.5 h-3.5" />
              Solana
            </span>

            <span className={clsx(
              "text-caption font-mono flex-shrink-0",
              theme === "dark" ? "text-gray-600" : "text-gray-400"
            )}>
              ${collection.symbol}
            </span>
          </div>

          {(bagsLive || tokenGated) && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {bagsLive && (
                  <span className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px]",
                    theme === "dark" ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"
                  )}>
                    {collection.bags?.token_symbol || "BAGS"}
                  </span>
                )}
                {tokenGated && (
                  <span className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px]",
                    theme === "dark" ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                  )}>
                    Token gated
                  </span>
                )}
              </div>
              {bagsLive && typeof collection.bags_score === "number" && collection.bags_score > 0 && (
                <span className={clsx(
                  "font-mono text-[10px]",
                  theme === "dark" ? "text-cyan-300" : "text-cyan-700"
                )}>
                  Signal {collection.bags_score.toFixed(2)}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* Agent */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {collection.agent.avatar_url ? (
                  <img
                    src={collection.agent.avatar_url}
                    alt={collection.agent.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bot className="w-3 h-3 text-white" />
                )}
              </div>
              <span className={clsx(
                "text-caption truncate",
                theme === "dark" ? "text-gray-500" : "text-gray-400"
              )}>
                {collection.agent.name}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
