"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useWallet } from "./wallet-context";
import { useTheme } from "./theme-provider";
import { clsx } from "clsx";
import { Lock, Zap, Shield, Wallet, ExternalLink, Coins } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// BANKR GATE
// Requires: 100,000,000 $CLAWDMINT tokens OR 10 ClawdmintAgents NFTs
// ═══════════════════════════════════════════════════════════════════════

const CLAWDMINT_TOKEN = "0x6845307b66427164fE68F6734f0411D4434bcb07" as `0x${string}`;
const AGENTS_NFT = (process.env["NEXT_PUBLIC_AGENTS_CONTRACT"] || "0x8641aa95cb2913bde395cdc8d802404d6eeecd0a") as `0x${string}`;

const REQUIRED_TOKEN_AMOUNT = BigInt("100000000000000000000000000"); // 100M with 18 decimals
const REQUIRED_NFT_COUNT = 10;

// Minimal ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Minimal ERC721 ABI for balanceOf
const ERC721_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface BankrGateProps {
  children: React.ReactNode;
}

export function BankrGate({ children }: BankrGateProps) {
  const { theme } = useTheme();
  const { ready, authenticated, login } = useWallet();
  const { address } = useAccount();
  const [unlocked, setUnlocked] = useState(false);

  // Read token + NFT balances
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CLAWDMINT_TOKEN,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: AGENTS_NFT,
        abi: ERC721_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: {
      enabled: !!address,
      refetchInterval: 30_000,
    },
  });

  useEffect(() => {
    if (!data || isLoading || !address) {
      setUnlocked(false);
      return;
    }

    const tokenBalance = data[0]?.result as bigint | undefined;
    const nftBalance = data[1]?.result as bigint | undefined;

    const hasTokens = tokenBalance !== undefined && tokenBalance >= REQUIRED_TOKEN_AMOUNT;
    const hasNFTs = nftBalance !== undefined && nftBalance >= BigInt(REQUIRED_NFT_COUNT);

    setUnlocked(hasTokens || hasNFTs);
  }, [data, isLoading, address]);

  // If unlocked, render children directly
  if (authenticated && unlocked) {
    return <>{children}</>;
  }

  // Format balances for display
  const tokenBalance = data?.[0]?.result as bigint | undefined;
  const nftBalance = data?.[1]?.result as bigint | undefined;
  const displayTokenBalance = tokenBalance
    ? (Number(tokenBalance) / 1e18).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : "0";
  const displayNftBalance = nftBalance ? Number(nftBalance).toString() : "0";

  return (
    <div className={clsx("min-h-screen transition-colors duration-300", theme === "dark" ? "bg-[#050810]" : "bg-gray-50")}>
      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.015]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.03) 2px, rgba(0,255,255,0.03) 4px)" }} />

      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="w-full max-w-md">
          {/* Lock Card */}
          <div className="rounded-2xl border border-cyan-500/20 bg-[#0a0d14] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-cyan-500/10 bg-cyan-500/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-500/50" />
              </div>
              <span className="font-mono text-[10px] text-cyan-500/60 ml-2">bankr-access — gated content</span>
            </div>

            <div className="p-8 text-center">
              {/* Lock Icon */}
              <div className="mx-auto w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-6">
                <Lock className="w-10 h-10 text-cyan-400" />
              </div>

              <h2 className="font-mono text-lg font-bold text-white mb-2">
                BANKR Access Required
              </h2>
              <p className="font-mono text-xs text-gray-500 mb-8 leading-relaxed">
                This section is exclusively available to Clawdmint holders.
                <br />Connect your wallet to verify access.
              </p>

              {/* Requirements */}
              <div className="space-y-3 mb-8">
                <div className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border text-left",
                  authenticated && tokenBalance !== undefined && tokenBalance >= REQUIRED_TOKEN_AMOUNT
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-white/[0.02] border-white/[0.06]"
                )}>
                  <Coins className={clsx("w-5 h-5 shrink-0",
                    authenticated && tokenBalance !== undefined && tokenBalance >= REQUIRED_TOKEN_AMOUNT
                      ? "text-emerald-400" : "text-gray-600"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-white font-medium">100,000,000 $CLAWDMINT</div>
                    <div className="font-mono text-[10px] text-gray-500">
                      {authenticated ? `Your balance: ${displayTokenBalance}` : "Connect wallet to check"}
                    </div>
                  </div>
                  {authenticated && tokenBalance !== undefined && tokenBalance >= REQUIRED_TOKEN_AMOUNT && (
                    <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>

                {/* OR divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="font-mono text-[10px] text-gray-600">OR</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>

                <div className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border text-left",
                  authenticated && nftBalance !== undefined && nftBalance >= BigInt(REQUIRED_NFT_COUNT)
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-white/[0.02] border-white/[0.06]"
                )}>
                  <Shield className={clsx("w-5 h-5 shrink-0",
                    authenticated && nftBalance !== undefined && nftBalance >= BigInt(REQUIRED_NFT_COUNT)
                      ? "text-emerald-400" : "text-gray-600"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-white font-medium">10 ClawdmintAgents NFTs</div>
                    <div className="font-mono text-[10px] text-gray-500">
                      {authenticated ? `Your balance: ${displayNftBalance} NFTs` : "Connect wallet to check"}
                    </div>
                  </div>
                  {authenticated && nftBalance !== undefined && nftBalance >= BigInt(REQUIRED_NFT_COUNT) && (
                    <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>
              </div>

              {/* Actions */}
              {!authenticated ? (
                <button
                  onClick={login}
                  className="w-full py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30 font-mono text-sm font-bold text-cyan-400 hover:bg-cyan-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4" /> Connect Wallet
                </button>
              ) : !unlocked ? (
                <div className="space-y-3">
                  <div className="py-3 rounded-xl bg-red-500/10 border border-red-500/20 font-mono text-xs text-red-400 text-center">
                    Insufficient balance — requirements not met
                  </div>
                  <div className="flex gap-2">
                    <a href="/mint" className="flex-1 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 font-mono text-[11px] text-cyan-400 hover:bg-cyan-500/20 transition-all text-center flex items-center justify-center gap-1.5">
                      Mint NFTs
                    </a>
                    <a href={`https://dexscreener.com/base/${CLAWDMINT_TOKEN}`} target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] font-mono text-[11px] text-gray-400 hover:text-white transition-all text-center flex items-center justify-center gap-1.5">
                      Buy $CLAWDMINT <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ) : null}

              {/* Loading state */}
              {authenticated && isLoading && (
                <div className="py-3 font-mono text-xs text-gray-500 animate-pulse">
                  Checking your wallet balances...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
