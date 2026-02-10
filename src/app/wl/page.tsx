"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { CheckCircle, Circle, ExternalLink, Wallet, Send, Shield, Copy, Check } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// CONFIG — Update these values
// ═══════════════════════════════════════════════════════════════════════

const TWITTER_HANDLE = "clawdmint";
const TWITTER_FOLLOW_URL = `https://x.com/intent/follow?screen_name=${TWITTER_HANDLE}`;

// Tweet to engage with
const TWEET_ID = "2021217617743077662";
const TWEET_LIKE_URL = `https://x.com/intent/like?tweet_id=${TWEET_ID}`;
const TWEET_RT_URL = `https://x.com/intent/retweet?tweet_id=${TWEET_ID}`;
const TWEET_REPLY_URL = `https://x.com/intent/tweet?in_reply_to=${TWEET_ID}`;

// ═══════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════

interface Task {
  id: string;
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
}

const TASKS: Task[] = [
  {
    id: "follow",
    title: `Follow @${TWITTER_HANDLE}`,
    description: "Follow Clawdmint on X to stay updated.",
    actionUrl: TWITTER_FOLLOW_URL,
    actionLabel: "Follow",
  },
  {
    id: "like",
    title: "Like the Tweet",
    description: "Like the pinned announcement tweet.",
    actionUrl: TWEET_LIKE_URL,
    actionLabel: "Like",
  },
  {
    id: "retweet",
    title: "Retweet",
    description: "Retweet to spread the word.",
    actionUrl: TWEET_RT_URL,
    actionLabel: "Retweet",
  },
  {
    id: "comment",
    title: "Comment on the Tweet",
    description: "Leave a comment with your thoughts.",
    actionUrl: TWEET_REPLY_URL,
    actionLabel: "Comment",
  },
];

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════

export default function WhitelistPage() {
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [walletAddress, setWalletAddress] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [wlPosition, setWlPosition] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const allTasksCompleted = TASKS.every((t) => completedTasks.has(t.id));

  const markTask = (taskId: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
  };

  const handleTaskAction = (task: Task) => {
    window.open(task.actionUrl, "_blank", "noopener,noreferrer,width=600,height=400");
    // Mark as completed after opening (trust-based)
    setTimeout(() => markTask(task.id), 2000);
  };

  const handleSubmit = async () => {
    setError("");
    if (!walletAddress) {
      setError("Please enter your wallet address.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      setError("Invalid wallet address format.");
      return;
    }
    if (!allTasksCompleted) {
      setError("Please complete all tasks first.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          twitterHandle: twitterHandle || null,
          completedTasks: Array.from(completedTasks),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setWlPosition(data.position);
      } else {
        setError(data.error || "Submission failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  // ── SUCCESS STATE ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#050a05] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="rounded-xl border border-emerald-500/20 bg-[#0a0f0a] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/10 bg-emerald-500/[0.03]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <span className="font-mono text-[10px] text-emerald-500/60 ml-2">clawdmint — whitelist</span>
            </div>
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-mono font-bold text-emerald-400 mb-2">WHITELIST_CONFIRMED</h2>
                <p className="text-gray-500 text-sm font-mono">All tasks completed successfully.</p>
              </div>
              {wlPosition && (
                <div className="inline-block px-4 py-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03]">
                  <span className="font-mono text-xs text-gray-500">position: </span>
                  <span className="font-mono text-sm text-emerald-400 font-bold">#{wlPosition}</span>
                </div>
              )}
              <div className="pt-2">
                <p className="text-gray-600 text-xs font-mono">wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
              </div>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/[0.06] transition-all font-mono text-xs"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied!" : "Share WL Link"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN FORM ──
  return (
    <div className="min-h-screen bg-[#050a05] relative">
      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-10 opacity-[0.015]" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.03) 2px, rgba(0,255,0,0.03) 4px)",
      }} />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-500/[0.03] rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 py-8 md:py-16 relative z-20 max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] mb-4">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-[11px] text-emerald-400 uppercase tracking-wider">Whitelist</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold text-emerald-400 mb-3">
            CLAWDMINT_WL
          </h1>
          <p className="text-gray-500 font-mono text-xs leading-relaxed max-w-sm mx-auto">
            Complete all tasks to join the Clawdmint Agents whitelist.
            Early supporters get priority mint access.
          </p>
        </div>

        {/* Terminal Window */}
        <div className="rounded-xl border border-emerald-500/20 bg-[#0a0f0a] overflow-hidden mb-6">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/10 bg-emerald-500/[0.03]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
            </div>
            <span className="font-mono text-[10px] text-emerald-500/60 ml-2">clawdmint — tasks</span>
            <span className="ml-auto font-mono text-[10px] text-gray-600">
              {completedTasks.size}/{TASKS.length}
            </span>
          </div>

          <div className="p-4 space-y-1">
            <div className="flex gap-2 font-mono text-sm text-gray-500 mb-3">
              <span className="text-emerald-500">$</span>
              <span>./join-whitelist --tasks</span>
            </div>

            {/* Task List */}
            {TASKS.map((task, i) => {
              const isCompleted = completedTasks.has(task.id);
              return (
                <div
                  key={task.id}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-lg border transition-all",
                    isCompleted
                      ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                      : "border-emerald-500/[0.06] bg-transparent hover:bg-emerald-500/[0.02]"
                  )}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-600" />
                    )}
                  </div>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <p className={clsx(
                      "font-mono text-sm font-medium",
                      isCompleted ? "text-emerald-400/80" : "text-gray-300"
                    )}>
                      {task.title}
                    </p>
                    <p className="font-mono text-[11px] text-gray-600">{task.description}</p>
                  </div>

                  {/* Action button */}
                  {isCompleted ? (
                    <span className="font-mono text-[10px] text-emerald-500/60 uppercase">done</span>
                  ) : (
                    <button
                      onClick={() => handleTaskAction(task)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400 hover:bg-emerald-500/[0.12] hover:border-emerald-500/40 transition-all font-mono text-xs"
                    >
                      {task.actionLabel}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-4">
            <div className="h-1.5 bg-emerald-500/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/40 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${(completedTasks.size / TASKS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Wallet Submission */}
        <div className={clsx(
          "rounded-xl border overflow-hidden transition-all",
          allTasksCompleted
            ? "border-emerald-500/30 bg-[#0a0f0a]"
            : "border-gray-800/50 bg-[#0a0f0a] opacity-50 pointer-events-none"
        )}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/10 bg-emerald-500/[0.03]">
            <Wallet className="w-3.5 h-3.5 text-emerald-500/60" />
            <span className="font-mono text-[10px] text-emerald-500/60">submit wallet</span>
          </div>

          <div className="p-4 space-y-3">
            {/* Twitter handle (optional) */}
            <div>
              <label className="font-mono text-[10px] text-gray-600 uppercase tracking-wider block mb-1.5">
                Twitter Handle (optional)
              </label>
              <input
                type="text"
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value.replace("@", ""))}
                placeholder="@username"
                className="w-full px-3 py-2.5 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.02] font-mono text-sm text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30 transition-colors"
              />
            </div>

            {/* Wallet address */}
            <div>
              <label className="font-mono text-[10px] text-gray-600 uppercase tracking-wider block mb-1.5">
                Wallet Address *
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => { setWalletAddress(e.target.value); setError(""); }}
                placeholder="0x..."
                className="w-full px-3 py-2.5 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.02] font-mono text-sm text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30 transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="font-mono text-xs text-red-400">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !allTasksCompleted || !walletAddress}
              className={clsx(
                "w-full py-3 rounded-lg font-mono font-bold text-sm transition-all flex items-center justify-center gap-2",
                submitting
                  ? "bg-gray-500/10 border border-gray-500/20 text-gray-500 cursor-wait"
                  : allTasksCompleted && walletAddress
                    ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/10"
                    : "bg-gray-500/5 border border-gray-500/10 text-gray-600 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
              {submitting ? "Submitting..." : "Submit for Whitelist"}
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center font-mono text-[10px] text-gray-700 mt-6">
          powered by clawdmint protocol
        </p>
      </div>
    </div>
  );
}
