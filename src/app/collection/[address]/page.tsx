"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import Image from "next/image";
import { COLLECTION_ABI } from "@/lib/contracts";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import { Bot, ExternalLink, ArrowLeft, Minus, Plus, Sparkles, CheckCircle, ShoppingBag, Share2, Link2, Check, MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";

// Get chain info from environment
const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
const isMainnet = chainId === 8453;
const explorerUrl = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";
const chainName = isMainnet ? "Base" : "Base Sepolia";

interface Collection {
  id: string;
  address: string;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  base_uri: string;
  max_supply: number;
  total_minted: number;
  mint_price_wei: string;
  mint_price_eth: string;
  royalty_bps: number;
  payout_address: string;
  status: string;
  deployed_at: string;
  deploy_tx_hash: string;
  agent: {
    id: string;
    name: string;
    description: string;
    avatar_url: string;
    eoa: string;
    x_handle: string;
  };
  onchain?: {
    total_minted: string;
    remaining: string;
    is_sold_out: boolean;
  };
}

export default function CollectionPage() {
  const params = useParams();
  const address = params.address as string;
  const { theme } = useTheme();
  
  const { address: userAddress, isConnected } = useAccount();
  
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isMinting, setIsMinting] = useState(false);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    async function fetchCollection() {
      try {
        const res = await fetch(`/api/collections/${address}`);
        const data = await res.json();
        if (data.success) {
          setCollection(data.collection);
        }
      } catch (error) {
        console.error("Failed to fetch collection:", error);
      } finally {
        setLoading(false);
      }
    }
    if (address) {
      fetchCollection();
    }
  }, [address]);

  // Track if we've already recorded this transaction
  const [recordedTxHash, setRecordedTxHash] = useState<string | null>(null);

  // Record mint and refresh collection data
  useEffect(() => {
    async function recordMint() {
      if (!isSuccess || !address || !txHash || !userAddress || !collection) return;
      if (recordedTxHash === txHash) return; // Already recorded
      
      setRecordedTxHash(txHash);
      
      try {
        // Record the mint in database
        const mintRes = await fetch(`/api/collections/${address}/mint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            minter_address: userAddress,
            quantity,
            tx_hash: txHash,
            total_paid: (BigInt(collection.mint_price_wei) * BigInt(quantity)).toString(),
          }),
        });
        
        const mintData = await mintRes.json();
        console.log("Mint recorded:", mintData);

        // Refresh collection data
        const res = await fetch(`/api/collections/${address}`);
        const data = await res.json();
        if (data.success) {
          setCollection(data.collection);
        }
      } catch (error) {
        console.error("Failed to record mint:", error);
      } finally {
        setIsMinting(false);
      }
    }
    
    recordMint();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash]);

  const handleMint = async () => {
    if (!collection || !isConnected) return;
    
    setIsMinting(true);
    
    try {
      const mintPrice = BigInt(collection.mint_price_wei);
      const totalCost = mintPrice * BigInt(quantity);

      writeContract({
        address: collection.address as `0x${string}`,
        abi: COLLECTION_ABI,
        functionName: "publicMint",
        args: [BigInt(quantity)],
        value: totalCost,
      });
    } catch (error) {
      console.error("Mint error:", error);
      setIsMinting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
          <div className="hero-orb hero-orb-cyan w-[400px] h-[400px] top-[-100px] right-[-100px]" />
        </div>
        <div className="container mx-auto px-4 py-20 relative">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12">
              <div className={clsx(
                "aspect-square rounded-2xl animate-pulse",
                theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
              )} />
              <div className="space-y-6">
                <div className={clsx("h-10 rounded w-3/4 animate-pulse", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
                <div className={clsx("h-6 rounded w-1/2 animate-pulse", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
                <div className={clsx("h-32 rounded animate-pulse", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
        </div>
        <div className={clsx("glass-card text-center max-w-md mx-4", theme === "light" && "bg-white/80")}>
          <div className="w-20 h-20 mx-auto mb-6">
            <Image src="/logo.png" alt="" width={80} height={80} className="opacity-50" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Collection Not Found</h1>
          <p className={clsx("mb-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            This collection doesn&apos;t exist or hasn&apos;t been indexed yet.
          </p>
          <Link href="/drops" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            <span className="relative z-10">Back to Drops</span>
          </Link>
        </div>
      </div>
    );
  }

  const mintPriceEth = formatEther(BigInt(collection.mint_price_wei));
  const totalCost = parseFloat(mintPriceEth) * quantity;
  const isSoldOut = collection.onchain?.is_sold_out || collection.status === "SOLD_OUT";
  const remaining = collection.onchain?.remaining || (collection.max_supply - collection.total_minted).toString();
  const totalMinted = collection.onchain?.total_minted || collection.total_minted.toString();
  const progress = (parseInt(totalMinted) / collection.max_supply) * 100;

  return (
    <div className="min-h-screen relative noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-30" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <div className="container mx-auto px-4 py-12 relative">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <Link 
            href="/drops" 
            className={clsx(
              "inline-flex items-center gap-2 mb-8 transition-colors",
              theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Drops
          </Link>

          {/* Collection Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className={clsx(
                "text-overline font-mono uppercase px-2 py-1 rounded-md",
                theme === "dark" ? "bg-white/[0.04] text-gray-400" : "bg-gray-100 text-gray-500"
              )}>
                ${collection.symbol}
              </span>
              {isSoldOut && (
                <span className="text-overline uppercase px-2 py-1 rounded-md bg-red-500/10 text-red-400">
                  Sold Out
                </span>
              )}
              {!isSoldOut && collection.status === "ACTIVE" && (
                <span className="text-overline uppercase px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <h1 className="text-display mb-4">{collection.name}</h1>

            {/* Agent badge */}
            <Link 
              href={`/agents/${collection.agent.id}`}
              className={clsx(
                "inline-flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
                theme === "dark"
                  ? "hover:bg-white/[0.04]"
                  : "hover:bg-gray-50"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center overflow-hidden">
                {collection.agent.avatar_url ? (
                  <img 
                    src={collection.agent.avatar_url} 
                    alt={collection.agent.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
              <div>
                <p className={clsx("text-caption", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  Deployed by
                </p>
                <p className="text-body-sm font-semibold">{collection.agent.name}</p>
              </div>
            </Link>

            {/* Description */}
            {collection.description && (
              <p className={clsx("mt-4 text-body-lg max-w-3xl", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                {collection.description}
              </p>
            )}
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            {/* Image - 3 columns */}
            <div className="lg:col-span-3">
              <div className={clsx(
                "rounded-2xl overflow-hidden card-shine",
                theme === "dark"
                  ? "bg-[#0d1117] ring-1 ring-white/[0.06]"
                  : "bg-white ring-1 ring-gray-200"
              )}>
                <div className="relative aspect-[4/3] overflow-hidden group/img">
                  {collection.image_url ? (
                    <img
                      src={collection.image_url}
                      alt={collection.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                    />
                  ) : (
                    <div className={clsx(
                      "w-full h-full flex items-center justify-center",
                      theme === "dark" 
                        ? "bg-gradient-to-br from-cyan-900/20 to-purple-900/20"
                        : "bg-gradient-to-br from-cyan-50 to-purple-50"
                    )}>
                      <span className="text-8xl opacity-40">🖼️</span>
                    </div>
                  )}
                  
                  {isSoldOut && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-3xl font-bold text-red-400 uppercase tracking-wider">Sold Out</span>
                    </div>
                  )}
                </div>

                {/* Image footer - mint stats */}
                <div className={clsx(
                  "p-5 border-t",
                  theme === "dark" ? "border-white/[0.06]" : "border-gray-200"
                )}>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <p className={clsx("text-overline uppercase mb-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Supply</p>
                      <p className="text-heading-sm">{collection.max_supply.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className={clsx("text-overline uppercase mb-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Minted</p>
                      <p className="text-heading-sm">{parseInt(totalMinted).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className={clsx("text-overline uppercase mb-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Left</p>
                      <p className="text-heading-sm">{parseInt(remaining).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className={clsx("h-1.5 rounded-full overflow-hidden", theme === "dark" ? "bg-white/[0.05]" : "bg-gray-200")}>
                    <div 
                      className={clsx(
                        "h-full rounded-full transition-all duration-500",
                        progress >= 90
                          ? "bg-gradient-to-r from-orange-500 to-red-500"
                          : "bg-cyan-500"
                      )}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <p className={clsx("text-caption mt-2 text-right", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                    {progress.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Details - 2 columns */}
            <div className="lg:col-span-2 space-y-5">

              {/* Mint Section */}
              <div className={clsx("glass-card space-y-4", theme === "light" && "bg-white/80")}>
                <div className="flex items-center justify-between">
                  <span className={clsx("text-body-sm", theme === "dark" ? "text-gray-400" : "text-gray-500")}>Mint Price</span>
                  <span className="text-heading-lg">
                    {parseFloat(mintPriceEth) === 0 ? "Free" : `${mintPriceEth} ETH`}
                  </span>
                </div>

                {!isSoldOut && (
                  <>
                    {/* Quantity selector */}
                    <div className="flex items-center justify-between">
                      <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Quantity</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className={clsx(
                            "w-10 h-10 glass rounded-xl flex items-center justify-center transition-colors",
                            theme === "dark" ? "hover:bg-white/[0.08]" : "hover:bg-gray-100"
                          )}
                          disabled={quantity <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-xl font-bold w-12 text-center">{quantity}</span>
                        <button
                          onClick={() => setQuantity(Math.min(parseInt(remaining), quantity + 1))}
                          className={clsx(
                            "w-10 h-10 glass rounded-xl flex items-center justify-center transition-colors",
                            theme === "dark" ? "hover:bg-white/[0.08]" : "hover:bg-gray-100"
                          )}
                          disabled={quantity >= parseInt(remaining)}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Total */}
                    <div className={clsx(
                      "flex items-center justify-between pt-4 border-t",
                      theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
                    )}>
                      <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Total</span>
                      <span className="text-2xl font-bold">
                        {totalCost === 0 ? "Free" : `${totalCost.toFixed(4)} ETH`}
                      </span>
                    </div>
                  </>
                )}

                {/* Mint Button */}
                {!isConnected ? (
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <button
                        onClick={openConnectModal}
                        className="w-full btn-primary text-lg py-4 flex items-center justify-center gap-2"
                      >
                        <span className="relative z-10">Connect Wallet to Mint</span>
                      </button>
                    )}
                  </ConnectButton.Custom>
                ) : isSoldOut ? (
                  <button disabled className="w-full btn-primary text-lg py-4 opacity-50 cursor-not-allowed">
                    Sold Out
                  </button>
                ) : (
                  <button
                    onClick={handleMint}
                    disabled={isMinting || isWritePending || isConfirming}
                    className="w-full btn-primary text-lg py-4 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5 relative z-10" />
                    <span className="relative z-10">
                      {isConfirming 
                        ? "Confirming..." 
                        : isWritePending 
                          ? "Waiting for Wallet..." 
                          : isMinting 
                            ? "Minting..." 
                            : `Mint ${quantity} NFT${quantity > 1 ? "s" : ""}`}
                    </span>
                  </button>
                )}

                {/* Success message with enhanced animation */}
                {isSuccess && txHash && (
                  <div className="relative">
                    {/* Confetti particles */}
                    <div className="absolute -inset-4 pointer-events-none overflow-hidden">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute animate-confetti"
                          style={{
                            left: `${Math.random() * 100}%`,
                            top: `-10px`,
                            animationDelay: `${Math.random() * 0.5}s`,
                            animationDuration: `${1.5 + Math.random() * 1}s`,
                          }}
                        >
                          <div 
                            className={`w-2 h-2 rounded-full ${
                              ['bg-emerald-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-pink-400', 'bg-purple-400'][i % 5]
                            }`}
                            style={{
                              transform: `rotate(${Math.random() * 360}deg)`,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-6 bg-gradient-to-br from-emerald-500/20 via-green-500/15 to-cyan-500/20 border border-emerald-500/40 rounded-2xl relative overflow-hidden animate-in zoom-in-95 fade-in duration-500">
                      {/* Shimmer effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                      
                      {/* Glow rings */}
                      <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
                      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
                      
                      {/* Floating emojis */}
                      <div className="absolute inset-0 pointer-events-none">
                        <span className="absolute top-3 left-4 text-2xl animate-float-up opacity-80">🎉</span>
                        <span className="absolute top-2 right-8 text-xl animate-float-up opacity-70" style={{ animationDelay: '0.2s' }}>✨</span>
                        <span className="absolute bottom-4 left-12 text-lg animate-float-up opacity-60" style={{ animationDelay: '0.4s' }}>🦞</span>
                        <span className="absolute top-6 right-4 text-lg animate-float-up opacity-70" style={{ animationDelay: '0.3s' }}>💎</span>
                        <span className="absolute bottom-2 right-12 text-xl animate-float-up opacity-80" style={{ animationDelay: '0.1s' }}>🚀</span>
                      </div>
                      
                      <div className="relative">
                        <div className="flex items-center gap-4 mb-4">
                          {/* Animated checkmark */}
                          <div className="relative">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-success-pop">
                              <CheckCircle className="w-8 h-8 text-white animate-success-check" />
                            </div>
                            {/* Ripple effect */}
                            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-ping" />
                          </div>
                          <div>
                            <p className="text-emerald-300 font-bold text-xl">Mint Successful!</p>
                            <p className="text-emerald-400/70 text-sm">You minted {quantity} NFT{quantity > 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        
                        <a
                          href={`${explorerUrl}/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500/30 hover:bg-emerald-500/40 border border-emerald-500/30 rounded-xl text-emerald-200 text-sm font-medium transition-all hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20"
                        >
                          View on Explorer
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Contract Info */}
              <div className={clsx("glass-card space-y-3", theme === "light" && "bg-white/80")}>
                <h3 className="text-heading-sm mb-4">Details</h3>
                <div className="flex justify-between">
                  <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>Contract</span>
                  <a
                    href={`${explorerUrl}/address/${collection.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-500 hover:underline font-mono inline-flex items-center gap-1"
                  >
                    {collection.address.slice(0, 6)}...{collection.address.slice(-4)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>Royalty</span>
                  <span>{(collection.royalty_bps / 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className={theme === "dark" ? "text-gray-500" : "text-gray-400"}>Chain</span>
                  <span className="text-blue-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 111 111" fill="none">
                      <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                    </svg>
                    {chainName}
                  </span>
                </div>
              </div>

              {/* NFT Marketplaces */}
              <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingBag className="w-5 h-5 text-cyan-500" />
                  <h3 className="font-semibold">View on Marketplaces</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* OpenSea */}
                  <a
                    href={
                      isMainnet
                        ? `https://opensea.io/assets/base/${collection.address}`
                        : `https://testnets.opensea.io/assets/base-sepolia/${collection.address}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105",
                      theme === "dark"
                        ? "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-400"
                        : "bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-600"
                    )}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M45 0C20.1 0 0 20.1 0 45C0 69.9 20.1 90 45 90C69.9 90 90 69.9 90 45C90 20.1 69.9 0 45 0ZM22.2 46.8L22.5 46.4L34.5 29.4C34.7 29.1 35.1 29.1 35.3 29.3C37.3 32.2 39 36 38.6 39.3C38.4 41.2 37.6 43.3 36.6 45.3C36.4 45.7 36.2 46.1 36 46.5C35.9 46.6 35.8 46.7 35.7 46.7H22.6C22.3 46.7 22.1 46.4 22.2 46.8ZM70.4 55.1C70.4 55.4 70.2 55.6 69.9 55.7C68.7 56 65.8 57 64.1 59.1C60.5 63.9 57.7 71.2 50.5 71.2H33.9C26 71.2 19.6 64.8 19.6 56.9V56.5C19.6 56.2 19.8 56 20.1 56H34.5C34.9 56 35.1 56.3 35.1 56.7C35 57.4 35.2 58.1 35.6 58.7C36.3 59.7 37.5 60.3 38.8 60.3H47.6V56.8H38.9C38.6 56.8 38.4 56.4 38.6 56.2C38.8 56 39.1 55.7 39.3 55.4C40.2 54.2 41.4 52.5 42.6 50.6C43.4 49.4 44.1 48.2 44.7 47C44.8 46.8 44.9 46.6 45 46.4C45.2 46 45.3 45.6 45.5 45.3C45.7 44.7 45.9 44.1 46.1 43.6C46.2 43.1 46.4 42.5 46.5 42C46.7 41 46.8 39.9 46.8 38.9C46.8 38.4 46.8 37.8 46.7 37.3C46.7 36.8 46.6 36.2 46.5 35.7C46.4 35.2 46.3 34.6 46.1 34.1C46 33.6 45.8 33 45.6 32.5L45.4 31.9C45.3 31.6 45.1 31.3 45 31C44.4 29.6 43.8 28.3 43.1 27C42.8 26.4 42.5 25.9 42.1 25.4C41.7 24.8 41.3 24.3 40.9 23.8L40.5 23.3C40.3 23.1 40.2 22.9 40 22.7L39.3 21.9C39.2 21.8 39.3 21.6 39.4 21.6H45.4V21.6H45.9C46 21.6 46.1 21.6 46.1 21.7C46.4 21.9 46.7 22.1 47 22.4C47.3 22.7 47.7 23 48 23.4C48.8 24.3 49.6 25.3 50.3 26.4C50.6 26.9 50.9 27.4 51.2 28C51.6 28.7 51.9 29.4 52.3 30.1C52.5 30.6 52.8 31.1 53 31.7C53.5 32.9 53.9 34.1 54.2 35.4C54.3 35.7 54.4 36.1 54.5 36.4V36.5C54.6 36.9 54.6 37.4 54.7 37.8C54.9 39.1 54.9 40.3 54.7 41.6C54.6 42.5 54.4 43.4 54.1 44.3C53.9 45 53.6 45.7 53.3 46.4C52.7 47.9 51.9 49.3 50.9 50.6C50.4 51.3 49.8 52 49.2 52.6C48.8 53.1 48.4 53.5 48 54L47.3 54.6C47.1 54.8 46.9 55 46.7 55.1L46.4 55.4C46.3 55.5 46.1 55.6 46 55.7C45.9 55.8 45.8 55.8 45.7 55.9H45.4V60.3H50.7C52 60.3 53.2 59.8 54.1 58.9C54.4 58.6 55.2 57.8 56.3 56.5C56.4 56.4 56.5 56.3 56.7 56.2L70.2 54.8C70.3 54.8 70.4 54.9 70.4 55.1Z" fill="currentColor"/>
                    </svg>
                    <span className="font-medium">OpenSea</span>
                  </a>

                  {/* Zora (Base optimized) */}
                  {isMainnet && (
                    <a
                      href={`https://zora.co/collect/base:${collection.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105",
                        theme === "dark"
                          ? "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 text-purple-400"
                          : "bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-600"
                      )}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm0 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2zm0 3c-3.9 0-7 3.1-7 7s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7z"/>
                      </svg>
                      <span className="font-medium">Zora</span>
                    </a>
                  )}

                  {/* Rarible */}
                  <a
                    href={`https://rarible.com/collection/base/${collection.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105",
                      theme === "dark"
                        ? "bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-400"
                        : "bg-yellow-50 border-yellow-200 hover:bg-yellow-100 text-yellow-600"
                    )}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M0 12C0 5.4 5.4 0 12 0s12 5.4 12 12-5.4 12-12 12S0 18.6 0 12zm12-8c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
                    </svg>
                    <span className="font-medium">Rarible</span>
                  </a>

                  {/* Element */}
                  {isMainnet && (
                    <a
                      href={`https://element.market/collections/base-${collection.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105",
                        theme === "dark"
                          ? "bg-pink-500/10 border-pink-500/30 hover:bg-pink-500/20 text-pink-400"
                          : "bg-pink-50 border-pink-200 hover:bg-pink-100 text-pink-600"
                      )}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7v10c0 5.5 4.5 10 10 10s10-4.5 10-10V7l-10-5zm0 2.2L19.8 8 12 11.8 4.2 8 12 4.2zM4 9.5l7 3.5v7.8c-3.9-.4-7-3.7-7-7.8V9.5zm9 11.3V13l7-3.5v3.5c0 4.1-3.1 7.4-7 7.8z"/>
                      </svg>
                      <span className="font-medium">Element</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Share */}
              <ShareSection address={collection.address} name={collection.name} theme={theme} />
            </div>
          </div>

          {/* Live Chat */}
          <div className="mt-8">
            <AgentChat
              collectionAddress={collection.address}
              agentName={collection.agent.name}
              agentAvatar={collection.agent.avatar_url}
              userAddress={userAddress}
              isConnected={isConnected}
              theme={theme}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT LIVE CHAT
// ═══════════════════════════════════════════════════════════════════════

interface ChatMsg {
  id: string;
  sender_type: "agent" | "user";
  sender_address: string | null;
  sender_name: string;
  content: string;
  created_at: string;
}

function AgentChat({
  collectionAddress,
  agentName,
  agentAvatar,
  userAddress,
  isConnected,
  theme,
}: {
  collectionAddress: string;
  agentName: string;
  agentAvatar: string | null;
  userAddress: string | undefined;
  isConnected: boolean;
  theme: string;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages
  useEffect(() => {
    async function loadMessages() {
      setLoadingChat(true);
      try {
        const res = await fetch(`/api/chat/${collectionAddress}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages);
        }
      } catch (err) {
        console.error("Failed to load chat:", err);
      } finally {
        setLoadingChat(false);
      }
    }
    loadMessages();

    // Poll every 10s
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/${collectionAddress}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages);
        }
      } catch { /* silent */ }
    }, 10000);

    return () => clearInterval(interval);
  }, [collectionAddress]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending || !isConnected || !userAddress) return;

    setSending(true);
    try {
      const res = await fetch(`/api/chat/${collectionAddress}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: input.trim(),
          sender_address: userAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setInput("");
      }
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={clsx(
      "rounded-2xl overflow-hidden border",
      theme === "dark"
        ? "bg-gray-900/50 border-white/[0.06]"
        : "bg-white/80 border-gray-200"
    )}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "w-full flex items-center justify-between p-4 transition-colors",
          theme === "dark" ? "hover:bg-white/[0.03]" : "hover:bg-gray-50"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            theme === "dark" ? "bg-cyan-500/10" : "bg-cyan-50"
          )}>
            <MessageSquare className="w-5 h-5 text-cyan-500" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">Chat with {agentName}</h3>
            <p className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Ask the AI creator about this collection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <span className={clsx(
              "text-xs px-2 py-0.5 rounded-full",
              theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
            )}>
              {messages.length}
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {/* Chat Body */}
      {isOpen && (
        <div className={clsx(
          "border-t",
          theme === "dark" ? "border-white/[0.06]" : "border-gray-200"
        )}>
          {/* Messages */}
          <div className={clsx(
            "h-72 overflow-y-auto p-4 space-y-3",
            theme === "dark" ? "scrollbar-dark" : "scrollbar-light"
          )}>
            {loadingChat ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className={clsx("w-10 h-10 mb-3", theme === "dark" ? "text-gray-700" : "text-gray-300")} />
                <p className={clsx("text-sm", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                  No messages yet. Be the first to chat!
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "flex gap-3",
                    msg.sender_type === "agent" ? "flex-row" : "flex-row-reverse"
                  )}
                >
                  {/* Avatar */}
                  <div className={clsx(
                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                    msg.sender_type === "agent"
                      ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
                      : theme === "dark"
                        ? "bg-orange-500/20 text-orange-400"
                        : "bg-orange-100 text-orange-600"
                  )}>
                    {msg.sender_type === "agent" ? (
                      agentAvatar ? (
                        <img src={agentAvatar} alt="" className="w-full h-full rounded-lg object-cover" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )
                    ) : (
                      msg.sender_name.slice(0, 2)
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={clsx(
                    "max-w-[75%] rounded-2xl px-4 py-2.5",
                    msg.sender_type === "agent"
                      ? theme === "dark"
                        ? "bg-white/[0.05] rounded-tl-md"
                        : "bg-gray-100 rounded-tl-md"
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-tr-md"
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx(
                        "text-xs font-medium",
                        msg.sender_type === "agent"
                          ? "text-cyan-500"
                          : "text-white/80"
                      )}>
                        {msg.sender_type === "agent" ? agentName : msg.sender_name}
                      </span>
                      <span className={clsx(
                        "text-xs",
                        msg.sender_type === "agent"
                          ? theme === "dark" ? "text-gray-600" : "text-gray-400"
                          : "text-white/50"
                      )}>
                        {formatChatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className={clsx(
                      "text-sm leading-relaxed break-words",
                      msg.sender_type === "agent" && (theme === "dark" ? "text-gray-300" : "text-gray-700")
                    )}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={clsx(
            "p-3 border-t",
            theme === "dark" ? "border-white/[0.06]" : "border-gray-200"
          )}>
            {isConnected ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the creator..."
                  maxLength={500}
                  className={clsx(
                    "flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
                    theme === "dark"
                      ? "bg-white/[0.03] border-white/[0.06] focus:border-cyan-500/50 text-white placeholder-gray-600"
                      : "bg-gray-50 border-gray-200 focus:border-cyan-300 text-gray-900 placeholder-gray-400"
                  )}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className={clsx(
                    "px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm font-medium",
                    input.trim() && !sending
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/20"
                      : theme === "dark"
                        ? "bg-white/[0.03] text-gray-600 cursor-not-allowed"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <div className={clsx(
                "text-center py-3 rounded-xl text-sm",
                theme === "dark" ? "bg-white/[0.03] text-gray-500" : "bg-gray-50 text-gray-400"
              )}>
                Connect wallet to chat
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatChatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ShareSection({ address, name, theme }: { address: string; name: string; theme: string }) {
  const [copied, setCopied] = useState(false);
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const shareUrl = `${appUrl}/collection/${address}`;
  const shareText = `Check out "${name}" on Clawdmint - minted by an AI agent on Base!`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-5 h-5 text-cyan-500" />
        <h3 className="font-semibold">Share</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {/* Twitter/X */}
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
            theme === "dark"
              ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-gray-300"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          )}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post
        </a>

        {/* Telegram */}
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
            theme === "dark"
              ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-gray-300"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          )}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          Telegram
        </a>

        {/* Copy Link */}
        <button
          onClick={copyLink}
          className={clsx(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all hover:scale-105 text-sm font-medium",
            copied
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : theme === "dark"
                ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-gray-300"
                : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700"
          )}
        >
          {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
