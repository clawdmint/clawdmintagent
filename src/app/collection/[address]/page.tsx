"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import Image from "next/image";
import { COLLECTION_ABI } from "@/lib/contracts";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import { Bot, ExternalLink, ArrowLeft, Minus, Plus, Sparkles, CheckCircle } from "lucide-react";

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
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-bg" />
        <div className="hero-orb hero-orb-cyan w-[500px] h-[500px] top-[-150px] right-[-150px]" />
        <div className="hero-orb hero-orb-purple w-[300px] h-[300px] bottom-[-50px] left-[-100px]" />
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

          <div className="grid md:grid-cols-2 gap-12">
            {/* Image */}
            <div className="relative">
              <div className={clsx(
                "aspect-square rounded-2xl overflow-hidden sticky top-24",
                theme === "dark" ? "bg-gray-800" : "bg-gray-100"
              )}>
                {collection.image_url ? (
                  <img
                    src={collection.image_url}
                    alt={collection.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={clsx(
                    "w-full h-full flex items-center justify-center",
                    theme === "dark" 
                      ? "bg-gradient-to-br from-cyan-900/30 to-purple-900/30"
                      : "bg-gradient-to-br from-cyan-100 to-purple-100"
                  )}>
                    <span className="text-9xl opacity-50">🖼️</span>
                  </div>
                )}
                
                {isSoldOut && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <span className="text-3xl font-bold text-red-400 uppercase tracking-wider">Sold Out</span>
                  </div>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-6">
              {/* Header */}
              <div>
                <p className="text-cyan-500 text-sm font-medium mb-2">${collection.symbol}</p>
                <h1 className="text-4xl font-bold mb-4">{collection.name}</h1>
                
                {/* Agent */}
                <Link 
                  href={`/agents/${collection.agent.id}`}
                  className={clsx(
                    "inline-flex items-center gap-3 glass px-4 py-2 rounded-xl transition-colors",
                    theme === "dark" ? "hover:bg-white/[0.08]" : "hover:bg-gray-100"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center overflow-hidden">
                    {collection.agent.avatar_url ? (
                      <img 
                        src={collection.agent.avatar_url} 
                        alt={collection.agent.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Bot className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div>
                    <p className={clsx("text-xs", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                      Deployed by
                    </p>
                    <p className="font-medium">{collection.agent.name}</p>
                  </div>
                </Link>
              </div>

              {/* Description */}
              {collection.description && (
                <p className={clsx("leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
                  {collection.description}
                </p>
              )}

              {/* Stats */}
              <div className={clsx("glass-card", theme === "light" && "bg-white/80")}>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Supply</p>
                    <p className="text-xl font-bold">{collection.max_supply.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Minted</p>
                    <p className="text-xl font-bold">{parseInt(totalMinted).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>Remaining</p>
                    <p className="text-xl font-bold text-cyan-500">{parseInt(remaining).toLocaleString()}</p>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className={clsx("h-2 rounded-full overflow-hidden", theme === "dark" ? "bg-white/[0.05]" : "bg-gray-200")}>
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <p className={clsx("text-xs mt-2 text-right", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  {progress.toFixed(1)}% minted
                </p>
              </div>

              {/* Mint Section */}
              <div className={clsx("glass-card space-y-4", theme === "light" && "bg-white/80")}>
                <div className="flex items-center justify-between">
                  <span className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Mint Price</span>
                  <span className="text-2xl font-bold text-cyan-500">
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
              <div className={clsx("glass-card space-y-3 text-sm", theme === "light" && "bg-white/80")}>
                <h3 className="font-semibold mb-4">Contract Details</h3>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
