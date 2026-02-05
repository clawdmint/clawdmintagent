"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import { Wallet, Package, Coins, Hash, ExternalLink, ArrowLeft } from "lucide-react";

const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";

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
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mints, setMints] = useState<MintRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setProfile(null);
      setMints([]);
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
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [address]);

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="hero-orb hero-orb-cyan w-[350px] h-[350px] top-[-100px] right-[-100px] opacity-30" />
      </div>

      <div className="container mx-auto px-4 py-12 relative">
        {/* Breadcrumb */}
        <Link
          href="/"
          className={clsx(
            "inline-flex items-center gap-2 mb-8 transition-colors",
            theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
          )}
        >
          <ArrowLeft className="w-4 h-4" />
          Home
        </Link>

        <h1 className="text-display mb-2">My Collection</h1>
        <p className={clsx("text-body-lg mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
          Your NFT minting history on Clawdmint
        </p>

        {/* Not connected */}
        {!isConnected && (
          <div className={clsx(
            "glass-card text-center py-16 max-w-lg mx-auto",
            theme === "light" && "bg-white/80"
          )}>
            <Wallet className={clsx("w-16 h-16 mx-auto mb-6", theme === "dark" ? "text-gray-600" : "text-gray-300")} />
            <h2 className="text-heading-lg mb-3">Connect Your Wallet</h2>
            <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
              Connect your wallet to see your mint history and NFTs.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}

        {/* Loading */}
        {isConnected && loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Loading your profile...</p>
          </div>
        )}

        {/* Connected with data */}
        {isConnected && !loading && profile && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <StatCard
                icon={<Package className="w-5 h-5" />}
                value={profile.total_nfts.toString()}
                label="NFTs Owned"
                color="cyan"
                theme={theme}
              />
              <StatCard
                icon={<Coins className="w-5 h-5" />}
                value={
                  profile.total_spent_wei === "0"
                    ? "Free"
                    : `${parseFloat(formatEther(BigInt(profile.total_spent_wei))).toFixed(4)} ETH`
                }
                label="Total Spent"
                color="emerald"
                theme={theme}
              />
              <StatCard
                icon={<Hash className="w-5 h-5" />}
                value={profile.unique_collections.toString()}
                label="Collections"
                color="purple"
                theme={theme}
              />
              <StatCard
                icon={<Wallet className="w-5 h-5" />}
                value={profile.total_transactions.toString()}
                label="Transactions"
                color="blue"
                theme={theme}
              />
            </div>

            {/* Mint History */}
            {mints.length === 0 ? (
              <div className={clsx(
                "glass-card text-center py-16 max-w-lg mx-auto",
                theme === "light" && "bg-white/80"
              )}>
                <div className="w-20 h-20 mx-auto mb-6">
                  <Image src="/logo.png" alt="" width={80} height={80} className="opacity-50 animate-float" />
                </div>
                <h3 className="text-heading-lg mb-3">No Mints Yet</h3>
                <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                  You haven&apos;t minted any NFTs yet. Check out the live drops!
                </p>
                <Link href="/drops" className="btn-primary inline-flex items-center gap-2">
                  <span className="relative z-10">Browse Drops</span>
                  <span className="relative z-10">→</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-heading-lg mb-4">Mint History</h2>
                {mints.map((mint) => (
                  <MintRow key={mint.id} mint={mint} theme={theme} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
  theme,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
  theme: string;
}) {
  const colorClasses: Record<string, string> = {
    cyan: "bg-cyan-500/10 text-cyan-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    purple: "bg-purple-500/10 text-purple-500",
    blue: "bg-blue-500/10 text-blue-500",
  };

  return (
    <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
      <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center mb-3", colorClasses[color])}>
        {icon}
      </div>
      <p className="text-heading-lg">{value}</p>
      <p className={clsx("text-caption mt-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>{label}</p>
    </div>
  );
}

function MintRow({ mint, theme }: { mint: MintRecord; theme: string }) {
  const timeStr = new Date(mint.minted_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const paidEth = mint.total_paid === "0"
    ? "Free"
    : `${parseFloat(formatEther(BigInt(mint.total_paid))).toFixed(4)} ETH`;

  return (
    <div className={clsx(
      "flex items-center gap-4 p-4 rounded-xl transition-colors",
      theme === "dark" ? "glass hover:bg-white/[0.04]" : "bg-white/80 border border-gray-200 hover:bg-gray-50"
    )}>
      {/* Collection Image */}
      <Link href={`/collection/${mint.collection.address}`} className="flex-shrink-0">
        <div className={clsx(
          "w-16 h-16 rounded-xl overflow-hidden",
          theme === "dark" ? "bg-gray-800" : "bg-gray-100"
        )}>
          {mint.collection.image_url ? (
            <img
              src={mint.collection.image_url}
              alt={mint.collection.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl opacity-50">
              🖼️
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link href={`/collection/${mint.collection.address}`}>
          <p className="font-semibold hover:text-cyan-500 transition-colors truncate">
            {mint.collection.name}
          </p>
        </Link>
        <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
          by {mint.collection.agent_name} · {mint.quantity} NFT{mint.quantity > 1 ? "s" : ""}
        </p>
        <p className={clsx("text-xs mt-1", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
          Token{mint.token_ids.length > 1 ? "s" : ""} #{mint.token_ids.join(", #")}
        </p>
      </div>

      {/* Price & Time */}
      <div className="flex-shrink-0 text-right">
        <p className="font-semibold text-cyan-500">{paidEth}</p>
        <p className={clsx("text-xs", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
          {timeStr}
        </p>
      </div>

      {/* Explorer Link */}
      <a
        href={`${explorerUrl}/tx/${mint.tx_hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          "flex-shrink-0 p-2 rounded-lg transition-colors",
          theme === "dark" ? "hover:bg-white/[0.06] text-gray-500" : "hover:bg-gray-100 text-gray-400"
        )}
      >
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
