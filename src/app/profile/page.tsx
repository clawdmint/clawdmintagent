"use client";

import { useEffect, useState, useCallback } from "react";
import { formatEther } from "viem";
import { useWallet } from "@/components/wallet-context";
import { reverseResolveAddress, getUserNames } from "@/lib/clawd-names";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import {
  Copy,
  Check,
  ExternalLink,
  LogOut,
  Package,
  Coins,
  Hash,
  AtSign,
  Loader2,
} from "lucide-react";

const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
const NAMES_ADDRESS = process.env.NEXT_PUBLIC_CLAWD_NAMES_ADDRESS || "";

interface ProfileData {
  address: string;
  total_nfts: number;
  total_spent_wei: string;
  unique_collections: number;
  total_transactions: number;
}

interface MintRecord {
  id: string;
  quantity: number;
  total_paid: string;
  tx_hash: string;
  token_ids: number[];
  minted_at: string;
  collection: {
    name: string;
    symbol: string;
    address: string;
    image_url: string | null;
    status: string;
    agent_name: string;
    agent_avatar: string | null;
  };
}

export default function ProfilePage() {
  const { theme } = useTheme();
  const { address, isConnected, login, logout, displayAddress } = useWallet();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mints, setMints] = useState<MintRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [clawdName, setClawdName] = useState<string | null>(null);
  const [clawdNames, setClawdNames] = useState<Array<{ tokenId: bigint; name: string }>>([]);
  const [copied, setCopied] = useState(false);

  // Fetch profile data
  useEffect(() => {
    if (!address) { setProfile(null); setMints([]); return; }
    async function fetchProfile() {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${address}`);
        const data = await res.json();
        if (data.success) { setProfile(data.profile); setMints(data.mints); }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchProfile();
  }, [address]);

  // Fetch .clawd name
  useEffect(() => {
    if (!address) { setClawdName(null); setClawdNames([]); return; }
    reverseResolveAddress(address).then(setClawdName);
    getUserNames(address).then(setClawdNames);
  }, [address]);

  const copyAddress = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className={clsx(
            "w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center",
            theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100"
          )}>
            <LogOut className={clsx("w-7 h-7", theme === "dark" ? "text-gray-600" : "text-gray-400")} />
          </div>
          <h1 className="text-xl font-bold mb-2">Connect to view profile</h1>
          <p className={clsx("text-sm mb-6", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            Connect your wallet to see your on-chain identity and minted NFTs.
          </p>
          <button
            onClick={login}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  const totalSpent = profile?.total_spent_wei === "0" || !profile?.total_spent_wei
    ? "0"
    : parseFloat(formatEther(BigInt(profile.total_spent_wei))).toFixed(4);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">

      {/* Profile Card */}
      <div className={clsx(
        "rounded-2xl border p-6 sm:p-8 mb-6",
        theme === "dark"
          ? "bg-white/[0.02] border-white/[0.06]"
          : "bg-white border-gray-200"
      )}>
        {/* Top: Avatar + Name + Address */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 min-w-0">
            {/* Avatar */}
            <div className={clsx(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0",
              "bg-gradient-to-br from-cyan-500/20 to-purple-500/20",
              theme === "dark" ? "text-cyan-400" : "text-cyan-600"
            )}>
              {clawdName ? clawdName.charAt(0).toUpperCase() : address?.slice(2, 4).toUpperCase()}
            </div>

            <div className="min-w-0">
              {/* .clawd name */}
              {clawdName && (
                <div className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-0.5">
                  {clawdName}
                </div>
              )}

              {/* Address */}
              <div className="flex items-center gap-2">
                <span className={clsx(
                  "text-sm font-mono",
                  theme === "dark" ? "text-gray-400" : "text-gray-500"
                )}>
                  {displayAddress}
                </span>
                <button
                  onClick={copyAddress}
                  className={clsx(
                    "p-1 rounded-md transition-colors",
                    theme === "dark" ? "hover:bg-white/[0.06] text-gray-500" : "hover:bg-gray-100 text-gray-400"
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={`${explorerUrl}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "p-1 rounded-md transition-colors",
                    theme === "dark" ? "hover:bg-white/[0.06] text-gray-500" : "hover:bg-gray-100 text-gray-400"
                  )}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Disconnect */}
          <button
            onClick={logout}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
              theme === "dark"
                ? "text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                : "text-gray-400 hover:text-red-500 hover:bg-red-50"
            )}
          >
            <LogOut className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>

        {/* Stats row */}
        {profile && (
          <div className={clsx(
            "grid grid-cols-4 gap-3 pt-5 border-t",
            theme === "dark" ? "border-white/[0.06]" : "border-gray-100"
          )}>
            {[
              { value: profile.total_nfts.toString(), label: "NFTs", icon: Package },
              { value: profile.unique_collections.toString(), label: "Collections", icon: Hash },
              { value: totalSpent === "0" ? "—" : `${totalSpent} ETH`, label: "Spent", icon: Coins },
              { value: clawdNames.length.toString(), label: ".clawd", icon: AtSign },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-base font-bold">{s.value}</div>
                <div className={clsx("text-[11px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* .clawd Names */}
      {clawdNames.length > 0 && (
        <div className="mb-6">
          <div className={clsx(
            "text-xs font-semibold uppercase tracking-[0.15em] mb-3",
            theme === "dark" ? "text-gray-600" : "text-gray-400"
          )}>
            Names
          </div>
          <div className="flex flex-wrap gap-2">
            {clawdNames.map((n) => (
              <Link
                key={n.tokenId.toString()}
                href="/names"
                className={clsx(
                  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                  theme === "dark"
                    ? "bg-cyan-500/[0.04] border-cyan-500/15 text-cyan-400 hover:bg-cyan-500/[0.08]"
                    : "bg-cyan-50/60 border-cyan-200/60 text-cyan-600 hover:bg-cyan-50"
                )}
              >
                <AtSign className="w-3.5 h-3.5" />
                {n.name}.clawd
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Minted NFTs */}
      <div>
        <div className={clsx(
          "text-xs font-semibold uppercase tracking-[0.15em] mb-3",
          theme === "dark" ? "text-gray-600" : "text-gray-400"
        )}>
          Minted NFTs
        </div>

        {mints.length === 0 ? (
          <div className={clsx(
            "rounded-2xl border p-8 text-center",
            theme === "dark" ? "bg-white/[0.01] border-white/[0.04]" : "bg-gray-50 border-gray-200"
          )}>
            <Package className={clsx("w-8 h-8 mx-auto mb-3", theme === "dark" ? "text-gray-700" : "text-gray-300")} />
            <p className={clsx("text-sm mb-4", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              No mints yet
            </p>
            <Link
              href="/drops"
              className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:underline"
            >
              Browse Drops <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {mints.map((mint) => (
              <div
                key={mint.id}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                  theme === "dark"
                    ? "bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03]"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                )}
              >
                {/* Image */}
                <Link href={`/collection/${mint.collection.address}`} className="shrink-0">
                  <div className={clsx(
                    "w-12 h-12 rounded-xl overflow-hidden",
                    theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                  )}>
                    {mint.collection.image_url ? (
                      <img
                        src={mint.collection.image_url}
                        alt={mint.collection.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg opacity-40">
                        🖼
                      </div>
                    )}
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link href={`/collection/${mint.collection.address}`}>
                    <div className="font-semibold text-sm truncate hover:text-cyan-400 transition-colors">
                      {mint.collection.name}
                    </div>
                  </Link>
                  <div className={clsx("text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                    {mint.quantity} NFT &middot; #{mint.token_ids.join(", #")}
                  </div>
                </div>

                {/* Price */}
                <div className="shrink-0 text-right">
                  <div className={clsx("text-sm font-semibold", theme === "dark" ? "text-gray-300" : "text-gray-700")}>
                    {mint.total_paid === "0"
                      ? "Free"
                      : `${parseFloat(formatEther(BigInt(mint.total_paid))).toFixed(4)} ETH`}
                  </div>
                  <div className={clsx("text-[11px]", theme === "dark" ? "text-gray-700" : "text-gray-400")}>
                    {new Date(mint.minted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>

                {/* Basescan */}
                <a
                  href={`${explorerUrl}/tx/${mint.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clsx(
                    "shrink-0 p-1.5 rounded-lg transition-colors",
                    theme === "dark" ? "text-gray-600 hover:text-gray-400 hover:bg-white/[0.04]" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
