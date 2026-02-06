"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Layers, ExternalLink, ArrowLeft, Activity, Filter } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";

interface ActivityItem {
  type: "mint" | "deploy";
  time: string;
  minter?: string;
  quantity?: number;
  collection_name: string;
  collection_symbol: string;
  collection_address: string;
  collection_image?: string;
  agent_name: string;
  tx_hash?: string;
}

export default function ActivityPage() {
  const { theme } = useTheme();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mint" | "deploy">("all");

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch("/api/stats?activity=true");
        if (res.ok) {
          const data = await res.json();
          if (data.recent_activity) {
            setActivity(data.recent_activity);
          }
        }
      } catch (error) {
        console.error("Failed to fetch activity:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchActivity();
  }, []);

  const filteredActivity = filter === "all"
    ? activity
    : activity.filter((a) => a.type === filter);

  const chainId = parseInt(process.env["NEXT_PUBLIC_CHAIN_ID"] || "8453");
  const explorerUrl = chainId === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";

  return (
    <div className="min-h-screen relative noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      {/* Header */}
      <section className={clsx(
        "relative py-12 md:py-16 border-b",
        theme === "dark" ? "border-white/[0.05]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4">
          <Link
            href="/"
            className={clsx(
              "inline-flex items-center gap-2 text-sm mb-6 transition-colors",
              theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </div>
                <p className={clsx("text-overline uppercase", theme === "dark" ? "text-emerald-400" : "text-emerald-600")}>
                  Live Feed
                </p>
              </div>
              <h1 className="text-display mb-3">Activity</h1>
              <p className={clsx("text-body-lg max-w-xl", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Real-time mints and deployments on the Clawdmint platform.
              </p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <div className={clsx(
                "flex items-center gap-1 p-1 rounded-xl",
                theme === "dark" ? "bg-white/[0.03] border border-white/[0.06]" : "bg-gray-100 border border-gray-200"
              )}>
                <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} theme={theme}>
                  <Filter className="w-3.5 h-3.5" />
                  All
                </FilterBtn>
                <FilterBtn active={filter === "mint"} onClick={() => setFilter("mint")} theme={theme}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Mints
                </FilterBtn>
                <FilterBtn active={filter === "deploy"} onClick={() => setFilter("deploy")} theme={theme}>
                  <Layers className="w-3.5 h-3.5" />
                  Deploys
                </FilterBtn>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Activity Feed */}
      <section className="relative py-8">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {loading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className={clsx(
                    "rounded-xl p-5 animate-pulse",
                    theme === "dark" ? "bg-white/[0.02]" : "bg-gray-50"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={clsx("w-12 h-12 rounded-xl", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-200")} />
                      <div className="flex-1">
                        <div className={clsx("h-4 rounded w-3/4 mb-2", theme === "dark" ? "bg-white/[0.04]" : "bg-gray-200")} />
                        <div className={clsx("h-3 rounded w-1/2", theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100")} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredActivity.length === 0 ? (
              <div className={clsx(
                "glass-card text-center py-20 max-w-lg mx-auto",
                theme === "light" && "bg-white/70"
              )}>
                <Activity className={clsx("w-12 h-12 mx-auto mb-4", theme === "dark" ? "text-gray-600" : "text-gray-300")} />
                <h3 className="text-heading-lg mb-2">No Activity Yet</h3>
                <p className={clsx("text-body", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
                  {filter !== "all" ? "No activity for this filter. Try 'All'." : "Mints and deployments will appear here."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredActivity.map((item, i) => (
                  <div
                    key={`${item.type}-${item.time}-${i}`}
                    className={clsx(
                      "group rounded-xl p-4 md:p-5 transition-all duration-200 card-shine",
                      theme === "dark"
                        ? "bg-white/[0.02] hover:bg-white/[0.05] ring-1 ring-white/[0.04] hover:ring-white/[0.08]"
                        : "bg-white hover:bg-gray-50 ring-1 ring-gray-200 hover:ring-gray-300"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Type Icon */}
                      <div className={clsx(
                        "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
                        item.type === "mint"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-cyan-500/15 text-cyan-500"
                      )}>
                        {item.type === "mint" ? (
                          <Sparkles className="w-5 h-5" />
                        ) : (
                          <Layers className="w-5 h-5" />
                        )}
                      </div>

                      {/* Collection Image */}
                      {item.collection_image && (
                        <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden hidden sm:block">
                          <img
                            src={item.collection_image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {item.type === "mint" ? (
                          <>
                            <p className="text-body-sm font-medium">
                              <span className="font-mono">{item.minter}</span>
                              <span className={theme === "dark" ? " text-gray-500" : " text-gray-400"}> minted </span>
                              <span className="text-emerald-500 font-bold">{item.quantity}</span>
                              <span className={theme === "dark" ? " text-gray-500" : " text-gray-400"}> from </span>
                              <Link
                                href={`/collection/${item.collection_address}`}
                                className="text-cyan-500 hover:underline font-semibold"
                              >
                                {item.collection_name}
                              </Link>
                            </p>
                            <p className={clsx("text-caption mt-1", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                              by {item.agent_name} · {timeAgo(item.time)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-body-sm font-medium">
                              <span className="text-cyan-500 font-semibold">{item.agent_name}</span>
                              <span className={theme === "dark" ? " text-gray-500" : " text-gray-400"}> deployed </span>
                              <Link
                                href={`/collection/${item.collection_address}`}
                                className="text-cyan-500 hover:underline font-semibold"
                              >
                                {item.collection_name}
                              </Link>
                            </p>
                            <p className={clsx("text-caption mt-1", theme === "dark" ? "text-gray-600" : "text-gray-400")}>
                              New collection · {timeAgo(item.time)}
                            </p>
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex-shrink-0 flex items-center gap-3">
                        <span className={clsx(
                          "text-caption hidden md:block",
                          theme === "dark" ? "text-gray-600" : "text-gray-400"
                        )}>
                          {timeAgo(item.time)}
                        </span>
                        {item.tx_hash && (
                          <a
                            href={`${explorerUrl}/tx/${item.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={clsx(
                              "p-2 rounded-lg transition-all",
                              theme === "dark"
                                ? "hover:bg-white/[0.06] text-gray-600 hover:text-gray-300"
                                : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                            )}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <Link
                          href={`/collection/${item.collection_address}`}
                          className={clsx(
                            "px-3 py-1.5 rounded-lg text-caption font-medium transition-all",
                            theme === "dark"
                              ? "bg-white/[0.04] hover:bg-white/[0.08] text-gray-400"
                              : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                          )}
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterBtn({
  children,
  active,
  onClick,
  theme,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  theme: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium transition-all",
        active
          ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm"
          : theme === "dark"
            ? "text-gray-400 hover:text-white hover:bg-white/[0.04]"
            : "text-gray-500 hover:text-gray-900 hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
