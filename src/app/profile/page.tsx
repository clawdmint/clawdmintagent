"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Copy,
  Check,
  ExternalLink,
  LogOut,
  Package,
  Coins,
  Hash,
  Loader2,
  Rocket,
} from "lucide-react";
import { SolanaLogo } from "@/components/network-icons";
import { useWallet } from "@/components/wallet-context";
import {
  getAddressExplorerUrl,
  getDexScreenerTokenUrl,
  getNetworkFromValue,
  getTransactionExplorerUrl,
} from "@/lib/network-config";
import { formatCollectionMintPrice, getCollectionNativeToken } from "@/lib/collection-chains";
import { useTheme } from "@/components/theme-provider";

interface ProfileData {
  address: string;
  total_nfts: number;
  total_spent_wei: string;
  unique_collections: number;
  total_transactions: number;
  total_launches: number;
}

interface TokenLaunchRecord {
  id: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  txHash: string | null;
  chain: string;
  description: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  createdAt: string;
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
    chain: string;
    image_url: string | null;
    status: string;
    mint_price_native: string;
    native_token: string;
    agent_name: string;
    agent_avatar: string | null;
  };
}

function ChainBadge({ chain, theme }: { chain: string; theme: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
      theme === "dark"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
    )}>
      <SolanaLogo className="w-3.5 h-3.5" />
      {getNetworkFromValue(chain).shortLabel}
    </span>
  );
}

export default function ProfilePage() {
  const { theme } = useTheme();
  const { address, isConnected, logout, displayAddress, connectSolana, solanaAvailable } = useWallet();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mints, setMints] = useState<MintRecord[]>([]);
  const [tokenLaunches, setTokenLaunches] = useState<TokenLaunchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) {
      setProfile(null);
      setMints([]);
      setTokenLaunches([]);
      return;
    }

    async function fetchProfile() {
      setLoading(true);

      try {
        const res = await fetch(`/api/profile/${address}`);
        const data = await res.json();

        if (data.success) {
          setProfile(data.profile);
          setMints(data.mints);
          setTokenLaunches(data.tokenLaunches || []);
        }
      } catch {
        // ignore
      }

      setLoading(false);
    }

    void fetchProfile();
  }, [address]);

  const copyAddress = useCallback(() => {
    if (!address) return;

    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const handleConnectSolana = useCallback(() => {
    if (!solanaAvailable) {
      window.open("https://phantom.app/download", "_blank", "noopener,noreferrer");
      return;
    }

    void connectSolana();
  }, [connectSolana, solanaAvailable]);

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
              Connect your Phantom wallet to see your Solana profile, minted NFTs, and Metaplex-backed launches.
            </p>
          <button
            onClick={handleConnectSolana}
            className={clsx(
              "px-6 py-3 rounded-xl text-sm font-semibold transition-all border inline-flex items-center justify-center gap-2",
              theme === "dark"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            )}
          >
            <SolanaLogo className="w-4 h-4" />
            {solanaAvailable ? "Connect Phantom" : "Install Phantom"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  const totalSpent = profile?.total_spent_wei
    ? formatCollectionMintPrice(profile.total_spent_wei, "solana")
    : "0";
  const connectedNetwork = address ? getNetworkFromValue(address) : null;
  const spentLabel = totalSpent !== "0" ? `${totalSpent} SOL` : "-";

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className={clsx(
        "rounded-2xl border p-6 sm:p-8 mb-6",
        theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"
      )}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={clsx(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0",
              "bg-gradient-to-br from-cyan-500/20 to-purple-500/20",
              theme === "dark" ? "text-cyan-400" : "text-cyan-600"
            )}>
              {address?.slice(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0">
              {connectedNetwork && <ChainBadge chain={connectedNetwork.id} theme={theme} />}

              <div className="flex items-center gap-2 mt-2">
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
                  href={address ? getAddressExplorerUrl(address) : "#"}
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

        {profile && (
          <div className={clsx(
            "grid grid-cols-4 gap-3 pt-5 border-t",
            theme === "dark" ? "border-white/[0.06]" : "border-gray-100"
          )}>
            {[
              { value: profile.total_nfts.toString(), label: "NFTs", icon: Package },
              { value: profile.unique_collections.toString(), label: "Collections", icon: Hash },
              { value: (profile.total_launches || 0).toString(), label: "Launches", icon: Rocket },
              { value: spentLabel, label: "Spent", icon: Coins },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-base font-bold">{stat.value}</div>
                <div className={clsx("text-[11px]", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tokenLaunches.length > 0 && (
        <div className="mb-6">
          <div className={clsx(
            "text-xs font-semibold uppercase tracking-[0.15em] mb-3 flex items-center gap-2",
            theme === "dark" ? "text-gray-600" : "text-gray-400"
          )}>
            <Rocket className="w-3.5 h-3.5" /> Token Launches
          </div>
          <div className="space-y-2">
            {tokenLaunches.map((launch) => (
              <div
                key={launch.id}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                  theme === "dark"
                    ? "bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03]"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                )}
              >
                <div className={clsx(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0",
                  theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
                )}>
                  {launch.tokenSymbol.slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {launch.tokenName} <span className={clsx("font-mono text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>${launch.tokenSymbol}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <div className={clsx("text-xs font-mono truncate", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                      {launch.tokenAddress.slice(0, 6)}...{launch.tokenAddress.slice(-4)}
                    </div>
                    <ChainBadge chain={launch.chain} theme={theme} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={clsx("text-[11px]", theme === "dark" ? "text-gray-700" : "text-gray-400")}>
                    {new Date(launch.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={getDexScreenerTokenUrl(launch.tokenAddress, launch.chain)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "p-1.5 rounded-lg transition-colors text-[10px] font-mono font-bold",
                      theme === "dark" ? "text-cyan-400 hover:bg-cyan-500/10" : "text-cyan-600 hover:bg-cyan-50"
                    )}
                    title="DexScreener"
                  >
                    DEX
                  </a>
                  {launch.txHash && (
                    <a
                      href={getTransactionExplorerUrl(launch.txHash, launch.chain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "p-1.5 rounded-lg transition-colors",
                        theme === "dark" ? "text-gray-600 hover:text-gray-400 hover:bg-white/[0.04]" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                      )}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <Link href="/drops" className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:underline">
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
                        []
                      </div>
                    )}
                  </div>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={`/collection/${mint.collection.address}`}>
                    <div className="font-semibold text-sm truncate hover:text-cyan-400 transition-colors">
                      {mint.collection.name}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <div className={clsx("text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                      {mint.quantity} NFT · #{mint.token_ids.join(", #")}
                    </div>
                    <ChainBadge chain={mint.collection.chain} theme={theme} />
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className={clsx("text-sm font-semibold", theme === "dark" ? "text-gray-300" : "text-gray-700")}>
                    {mint.total_paid === "0"
                      ? "Free"
                      : `${formatCollectionMintPrice(mint.total_paid, mint.collection.chain)} ${getCollectionNativeToken(mint.collection.chain)}`}
                  </div>
                  <div className={clsx("text-[11px]", theme === "dark" ? "text-gray-700" : "text-gray-400")}>
                    {new Date(mint.minted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>

                <a
                  href={getTransactionExplorerUrl(mint.tx_hash, mint.collection.chain)}
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
