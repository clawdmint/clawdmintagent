"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useTheme } from "./theme-provider";
import { clsx } from "clsx";
import { Bot } from "lucide-react";

interface CollectionCardProps {
  collection: {
    id: string;
    address: string;
    name: string;
    symbol: string;
    description?: string;
    image_url?: string;
    max_supply: number;
    total_minted: number;
    mint_price_wei: string;
    status: string;
    agent: {
      id: string;
      name: string;
      avatar_url?: string;
    };
  };
}

export function CollectionCard({ collection }: CollectionCardProps) {
  const { theme } = useTheme();
  const progress = (collection.total_minted / collection.max_supply) * 100;
  const isSoldOut = collection.status === "SOLD_OUT" || collection.total_minted >= collection.max_supply;
  const mintPriceEth = formatEther(BigInt(collection.mint_price_wei));

  return (
    <Link href={`/collection/${collection.address}`}>
      <div className={clsx(
        "glass-card-hover card-glow group h-full",
        theme === "light" && "bg-white/70"
      )}>
        {/* Image */}
        <div className="relative aspect-square rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-gray-800 to-gray-900">
          {collection.image_url ? (
            <img
              src={collection.image_url}
              alt={collection.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className={clsx(
              "w-full h-full flex items-center justify-center",
              theme === "dark" 
                ? "bg-gradient-to-br from-cyan-900/30 to-purple-900/30"
                : "bg-gradient-to-br from-cyan-100 to-purple-100"
            )}>
              <span className="text-6xl opacity-50">🖼️</span>
            </div>
          )}
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Status badge */}
          {isSoldOut && (
            <div className="absolute top-3 right-3 px-3 py-1 bg-red-500/90 backdrop-blur rounded-full text-xs font-bold uppercase tracking-wider text-white">
              Sold Out
            </div>
          )}
          
          {/* Quick stats on hover */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="px-2 py-1 bg-black/60 backdrop-blur rounded text-xs text-white">
              {collection.total_minted}/{collection.max_supply}
            </span>
            <span className="px-2 py-1 bg-cyan-500/80 backdrop-blur rounded text-xs font-medium text-white">
              {parseFloat(mintPriceEth) === 0 ? "Free" : `${mintPriceEth} ETH`}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-3">
          {/* Title & Symbol */}
          <div>
            <h3 className="font-semibold text-lg group-hover:text-cyan-500 transition-colors line-clamp-1">
              {collection.name}
            </h3>
            <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              ${collection.symbol}
            </p>
          </div>

          {/* Agent */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs overflow-hidden">
              {collection.agent.avatar_url ? (
                <img 
                  src={collection.agent.avatar_url} 
                  alt={collection.agent.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Bot className="w-3.5 h-3.5 text-white" />
              )}
            </div>
            <span className={clsx("text-sm line-clamp-1", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
              {collection.agent.name}
            </span>
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>Minted</span>
              <span className={clsx("font-medium", theme === "dark" ? "text-gray-300" : "text-gray-700")}>
                {Math.round(progress)}%
              </span>
            </div>
            <div className={clsx(
              "h-1.5 rounded-full overflow-hidden",
              theme === "dark" ? "bg-white/[0.05]" : "bg-gray-200"
            )}>
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Price */}
          <div className={clsx(
            "flex items-center justify-between pt-3 border-t",
            theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
          )}>
            <span className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Mint Price
            </span>
            <span className="font-semibold text-cyan-500">
              {parseFloat(mintPriceEth) === 0 ? "Free" : `${mintPriceEth} ETH`}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
