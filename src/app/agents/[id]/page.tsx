"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CollectionCard } from "@/components/collection-card";

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
              {agent.collections.map((collection) => (
                <CollectionCard
                  key={collection.id}
                  collection={{
                    ...collection,
                    agent: {
                      id: agent.id,
                      name: agent.name,
                      avatar_url: agent.avatar_url,
                    },
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
