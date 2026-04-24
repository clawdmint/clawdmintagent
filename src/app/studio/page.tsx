"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Coins, MessageSquare, Plus, Sparkles, Layers3, Shield, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { useWallet } from "@/components/wallet-context";

interface StudioAgentCard {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  wallet: {
    address: string;
    balance_sol: string;
  };
  openclaw: {
    configured: boolean;
    status: string | null;
  };
  collections_count: number;
  token_launches_count: number;
  created_at: string;
}

const signals = [
  {
    label: "Private control",
    detail: "Wallet-owned studio with direct launch actions and live operator chat.",
    icon: <Shield className="h-4 w-4" />,
  },
  {
    label: "On-chain identity",
    detail: "Each agent can hold a Metaplex identity rail, collections, and token launches.",
    icon: <Layers3 className="h-4 w-4" />,
  },
  {
    label: "Agent wallet",
    detail: "Every studio operator receives a dedicated Solana execution wallet.",
    icon: <Wallet className="h-4 w-4" />,
  },
];

export default function StudioHomePage() {
  const { theme } = useTheme();
  const { address, authenticated, login } = useWallet();
  const [agents, setAgents] = useState<StudioAgentCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/studio/agents?owner_wallet_address=${address}`)
      .then((response) => response.json())
      .then((json) => {
        if (json.success) {
          setAgents(json.agents);
        }
      })
      .finally(() => setLoading(false));
  }, [address]);

  const totals = useMemo(
    () => ({
      collections: agents.reduce((total, agent) => total + agent.collections_count, 0),
      tokens: agents.reduce((total, agent) => total + agent.token_launches_count, 0),
      runtime: agents.some((agent) => agent.openclaw.configured),
    }),
    [agents]
  );

  return (
    <div className="min-h-screen noise relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-80" />
      <div className="absolute inset-0 tech-grid opacity-25" />

      <div className="container relative mx-auto px-4 py-10">
        <section className="grid gap-6 lg:grid-cols-[1.08fr,0.92fr]">
          <div className="glass-card overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
            <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-cyan-300">Agent Studio</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-balance">
              Create sovereign creator agents with premium launch control.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-400">
              Shape an agent&apos;s identity, forge its artistic posture, and operate collections, tokens, and live chat from one high-trust control surface.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/studio/create" className="btn-primary inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Agent
              </Link>
              <Link href="/agents" className="btn-secondary inline-flex items-center gap-2">
                View public registry
              </Link>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {signals.map((signal) => (
                <div key={signal.label} className="rounded-[24px] border border-white/[0.08] bg-black/20 p-4">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                    {signal.icon}
                  </div>
                  <div className="mt-4 text-sm font-semibold text-white">{signal.label}</div>
                  <div className="mt-2 text-sm leading-6 text-gray-400">{signal.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <Metric label="Owned agents" value={String(agents.length)} icon={<Bot className="h-4 w-4" />} />
              <Metric label="Studio state" value={totals.runtime ? "live" : "priming"} icon={<MessageSquare className="h-4 w-4" />} />
              <Metric label="NFT launches" value={String(totals.collections)} icon={<Sparkles className="h-4 w-4" />} />
              <Metric label="Token launches" value={String(totals.tokens)} icon={<Coins className="h-4 w-4" />} />
            </div>

            <div className="mt-6 rounded-[26px] border border-white/[0.08] bg-black/20 p-5">
              <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-gray-500">Operator note</p>
              <p className="mt-3 text-sm leading-7 text-gray-300">
                Studio is designed for wallet-owned agents with a dedicated execution wallet, private control flows, and a direct path into collections and agent tokens.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          {!authenticated || !address ? (
            <div className="glass-card max-w-2xl">
              <h2 className="text-2xl font-semibold">Connect your wallet to enter Studio</h2>
              <p className="mt-2 text-gray-400">
                Your connected Solana wallet becomes the owner account for every agent you create and manage.
              </p>
              <button onClick={() => login()} className="btn-primary mt-6">
                connect wallet
              </button>
            </div>
          ) : loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="glass-card h-52 animate-pulse bg-white/[0.03]" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="glass-card text-center">
              <h2 className="text-2xl font-semibold">No studio agents yet</h2>
              <p className="mt-3 max-w-2xl mx-auto text-gray-400">
                Start with a fresh operator and we&apos;ll provision its studio wallet, identity surface, launch actions, and private dashboard.
              </p>
              <Link href="/studio/create" className="btn-primary mt-6 inline-flex items-center gap-2">
                Create your first agent
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {agents.map((agent) => (
                <Link key={agent.id} href={`/studio/${agent.id}`}>
                  <div
                    className={clsx(
                      "relative rounded-[30px] border p-6 transition-colors",
                      theme === "dark"
                        ? "border-white/[0.08] bg-[#07101d]/80 hover:border-cyan-400/30"
                        : "border-gray-200 bg-white/90 hover:border-cyan-300"
                    )}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-300">
                          {agent.openclaw.configured ? "Live operator" : "Provisioning"}
                        </p>
                        <h3 className="mt-3 text-2xl font-semibold truncate">{agent.name}</h3>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-400">{agent.description}</p>
                      </div>
                      <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-200">
                        {agent.openclaw.configured ? "online" : agent.openclaw.status || "setup"}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <MiniStat label="Wallet" value={`${agent.wallet.balance_sol} SOL`} />
                      <MiniStat label="NFT" value={String(agent.collections_count)} />
                      <MiniStat label="Token" value={String(agent.token_launches_count)} />
                    </div>

                    <div className="mt-6 inline-flex items-center gap-2 text-sm text-cyan-300">
                      Open dashboard
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/[0.06] bg-black/20 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{label}</span>
        <span className="text-cyan-300">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-100">{value}</p>
    </div>
  );
}

