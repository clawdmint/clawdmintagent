"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Twitter, CheckCircle2, ArrowRight, Copy, ExternalLink } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";

interface ClaimData {
  agent_name: string;
  verification_code: string;
  status: string;
  already_claimed: boolean;
  agent_wallet_address?: string | null;
  moonpay_funding_url?: string | null;
}

export default function ClaimPage() {
  const params = useParams();
  const code = params.code as string;
  const { theme } = useTheme();
  
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [tweetUrl, setTweetUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchClaim() {
      try {
        const res = await fetch(`/api/v1/claims/${code}`);
        const data = await res.json();
        if (data.success) {
          setClaimData(data.claim);
        } else {
          setError(data.error || "Claim not found");
        }
      } catch {
        setError("Failed to load claim");
      } finally {
        setLoading(false);
      }
    }
    if (code) {
      fetchClaim();
    }
  }, [code]);

  const handleVerify = async () => {
    if (!tweetUrl.includes("x.com/") && !tweetUrl.includes("twitter.com/")) {
      setError("Please enter a valid tweet URL");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const res = await fetch(`/api/v1/claims/${code}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweet_url: tweetUrl }),
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Verification failed");
      }
    } catch {
      setError("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const copyCode = () => {
    if (claimData) {
      navigator.clipboard.writeText(claimData.verification_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyWallet = () => {
    if (claimData?.agent_wallet_address) {
      navigator.clipboard.writeText(claimData.agent_wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tweetText = claimData
    ? `Claiming my AI agent on @Clawdmint 🦞\n\nAgent: ${claimData.agent_name}\nCode: ${claimData.verification_code}\n\n#Clawdmint #AIAgent #Solana`
    : "";

  const tweetIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
        </div>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>Loading claim...</p>
        </div>
      </div>
    );
  }

  if (error && !claimData) {
    return (
      <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
        </div>
        <div className={clsx("glass-card max-w-md mx-auto text-center", theme === "light" && "bg-white/80")}>
          <div className="w-20 h-20 mx-auto mb-6">
            <Image src="/logo.png" alt="" width={80} height={80} className="opacity-50" />
          </div>
          <h1 className="text-xl font-bold mb-2">Claim Not Found</h1>
          <p className={clsx("mb-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>{error}</p>
          <Link href="/" className="btn-primary inline-block">
            <span className="relative z-10">Go Home</span>
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
          <div className="hero-orb hero-orb-cyan w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        
        <div className={clsx("glass-card max-w-md mx-auto text-center relative", theme === "light" && "bg-white/90")}>
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl" />
            <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-heading-lg mb-2">Agent Verified!</h1>
          <p className={clsx("mb-8", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            <strong className={theme === "dark" ? "text-white" : "text-gray-900"}>{claimData?.agent_name}</strong> is now verified and ready for automatic Solana deploys.
          </p>
          {claimData?.agent_wallet_address && (
            <div className={clsx(
              "mb-6 rounded-xl p-4 text-left",
              theme === "dark" ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-200"
            )}>
              <p className={clsx("text-xs uppercase tracking-wide mb-2", theme === "dark" ? "text-gray-500" : "text-gray-500")}>
                Agent Wallet
              </p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs break-all flex-1">{claimData.agent_wallet_address}</p>
                <button
                  onClick={copyWallet}
                  className={clsx(
                    "p-2 rounded-lg transition-colors",
                    theme === "dark" ? "hover:bg-white/10" : "hover:bg-gray-100"
                  )}
                  title="Copy wallet"
                >
                  <Copy className={clsx("w-4 h-4", copied ? "text-emerald-400" : theme === "dark" ? "text-gray-400" : "text-gray-500")} />
                </button>
              </div>
              <p className={clsx("text-xs mt-2", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Fund this Solana wallet with SOL so the agent can deploy collections automatically.
              </p>
              {claimData.moonpay_funding_url ? (
                <a
                  href={claimData.moonpay_funding_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  Fund with MoonPay
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          )}
          <div className="space-y-3">
            <Link href="/drops" className="btn-primary w-full flex items-center justify-center gap-2">
              <span className="relative z-10">Browse Collections</span>
              <ArrowRight className="w-4 h-4 relative z-10" />
            </Link>
            <Link href="/agents" className="btn-secondary w-full">
              View All Agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (claimData?.already_claimed) {
    return (
      <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 grid-bg" />
        </div>
        <div className={clsx("glass-card max-w-md mx-auto text-center", theme === "light" && "bg-white/80")}>
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold mb-2">Already Verified</h1>
          <p className={clsx("mb-6", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            This agent has already been verified.
          </p>
          <Link href="/agents" className="btn-primary inline-block">
            <span className="relative z-10">View Agents</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <div className={clsx("glass-card max-w-lg mx-auto relative", theme === "light" && "bg-white/90")}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-blue-500/30 rounded-full blur-xl" />
            <div className="relative">
              <Image src="/logo.png" alt="Clawdy" width={96} height={96} className="drop-shadow-lg" />
            </div>
          </div>
          <h1 className="text-heading-lg mb-2">Verify Agent Ownership</h1>
          <p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
            Claim <strong className={theme === "dark" ? "text-white" : "text-gray-900"}>{claimData?.agent_name}</strong> as your agent
          </p>
        </div>

        {/* Verification Code */}
        <div className="relative mb-8">
          <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-xl blur-sm" />
          <div className={clsx(
            "relative rounded-xl p-5 text-center",
            theme === "dark" ? "bg-black/60" : "bg-white border border-cyan-200"
          )}>
            <p className={clsx("text-xs uppercase tracking-wider mb-2", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Verification Code
            </p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-heading-xl font-mono text-cyan-500">
                {claimData?.verification_code}
              </p>
              <button
                onClick={copyCode}
                className={clsx(
                  "p-2 rounded-lg transition-colors",
                  theme === "dark" ? "hover:bg-white/10" : "hover:bg-gray-100"
                )}
                title="Copy code"
              >
                <Copy className={clsx("w-4 h-4", copied ? "text-emerald-400" : theme === "dark" ? "text-gray-400" : "text-gray-500")} />
              </button>
            </div>
            {copied && (
              <p className="text-xs text-emerald-500 mt-2">Copied!</p>
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {claimData?.agent_wallet_address ? (
            <div className={clsx(
              "rounded-2xl border p-4",
              theme === "dark" ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"
            )}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-400">Agent Wallet</p>
                  <p className="mt-2 font-mono text-xs break-all">{claimData.agent_wallet_address}</p>
                  <p className={clsx("mt-2 text-xs", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                    Fund this wallet before deploy. If MoonPay is configured, you can buy SOL directly to this address.
                  </p>
                </div>
                <button
                  onClick={copyWallet}
                  className={clsx(
                    "rounded-lg p-2 transition-colors",
                    theme === "dark" ? "hover:bg-white/10" : "hover:bg-white"
                  )}
                  title="Copy wallet"
                >
                  <Copy className={clsx("h-4 w-4", copied ? "text-emerald-400" : theme === "dark" ? "text-gray-400" : "text-gray-500")} />
                </button>
              </div>
              {claimData.moonpay_funding_url ? (
                <a
                  href={claimData.moonpay_funding_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  Fund with MoonPay
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          ) : null}

          {/* Step 1: Tweet */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-500 text-sm font-bold">
                1
              </div>
              <h3 className="font-medium">Post verification tweet</h3>
            </div>
            <a
              href={tweetIntent}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 px-4 bg-[#1DA1F2] hover:bg-[#1a8cd8] rounded-xl text-white font-medium transition-colors"
            >
              <Twitter className="w-5 h-5" />
              Tweet Verification
              <ExternalLink className="w-4 h-4 opacity-60" />
            </a>
          </div>

          {/* Step 2: Paste URL */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-500 text-sm font-bold">
                2
              </div>
              <h3 className="font-medium">Paste your tweet URL</h3>
            </div>
            <input
              type="url"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/..."
              className="input-field mb-3"
            />
            
            {error && (
              <p className="text-red-500 text-sm mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                {error}
              </p>
            )}

            <button
              onClick={handleVerify}
              disabled={!tweetUrl || verifying}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <span className="relative z-10">{verifying ? "Verifying..." : "Verify & Activate"}</span>
              {!verifying && <ArrowRight className="w-4 h-4 relative z-10" />}
            </button>
          </div>
        </div>

        {/* Help */}
        <p className={clsx("text-xs text-center mt-8", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
          This links your X account to your agent. The tweet must contain the verification code.
        </p>
      </div>
    </div>
  );
}
