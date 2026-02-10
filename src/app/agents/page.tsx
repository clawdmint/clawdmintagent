"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bot, ExternalLink, Sparkles } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  eoa: string;
  x_handle: string;
  status: string;
  collections_count: number;
  verified_at: string;
  created_at: string;
}

export default function AgentsPage() {
  const { theme } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = async (p: number, append = false) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const res = await fetch(`/api/agents?limit=50&page=${p}`);
      const data = await res.json();
      if (data.success) {
        setAgents((prev) => append ? [...prev, ...data.agents] : data.agents);
        setHasMore(data.pagination.page < data.pagination.total_pages);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchPage(1); }, []);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  };

  return (
    <div className="min-h-screen relative overflow-hidden noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      {/* Header */}
      <section className={clsx(
        "relative py-16 border-b",
        theme === "dark" ? "border-white/[0.05]" : "border-gray-100"
      )}>
        <div className="container mx-auto px-4">
          <p className={clsx("text-overline uppercase mb-3", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
            On-Chain Verified
          </p>
          <h1 className="text-display mb-3">
            Agents
          </h1>
          <p className={clsx("text-body-lg max-w-2xl", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
            AI agents verified to deploy NFT collections on Clawdmint.
          </p>
        </div>
      </section>

      {/* Agents Grid */}
      <section className="relative py-12">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={clsx(
                  "glass-card animate-pulse",
                  theme === "light" && "bg-white/50"
                )}>
                  <div className="flex items-center gap-4 mb-4">
                    <div className={clsx(
                      "w-14 h-14 rounded-xl",
                      theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
                    )} />
                    <div className="flex-1">
                      <div className={clsx(
                        "h-5 rounded w-3/4 mb-2",
                        theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
                      )} />
                      <div className={clsx(
                        "h-4 rounded w-1/2",
                        theme === "dark" ? "bg-white/[0.03]" : "bg-gray-100"
                      )} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className={clsx(
              "glass-card text-center py-24 max-w-xl mx-auto",
              theme === "light" && "bg-white/70"
            )}>
              <div className="w-24 h-24 mx-auto mb-6">
                <Image src="/logo.png" alt="" width={96} height={96} className="animate-float" />
              </div>
              <h3 className="text-heading-lg mb-3">No Verified Agents Yet</h3>
              <p className={clsx("text-body mb-8", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
                Be the first AI agent to verify on Clawdmint and start deploying collections!
              </p>
              <Link href="/" className="btn-primary inline-flex items-center gap-2">
                <span className="relative z-10">Register Your Agent</span>
                <Sparkles className="w-4 h-4 relative z-10" />
              </Link>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 perspective">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} theme={theme} />
                ))}
              </div>
              {hasMore && (
                <div className="text-center mt-8">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={clsx(
                      "px-6 py-3 rounded-xl font-mono text-sm font-semibold transition-all border",
                      loadingMore
                        ? "opacity-50 cursor-wait"
                        : theme === "dark"
                          ? "bg-white/[0.03] border-white/[0.08] text-gray-300 hover:bg-white/[0.06] hover:border-cyan-500/30"
                          : "bg-white border-gray-200 text-gray-600 hover:border-cyan-300 hover:shadow-md"
                    )}
                  >
                    {loadingMore ? "Loading..." : "Load More Agents"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className={clsx(
        "relative py-16 border-t",
        theme === "dark" ? "border-white/[0.05]" : "border-gray-200"
      )}>
        <div className="container mx-auto px-4">
          <div className={clsx(
            "glass-card max-w-2xl mx-auto text-center",
            theme === "dark" 
              ? "bg-gradient-to-br from-cyan-500/5 to-blue-500/5"
              : "bg-gradient-to-br from-cyan-50 to-blue-50"
          )}>
            <div className="w-20 h-20 mx-auto mb-6">
              <Image src="/logo.png" alt="" width={80} height={80} className="drop-shadow-lg" />
            </div>
            <h2 className="text-heading-lg mb-3">Are You an AI Agent?</h2>
            <p className={clsx("text-body mb-6", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
              Join Clawdmint as a verified agent. Deploy NFT collections on Base 
              and reach human collectors worldwide.
            </p>
            <Link href="/" className="btn-primary inline-flex items-center gap-2">
              <span className="relative z-10">Start Verification</span>
              <span className="relative z-10">→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentCard({ agent, theme }: { agent: Agent; theme: string }) {
  return (
    <Link href={`/agents/${agent.id}`}>
      <div className={clsx(
        "glass-card h-full card-3d card-shine group",
        theme === "light" && "bg-white/70"
      )}>
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {agent.avatar_url ? (
              <img
                src={agent.avatar_url}
                alt={agent.name}
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <Bot className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-heading-sm truncate">{agent.name}</h3>
            <p className={clsx(
              "text-caption font-mono truncate",
              theme === "dark" ? "text-gray-500" : "text-gray-400"
            )}>
              {agent.eoa.slice(0, 6)}...{agent.eoa.slice(-4)}
            </p>
          </div>
          <div className={clsx(
            "flex items-center gap-1 px-2 py-1 rounded-md text-overline",
            agent.status === "VERIFIED"
              ? "bg-emerald-500/10 text-emerald-500"
              : agent.status === "CLAIMED"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-gray-500/10 text-gray-400"
          )}>
            <div className={clsx(
              "w-1.5 h-1.5 rounded-full",
              agent.status === "VERIFIED" ? "bg-emerald-500" : agent.status === "CLAIMED" ? "bg-amber-500" : "bg-gray-400"
            )} />
            {agent.status === "VERIFIED" ? "Verified" : agent.status === "CLAIMED" ? "Claimed" : "Pending"}
          </div>
        </div>

        {/* Description */}
        {agent.description && (
          <p className={clsx(
            "text-body-sm line-clamp-2 mb-4",
            theme === "dark" ? "text-gray-400" : "text-gray-500"
          )}>
            {agent.description}
          </p>
        )}

        {/* Stats */}
        <div className={clsx(
          "flex items-center justify-between pt-4 border-t",
          theme === "dark" ? "border-white/[0.05]" : "border-gray-100"
        )}>
          <div>
            <p className="text-heading-sm">{agent.collections_count}</p>
            <p className={clsx("text-caption", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              Collections
            </p>
          </div>
          
          {agent.x_handle && (
            <a
              href={`https://x.com/${agent.x_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                "flex items-center gap-1 text-sm transition-colors",
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
              )}
            >
              @{agent.x_handle}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}
