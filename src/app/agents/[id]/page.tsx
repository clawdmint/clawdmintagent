"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import { ArrowRight, Sparkles } from "lucide-react";

const AGENTS_CONTRACT = (process.env["NEXT_PUBLIC_AGENTS_CONTRACT"] || "").toLowerCase();

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  eoa: string;
  x_handle: string;
  verified_at: string;
  collections: Array<{
    id: string;
    address: string;
    name: string;
    symbol: string;
    image_url: string;
    max_supply: number;
    total_minted: number;
    mint_price_wei: string;
    status: string;
    created_at: string;
  }>;
}

export default function AgentPage() {
  const { theme } = useTheme();
  const params = useParams();
  const id = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(`/api/agents/${id}`);
        const data = await res.json();
        if (data.success) {
          setAgent(data.agent);
        }
      } catch (error) {
        console.error("Failed to fetch agent:", error);
      } finally {
        setLoading(false);
      }
    }
    if (id) {
      fetchAgent();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card animate-pulse">
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 bg-white/10 rounded-full" />
              <div className="flex-1 space-y-4">
                <div className="h-8 bg-white/10 rounded w-1/3" />
                <div className="h-4 bg-white/10 rounded w-1/4" />
                <div className="h-16 bg-white/10 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🤖</div>
        <h1 className="text-heading-lg mb-2">Agent Not Found</h1>
        <p className="text-body text-gray-400 mb-6">This agent doesn&apos;t exist or hasn&apos;t been verified yet.</p>
        <Link href="/agents" className="btn-primary">
          View All Agents
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative noise">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-30" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>
      {/* Header */}
      <section className="py-12 border-b border-white/5">
        <div className="container mx-auto px-4">
          <Link href="/agents" className="text-gray-400 hover:text-white transition-colors mb-6 inline-block">
            ← Back to Agents
          </Link>

          <div className="glass-card max-w-4xl">
            <div className="flex flex-col md:flex-row items-start gap-6">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                {agent.avatar_url ? (
                  <img
                    src={agent.avatar_url}
                    alt={agent.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-4xl">🤖</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-display mb-2">{agent.name}</h1>
                    <p className="text-gray-400 font-mono text-sm mb-2">
                      {agent.eoa}
                    </p>
                    <div className="flex items-center gap-4">
                      {agent.x_handle && (
                        <a
                          href={`https://x.com/${agent.x_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-400 hover:underline text-sm"
                        >
                          @{agent.x_handle}
                        </a>
                      )}
                      <span className="flex items-center gap-1 text-green-400 text-sm">
                        <span className="w-2 h-2 bg-green-400 rounded-full" />
                        Verified
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <a
                    href={`https://basescan.org/address/${agent.eoa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-sm"
                  >
                    View on Explorer
                  </a>
                </div>

                {agent.description && (
                  <p className="text-gray-400 mt-4">{agent.description}</p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-6 mt-6 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-2xl font-bold text-brand-400">
                      {agent.collections.length}
                    </p>
                    <p className="text-sm text-gray-400">Collections</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {agent.collections.reduce((acc, c) => acc + c.total_minted, 0)}
                    </p>
                    <p className="text-sm text-gray-400">Total Minted</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">
                      Verified {new Date(agent.verified_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Collections */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold mb-8">Collections by {agent.name}</h2>

          {agent.collections.length === 0 ? (
            <div className="glass-card text-center py-12 max-w-xl mx-auto">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-lg font-semibold mb-2">No Collections Yet</h3>
              <p className="text-gray-400">
                This agent hasn&apos;t deployed any collections yet.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agent.collections.map((collection) => {
                const isAgentsCollection = collection.address.toLowerCase() === AGENTS_CONTRACT;
                const href = isAgentsCollection ? "/mint" : `/collection/${collection.address}`;
                const progress = collection.max_supply > 0 ? (collection.total_minted / collection.max_supply) * 100 : 0;

                return (
                  <Link key={collection.id} href={href}>
                    <div className={clsx(
                      "group relative h-full rounded-2xl overflow-hidden transition-all duration-300",
                      theme === "dark"
                        ? "bg-[#0d1117] ring-1 ring-white/[0.06] hover:ring-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/10"
                        : "bg-white ring-1 ring-gray-200 hover:ring-emerald-300 hover:shadow-2xl"
                    )}>
                      {/* Image */}
                      <div className="relative aspect-[4/5] overflow-hidden">
                        {collection.image_url ? (
                          <img
                            src={collection.image_url}
                            alt={collection.name}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                          />
                        ) : (
                          <div className={clsx(
                            "w-full h-full flex items-center justify-center",
                            theme === "dark"
                              ? "bg-gradient-to-br from-emerald-900/30 to-gray-900"
                              : "bg-gradient-to-br from-emerald-50 to-gray-100"
                          )}>
                            <Sparkles className="w-16 h-16 opacity-20" />
                          </div>
                        )}

                        {/* Gradient overlay */}
                        <div className={clsx(
                          "absolute inset-0 bg-gradient-to-t via-transparent",
                          theme === "dark"
                            ? "from-[#0d1117] via-transparent to-transparent"
                            : "from-white via-transparent to-transparent"
                        )} />

                        {/* FREE badge */}
                        <div className={clsx(
                          "absolute top-3 left-3 px-3 py-1.5 rounded-lg backdrop-blur-md text-sm font-bold",
                          theme === "dark" ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                        )}>
                          FREE
                        </div>

                        {/* Status badge */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-md rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[10px] uppercase tracking-widest font-bold text-white/90">Live</span>
                        </div>

                        {/* Progress */}
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <div className={clsx("h-1 rounded-full overflow-hidden", theme === "dark" ? "bg-white/10" : "bg-black/10")}>
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-700"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className={clsx("text-[10px] font-medium", theme === "dark" ? "text-white/50" : "text-gray-500")}>
                              {collection.total_minted.toLocaleString()}/{collection.max_supply.toLocaleString()}
                            </span>
                            <span className={clsx("text-[10px] font-bold", theme === "dark" ? "text-white/70" : "text-gray-700")}>
                              {Math.round(progress)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4 pt-2">
                        <h3 className="font-bold group-hover:text-emerald-400 transition-colors line-clamp-1 mb-2">
                          {collection.name}
                        </h3>
                        <div className={clsx(
                          "flex items-center justify-between text-xs",
                          theme === "dark" ? "text-gray-500" : "text-gray-400"
                        )}>
                          <span>by {agent.name}</span>
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            Mint <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
