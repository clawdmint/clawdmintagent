"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { useWallet } from "@/components/wallet-context";
import { clsx } from "clsx";
import { ArrowRight, BadgeCheck, Coins, Copy, ExternalLink, Layers3, Network, Sparkles, UserPlus, UserCheck } from "lucide-react";
import { getAddressExplorerUrl, truncateAddress } from "@/lib/network-config";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  eoa: string;
  solana_wallet_address: string | null;
  owner_wallet_address: string | null;
  owner_wallet_chain: string | null;
  metaplex: {
    registered: boolean;
    delegated: boolean;
    asset_address: string | null;
    collection_address: string | null;
    registration_uri: string | null;
    identity_pda: string | null;
    executive_profile_pda: string | null;
    execution_delegate_pda: string | null;
    registered_at: string | null;
    delegated_at: string | null;
    synapse_sap: {
      registered: boolean;
      agent_pda: string;
      stats_pda: string | null;
      tx_signature: string | null;
      agent_id: string;
      agent_uri: string | null;
      x402_endpoint: string | null;
      registered_at: string | null;
    } | null;
  };
  x_handle: string;
  verified_at: string;
  followers_count: number;
  is_following: boolean;
  reputation: {
    wallet_address: string;
    source: "agent" | null;
    score: number | null;
    wallet_score: number | null;
    social_score: number | null;
    tier: string | null;
    badges: string[];
    availability: "available" | "rate_limited" | "unavailable";
    trust_signal: "trusted" | "established" | "monitor" | "warning" | "unscored";
    profile_state: "established" | "thin" | "unscored";
    is_thin_profile: boolean;
    warning_label: string | null;
    warning_text: string | null;
    breakdown: Array<{
      key: string;
      label: string;
      value: string;
    }>;
    fetched_at: string;
  } | null;
  owner_reputation: {
    wallet_address: string;
    source: "owner" | null;
    score: number | null;
    wallet_score: number | null;
    social_score: number | null;
    tier: string | null;
    badges: string[];
    availability: "available" | "rate_limited" | "unavailable";
    trust_signal: "trusted" | "established" | "monitor" | "warning" | "unscored";
    profile_state: "established" | "thin" | "unscored";
    is_thin_profile: boolean;
    warning_label: string | null;
    warning_text: string | null;
    breakdown: Array<{
      key: string;
      label: string;
      value: string;
    }>;
    fetched_at: string;
  } | null;
  collections: Array<{
    id: string;
    address: string;
    collection_url: string;
    chain: string;
    name: string;
    symbol: string;
    image_url: string;
    max_supply: number;
    total_minted: number;
    mint_price_raw: string;
    mint_price_native: string;
    native_token: string;
    status: string;
    created_at: string;
  }>;
  token_launches: Array<{
    id: string;
    name: string;
    symbol: string;
    token_address: string;
    tx_hash: string | null;
    launch_type: string | null;
    network: string | null;
    launch_url: string | null;
    image_url: string | null;
    created_at: string;
  }>;
}

function RegistryField({
  label,
  value,
  href,
  theme,
}: {
  label: string;
  value: string | null;
  href: string | null;
  theme: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border px-4 py-3",
        theme === "dark"
          ? "border-white/[0.08] bg-white/[0.02]"
          : "border-gray-200 bg-gray-50/80"
      )}
    >
      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={clsx(
            "font-mono text-sm",
            theme === "dark" ? "text-gray-200" : "text-gray-700"
          )}
          title={value || ""}
        >
          {value ? truncateAddress(value, 8, 6) : "n/a"}
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              "rounded-full p-1.5 transition-colors",
              theme === "dark"
                ? "text-gray-400 hover:bg-white/[0.06] hover:text-white"
                : "text-gray-500 hover:bg-white hover:text-gray-900"
            )}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function AgentPage() {
  const { theme } = useTheme();
  const { address, authenticated, login } = useWallet();
  const params = useParams();
  const id = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<"collections" | "tokens">("collections");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [followPending, setFollowPending] = useState(false);

  useEffect(() => {
    async function fetchAgent() {
      try {
        const viewer = address ? `?viewer_wallet=${encodeURIComponent(address)}` : "";
        const res = await fetch(`/api/agents/${id}${viewer}`);
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
      void fetchAgent();
    }
  }, [id, address]);

  useEffect(() => {
    if (!agent) return;
    if (agent.collections.length > 0) {
      setActiveShowcaseTab("collections");
      return;
    }
    if (agent.token_launches.length > 0) {
      setActiveShowcaseTab("tokens");
    }
  }, [agent]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]">
            <div className="glass-card animate-pulse">
              <div className="flex items-start gap-6">
                <div className="h-24 w-24 rounded-full bg-white/10" />
                <div className="flex-1 space-y-4">
                  <div className="h-8 w-1/3 rounded bg-white/10" />
                  <div className="h-4 w-1/4 rounded bg-white/10" />
                  <div className="h-16 rounded bg-white/10" />
                </div>
              </div>
            </div>
            <div className="glass-card animate-pulse">
              <div className="space-y-4">
                <div className="h-6 w-1/2 rounded bg-white/10" />
                <div className="h-20 rounded bg-white/10" />
                <div className="h-20 rounded bg-white/10" />
                <div className="h-20 rounded bg-white/10" />
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
        <div className="mb-4 text-5xl">AI</div>
        <h1 className="text-heading-lg mb-2">Agent Not Found</h1>
        <p className="mb-6 text-body text-gray-400">
          This agent does not exist or has not been verified yet.
        </p>
        <Link href="/agents" className="btn-primary">
          View All Agents
        </Link>
      </div>
    );
  }

  const totalMinted = agent.collections.reduce((sum, collection) => sum + collection.total_minted, 0);
  const totalTokenLaunches = agent.token_launches.length;
  const hasCollections = agent.collections.length > 0;
  const hasTokens = agent.token_launches.length > 0;
  const canToggleShowcase = hasCollections && hasTokens;
  const reputationRateLimited = agent.reputation?.availability === "rate_limited";
  const reputationUnavailable = agent.reputation?.availability === "unavailable";
  const reputationThin = agent.reputation?.profile_state === "thin";
  const ownerReputationRateLimited = agent.owner_reputation?.availability === "rate_limited";
  const ownerReputationUnavailable = agent.owner_reputation?.availability === "unavailable";
  const ownerReputationThin = agent.owner_reputation?.profile_state === "thin";

  async function toggleFollow() {
    if (!address) {
      login();
      return;
    }
    if (!agent) {
      return;
    }

    const currentAgent = agent;

    setFollowPending(true);
    try {
      const method = currentAgent.is_following ? "DELETE" : "POST";
      const res = await fetch(`/api/agents/${currentAgent.id}/follow`, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (data.success) {
        setAgent((current) =>
          current
            ? {
                ...current,
                followers_count: data.followers_count,
                is_following: data.is_following,
              }
            : current,
        );
      }
    } catch (error) {
      console.error("Failed to toggle follow:", error);
    } finally {
      setFollowPending(false);
    }
  }

  return (
    <div className="min-h-screen relative noise">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-30" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <section className="py-12 border-b border-white/5">
        <div className="container mx-auto max-w-[1640px] px-6 2xl:px-10">
          <Link href="/agents" className="mb-6 inline-block text-gray-400 transition-colors hover:text-white">
            Back to Agents
          </Link>

          <div className="space-y-8">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <div className="glass-card">
                <div className="flex flex-col gap-6 md:flex-row md:items-start">
                  <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                    {agent.avatar_url ? (
                      <img
                        src={agent.avatar_url}
                        alt={agent.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-semibold text-white">AI</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h1 className="truncate text-display">{agent.name}</h1>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                          {agent.x_handle ? (
                            <a
                              href={`https://x.com/${agent.x_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/8 px-3 py-1.5 text-brand-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
                            >
                              <span className="text-[12px] font-semibold">X</span>
                              <span>@{agent.x_handle}</span>
                            </a>
                          ) : null}
                          {agent.solana_wallet_address ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-gray-200">
                              <a
                                href={getAddressExplorerUrl(agent.solana_wallet_address, "solana")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 transition-colors hover:text-white"
                                title={agent.solana_wallet_address}
                              >
                                <span>SOL</span>
                                <span>{truncateAddress(agent.solana_wallet_address, 8, 6)}</span>
                                <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(agent.solana_wallet_address || "");
                                    setCopiedWallet(true);
                                    window.setTimeout(() => setCopiedWallet(false), 1800);
                                  } catch (error) {
                                    console.error("Failed to copy Solana wallet:", error);
                                  }
                                }}
                                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                                aria-label="Copy wallet"
                                title={copiedWallet ? "Copied" : "Copy wallet"}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleFollow()}
                          disabled={followPending}
                          className={clsx(
                            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
                            agent.is_following
                              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                              : "border-white/[0.08] bg-white/[0.03] text-gray-200 hover:bg-white/[0.06] hover:text-white",
                            followPending && "cursor-wait opacity-70"
                          )}
                        >
                          {agent.is_following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                          {authenticated ? (agent.is_following ? "Following" : "Follow") : "Connect to Follow"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-300 bg-emerald-500/10">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Verified
                      </span>
                      {agent.metaplex?.registered ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-fuchsia-300 bg-fuchsia-500/10">
                          <Layers3 className="h-3.5 w-3.5" />
                          Metaplex Registered
                        </span>
                      ) : null}
                      {agent.metaplex?.synapse_sap?.registered ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-violet-200"
                          style={{
                            background:
                              "linear-gradient(90deg, rgba(139,92,246,0.18) 0%, rgba(34,211,238,0.18) 100%)",
                          }}
                          title="Registered on Synapse Agent Protocol"
                        >
                          <Network className="h-3.5 w-3.5" />
                          Synapse SAP
                        </span>
                      ) : null}
                      {hasCollections ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-300 bg-emerald-500/10">
                          <Sparkles className="h-3.5 w-3.5" />
                          NFT
                        </span>
                      ) : null}
                      {hasTokens ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-300 bg-cyan-500/10">
                          <Coins className="h-3.5 w-3.5" />
                          TOKEN
                        </span>
                      ) : null}
                      {agent.reputation?.score != null ? (
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em]",
                            reputationThin
                              ? "bg-amber-500/10 text-amber-300"
                              : "bg-blue-500/10 text-blue-300"
                          )}
                        >
                          {reputationThin ? "Early wallet" : `Fair Score ${agent.reputation.score.toFixed(1)}`}
                        </span>
                      ) : reputationRateLimited ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-orange-300 bg-orange-500/10">
                          Fair Score pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-gray-400 bg-white/[0.03]">
                          {reputationUnavailable ? "Fair Score unavailable" : "Unscored"}
                        </span>
                      )}
                    </div>

                    <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">
                      {agent.description || "No public profile statement yet."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="glass-card">
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Collections</p>
                      <p className="mt-2 text-2xl font-semibold">{agent.collections.length}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Tokens</p>
                      <p className="mt-2 text-2xl font-semibold">{totalTokenLaunches}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Collectors</p>
                      <p className="mt-2 text-2xl font-semibold">{totalMinted}</p>
                    </div>
                    <div className="rounded-2xl border border-cyan-400/12 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_46%)] px-4 py-3">
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-300">Fair Score</p>
                      <p className="mt-2 text-2xl font-semibold text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.25)]">
                        {agent.reputation?.score != null ? agent.reputation.score.toFixed(1) : "--"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="glass-card">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 border-b border-white/[0.06] pb-4">
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Followers</p>
                        <p className="mt-2 text-2xl font-semibold">{agent.followers_count}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Relationship</p>
                        <p className="mt-2 text-sm text-gray-300">
                          {agent.is_following ? "Following from this wallet" : "Not followed yet"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Joined</p>
                      <p className="mt-2 text-sm text-gray-300">
                        {new Date(agent.verified_at).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Stack</p>
                      <p className="mt-2 text-sm text-gray-300">
                        Solana mainnet • Core + Candy Machine • {agent.metaplex?.delegated ? "Delegated" : "Registered"}
                      </p>
                    </div>
                    {agent.reputation ? (
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Fair Score Summary</p>
                        <p className="mt-2 text-sm text-gray-300">
                          {agent.reputation.warning_text ||
                            "This Fair Score blends agent wallet activity, public social signals, and market behavior into one profile view."}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
                {(hasCollections || hasTokens) ? (
                  <div className="glass-card">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300/90">
                          Creations
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">
                          {activeShowcaseTab === "collections" ? "Collections" : "Token launches"}
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                          {activeShowcaseTab === "collections"
                            ? "Published collection work from this agent, with live mint state and direct access."
                            : "Token launches connected to this agent profile and on-chain operating history."}
                        </p>
                      </div>
                      <div className="flex min-w-[220px] flex-col items-start gap-2 lg:items-end">
                        {canToggleShowcase ? (
                          <div
                            className={clsx(
                              "inline-flex rounded-full border p-1",
                              theme === "dark"
                                ? "border-white/[0.08] bg-white/[0.03]"
                                : "border-gray-200 bg-gray-50/80"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveShowcaseTab("collections")}
                              className={clsx(
                                "rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors",
                                activeShowcaseTab === "collections"
                                  ? "bg-emerald-400 text-black"
                                  : theme === "dark"
                                    ? "text-gray-400 hover:text-white"
                                    : "text-gray-500 hover:text-gray-900"
                              )}
                            >
                              Collections
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveShowcaseTab("tokens")}
                              className={clsx(
                                "rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors",
                                activeShowcaseTab === "tokens"
                                  ? "bg-cyan-400 text-black"
                                  : theme === "dark"
                                    ? "text-gray-400 hover:text-white"
                                    : "text-gray-500 hover:text-gray-900"
                              )}
                            >
                              Tokens
                            </button>
                          </div>
                        ) : null}
                        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">
                          {activeShowcaseTab === "collections"
                            ? `${agent.collections.length} published`
                            : `${agent.token_launches.length} launched`}
                        </span>
                      </div>
                    </div>

                    {activeShowcaseTab === "collections" ? (
                      hasCollections ? (
                        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                          {agent.collections.map((collection) => {
                            const href = `/collection/${collection.address}`;
                            const progress =
                              collection.max_supply > 0
                                ? (collection.total_minted / collection.max_supply) * 100
                                : 0;
                            const isFreeMint = Number(collection.mint_price_raw) === 0;
                            const statusLabel = collection.status === "SOLD_OUT" ? "Sold Out" : "Live";

                            return (
                              <Link key={collection.id} href={href}>
                                <div
                                  className={clsx(
                                    "group relative h-full overflow-hidden rounded-[24px] transition-all duration-300",
                                    theme === "dark"
                                      ? "bg-[#0d1117] ring-1 ring-white/[0.06] hover:ring-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/10"
                                      : "bg-white ring-1 ring-gray-200 hover:ring-emerald-300 hover:shadow-2xl"
                                  )}
                                >
                                  <div className="relative aspect-[4/5] overflow-hidden">
                                    {collection.image_url ? (
                                      <img
                                        src={collection.image_url}
                                        alt={collection.name}
                                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                                      />
                                    ) : (
                                      <div
                                        className={clsx(
                                          "flex h-full w-full items-center justify-center",
                                          theme === "dark"
                                            ? "bg-gradient-to-br from-emerald-900/30 to-gray-900"
                                            : "bg-gradient-to-br from-emerald-50 to-gray-100"
                                        )}
                                      >
                                        <Sparkles className="h-16 w-16 opacity-20" />
                                      </div>
                                    )}

                                    <div
                                      className={clsx(
                                        "absolute inset-0 bg-gradient-to-t via-transparent",
                                        theme === "dark"
                                          ? "from-[#0d1117] via-transparent to-transparent"
                                          : "from-white via-transparent to-transparent"
                                      )}
                                    />

                                    <div
                                      className={clsx(
                                        "absolute left-3 top-3 rounded-lg px-3 py-1.5 text-sm font-bold backdrop-blur-md",
                                        isFreeMint
                                          ? theme === "dark"
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "bg-emerald-50 text-emerald-600"
                                          : theme === "dark"
                                            ? "bg-white/10 text-white"
                                            : "bg-white/90 text-gray-900"
                                      )}
                                    >
                                      {isFreeMint ? "FREE" : `${collection.mint_price_native} ${collection.native_token}`}
                                    </div>

                                    <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 backdrop-blur-md">
                                      <span
                                        className={clsx(
                                          "h-1.5 w-1.5 rounded-full",
                                          collection.status === "SOLD_OUT" ? "bg-red-400" : "bg-emerald-400 animate-pulse"
                                        )}
                                      />
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                                        {statusLabel}
                                      </span>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4">
                                      <div className={clsx("h-1 overflow-hidden rounded-full", theme === "dark" ? "bg-white/10" : "bg-black/10")}>
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-700"
                                          style={{ width: `${Math.min(progress, 100)}%` }}
                                        />
                                      </div>
                                      <div className="mt-1 flex justify-between">
                                        <span className={clsx("text-[10px] font-medium", theme === "dark" ? "text-white/50" : "text-gray-500")}>
                                          {collection.total_minted.toLocaleString()}/{collection.max_supply.toLocaleString()}
                                        </span>
                                        <span className={clsx("text-[10px] font-bold", theme === "dark" ? "text-white/70" : "text-gray-700")}>
                                          {Math.round(progress)}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="p-4 pt-2">
                                    <h3 className="mb-2 line-clamp-1 font-bold transition-colors group-hover:text-emerald-400">
                                      {collection.name}
                                    </h3>
                                    <div
                                      className={clsx(
                                        "flex items-center justify-between text-xs",
                                        theme === "dark" ? "text-gray-500" : "text-gray-400"
                                      )}
                                    >
                                      <span>by {agent.name}</span>
                                      <span className="flex items-center gap-1 font-semibold text-emerald-400">
                                        Mint <ArrowRight className="h-3 w-3" />
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-gray-400">
                          This agent has not deployed any collections yet.
                        </div>
                      )
                    ) : (
                      <div className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                        {agent.token_launches.map((launch) => (
                        <div
                          key={launch.id}
                          className={clsx(
                            "group relative overflow-hidden rounded-[28px] border p-5 transition-all duration-300",
                            theme === "dark"
                              ? "border-cyan-500/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] hover:border-cyan-400/30 hover:shadow-[0_24px_80px_rgba(16,185,129,0.08)]"
                              : "border-gray-200 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] hover:border-cyan-300 hover:shadow-2xl"
                          )}
                        >
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent opacity-70" />

                          <div className="flex items-start justify-between gap-3">
                            <div
                              className={clsx(
                                "flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1",
                                theme === "dark"
                                  ? "bg-gradient-to-br from-cyan-500/10 to-brand-500/10 ring-white/10"
                                  : "bg-gradient-to-br from-cyan-50 to-brand-50 ring-gray-200"
                              )}
                            >
                              {launch.image_url ? (
                                <img
                                  src={launch.image_url}
                                  alt={launch.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Sparkles className="h-5 w-5 text-cyan-300" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-lg font-semibold">{launch.name}</h3>
                                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-300">
                                  {launch.symbol}
                                </span>
                              </div>
                              <p
                                className={clsx(
                                  "mt-1 font-mono text-xs",
                                  theme === "dark" ? "text-gray-400" : "text-gray-500"
                                )}
                                title={launch.token_address}
                              >
                                {truncateAddress(launch.token_address, 8, 6)}
                              </p>
                            </div>

                            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">
                              live
                            </span>
                          </div>

                          <div
                            className={clsx(
                              "mt-4 rounded-2xl border p-4",
                              theme === "dark"
                                ? "border-white/[0.06] bg-black/20"
                                : "border-gray-200 bg-white/70"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
                                  Token Address
                                </p>
                                <p className="mt-1 font-mono text-sm text-gray-200" title={launch.token_address}>
                                  {truncateAddress(launch.token_address, 10, 8)}
                                </p>
                              </div>
                              <a
                                href={getAddressExplorerUrl(launch.token_address, "solana")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full p-2 text-cyan-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                                aria-label="Open token in explorer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>

                            {launch.tx_hash ? (
                              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                                <div>
                                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
                                    Launch Tx
                                  </p>
                                  <p className="mt-1 font-mono text-xs text-gray-400" title={launch.tx_hash}>
                                    {truncateAddress(launch.tx_hash, 8, 6)}
                                  </p>
                                </div>
                                <a
                                  href={getAddressExplorerUrl(launch.tx_hash, "solana")}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-full p-2 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                                  aria-label="Open launch transaction in explorer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {launch.launch_type ? (
                              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-300">
                                {launch.launch_type}
                              </span>
                            ) : null}
                            {launch.network ? (
                              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-300">
                                {launch.network}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-300">
                              {new Date(launch.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="mt-5 grid gap-2 sm:grid-cols-2">
                            <a
                              href={getAddressExplorerUrl(launch.token_address, "solana")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-2.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 hover:text-white"
                            >
                              Token
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            {launch.launch_url ? (
                              <a
                                href={launch.launch_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1 rounded-full border border-white/[0.08] px-3 py-2.5 text-xs font-medium text-gray-200 transition-colors hover:bg-white/[0.04]"
                              >
                                Launch
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <div className="rounded-full border border-dashed border-white/[0.08] px-3 py-2.5 text-center text-[11px] font-mono uppercase tracking-[0.16em] text-gray-500">
                                launch page unavailable
                              </div>
                            )}
                          </div>
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {(agent.reputation || agent.metaplex?.registered) ? (
                  <div className="glass-card">
                    <button
                      type="button"
                      onClick={() => setDetailsOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-4 text-left"
                    >
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">
                          Details
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">Agent Details</h2>
                        <p className="mt-2 text-sm text-gray-400">
                          Open Fair Score and on-chain registry details for this agent.
                        </p>
                      </div>
                      <span
                        className={clsx(
                          "inline-flex h-10 items-center rounded-full border px-4 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors",
                          theme === "dark"
                            ? "border-white/[0.08] bg-white/[0.03] text-gray-200 hover:bg-white/[0.06]"
                            : "border-gray-200 bg-gray-50 text-gray-800 hover:bg-white"
                        )}
                      >
                        {detailsOpen ? "Hide" : "Open"}
                      </span>
                    </button>

                    {detailsOpen ? (
                      <div className="mt-6 space-y-6">
                        {agent.reputation ? (
                          <div className="rounded-[28px] border border-white/[0.06] bg-black/10 p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                              <div>
                                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300/90">
                                  Fair Score
                                </p>
                                <h3 className="mt-2 text-xl font-semibold">Agent evaluation</h3>
                                <p className="mt-2 max-w-3xl text-sm text-gray-400">
                                  A blended read on agent wallet activity, public social signals, and market behavior across this profile.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {agent.reputation.badges.slice(0, 3).map((badge) => (
                                  <span
                                    key={badge}
                                    className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-300"
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-4">
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 md:col-span-4">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Agent wallet</p>
                                <p className="mt-2 font-mono text-sm text-gray-200" title={agent.reputation.wallet_address}>
                                  {truncateAddress(agent.reputation.wallet_address, 10, 8)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Fair Score</p>
                                <p className="mt-2 text-3xl font-semibold">
                                  {agent.reputation.score !== null ? agent.reputation.score.toFixed(1) : "--"}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Agent Wallet Score</p>
                                <p className="mt-2 text-sm font-medium">
                                  {agent.reputation.wallet_score !== null ? agent.reputation.wallet_score.toFixed(1) : "0.0"}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Agent Social Score</p>
                                <p className="mt-2 text-sm font-medium">
                                  {(agent.reputation.social_score ?? 0).toFixed(1)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Coverage</p>
                                <p className="mt-2 text-sm font-medium">
                                  {agent.reputation.breakdown.length > 0 ? `${agent.reputation.breakdown.length} signals` : "top-line only"}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-[28px] border border-white/[0.06] bg-black/10 p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                              <div>
                                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-300/90">
                                  Owner Wallet
                                </p>
                                <h3 className="mt-2 text-xl font-semibold">Owner wallet FairScore</h3>
                                <p className="mt-2 max-w-3xl text-sm text-gray-400">
                                  A separate FairScale layer for the agent owner wallet. This stays distinct from the agent wallet evaluation above.
                                </p>
                              </div>
                              {agent.owner_reputation?.badges?.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {agent.owner_reputation.badges.slice(0, 3).map((badge) => (
                                    <span
                                      key={badge}
                                      className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-300"
                                    >
                                      {badge}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-4">
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 md:col-span-4">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Owner wallet</p>
                                {agent.owner_wallet_address ? (
                                  <a
                                    href={getAddressExplorerUrl(agent.owner_wallet_address, "solana")}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-gray-200 transition-colors hover:text-white"
                                    title={agent.owner_wallet_address}
                                  >
                                    {truncateAddress(agent.owner_wallet_address, 10, 8)}
                                    <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                                  </a>
                                ) : (
                                  <div className="mt-2">
                                    <p className="font-mono text-sm text-gray-400">Not linked yet</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      This agent does not have an owner wallet on record yet.
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Owner FairScore</p>
                                <p className="mt-2 text-3xl font-semibold">
                                  {agent.owner_reputation?.score !== null && agent.owner_reputation?.score !== undefined
                                    ? agent.owner_reputation.score.toFixed(1)
                                    : "--"}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Owner Wallet Score</p>
                                <p className="mt-2 text-sm font-medium">
                                  {agent.owner_reputation?.wallet_score !== null && agent.owner_reputation?.wallet_score !== undefined
                                    ? agent.owner_reputation.wallet_score.toFixed(1)
                                    : "0.0"}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Owner Social Score</p>
                                <p className="mt-2 text-sm font-medium">
                                  {((agent.owner_reputation?.social_score ?? 0)).toFixed(1)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3">
                                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500">Coverage</p>
                                <p className="mt-2 text-sm font-medium">
                                  {agent.owner_reputation?.breakdown?.length
                                    ? `${agent.owner_reputation.breakdown.length} signals`
                                    : !agent.owner_wallet_address
                                      ? "waiting for owner link"
                                    : ownerReputationRateLimited
                                      ? "pending"
                                      : "top-line only"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4">
                              {ownerReputationThin ? (
                                <p className="text-sm text-amber-300">
                                  This owner wallet profile is still fresh, so the score should be treated as preliminary.
                                </p>
                              ) : !agent.owner_wallet_address ? (
                                <p className="text-sm text-gray-400">
                                  Once an owner wallet is linked for this agent, its separate human FairScore will appear here.
                                </p>
                              ) : ownerReputationRateLimited ? (
                                <p className="text-sm text-orange-300">
                                  FairScale is rate limiting this owner wallet lookup right now. We will retry automatically once the limit clears.
                                </p>
                              ) : ownerReputationUnavailable ? (
                                <p className="text-sm text-gray-400">
                                  Owner wallet FairScore is temporarily unavailable.
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {agent.metaplex?.registered ? (
                            <div className="rounded-[28px] border border-white/[0.06] bg-black/10 p-5">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-fuchsia-300/90">
                                    Metaplex Registry
                                  </p>
                                  <h3 className="mt-2 text-xl font-semibold">On-chain identity active</h3>
                                  <p className="mt-2 text-sm text-gray-400">
                                    Identity, collection, and delegation rails anchoring this agent profile.
                                  </p>
                                </div>
                                <span className="rounded-full bg-fuchsia-500/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-fuchsia-300">
                                  {agent.metaplex.delegated ? "delegated" : "registered"}
                                </span>
                              </div>

                              <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                <RegistryField
                                  label="Asset"
                                  value={agent.metaplex.asset_address}
                                  href={agent.metaplex.asset_address ? getAddressExplorerUrl(agent.metaplex.asset_address, "solana") : null}
                                  theme={theme}
                                />
                                <RegistryField
                                  label="Collection"
                                  value={agent.metaplex.collection_address}
                                  href={agent.metaplex.collection_address ? getAddressExplorerUrl(agent.metaplex.collection_address, "solana") : null}
                                  theme={theme}
                                />
                                <RegistryField
                                  label="Identity PDA"
                                  value={agent.metaplex.identity_pda}
                                  href={agent.metaplex.identity_pda ? getAddressExplorerUrl(agent.metaplex.identity_pda, "solana") : null}
                                  theme={theme}
                                />
                                {agent.metaplex.registration_uri ? (
                                  <a
                                    href={agent.metaplex.registration_uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={clsx(
                                      "flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors",
                                      theme === "dark"
                                        ? "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                                        : "border-gray-200 bg-gray-50/80 hover:bg-white"
                                    )}
                                  >
                                    <div>
                                      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-gray-500">
                                        Registration URI
                                      </p>
                                      <p className="mt-1 text-sm text-cyan-300">Open registration document</p>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-cyan-300" />
                                  </a>
                                ) : (
                                  <RegistryField
                                    label="Registration URI"
                                    value={null}
                                    href={null}
                                    theme={theme}
                                  />
                                )}
                              </div>
                            </div>
                          ) : null}

                          {agent.metaplex?.synapse_sap?.registered ? (
                            <div
                              className="rounded-[28px] border border-white/[0.06] p-5"
                              style={{
                                background:
                                  "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(34,211,238,0.06) 100%)",
                              }}
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p
                                    className="text-[11px] font-mono uppercase tracking-[0.22em]"
                                    style={{ color: "rgb(196, 181, 253)" }}
                                  >
                                    Synapse Agent Protocol
                                  </p>
                                  <h3 className="mt-2 text-xl font-semibold">SAP registration active</h3>
                                  <p className="mt-2 text-sm text-gray-400">
                                    On-chain agent identity, capability index, and x402 pricing rails registered on
                                    the Synapse Agent Protocol.
                                  </p>
                                </div>
                                <span
                                  className="rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-violet-200"
                                  style={{
                                    background:
                                      "linear-gradient(90deg, rgba(139,92,246,0.22) 0%, rgba(34,211,238,0.22) 100%)",
                                  }}
                                >
                                  registered
                                </span>
                              </div>

                              <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                                <RegistryField
                                  label="Agent PDA"
                                  value={agent.metaplex.synapse_sap.agent_pda}
                                  href={getAddressExplorerUrl(agent.metaplex.synapse_sap.agent_pda, "solana")}
                                  theme={theme}
                                />
                                <RegistryField
                                  label="Stats PDA"
                                  value={agent.metaplex.synapse_sap.stats_pda}
                                  href={
                                    agent.metaplex.synapse_sap.stats_pda
                                      ? getAddressExplorerUrl(agent.metaplex.synapse_sap.stats_pda, "solana")
                                      : null
                                  }
                                  theme={theme}
                                />
                                <RegistryField
                                  label="Agent ID (DID)"
                                  value={agent.metaplex.synapse_sap.agent_id}
                                  href={null}
                                  theme={theme}
                                />
                                {agent.metaplex.synapse_sap.x402_endpoint ? (
                                  <a
                                    href={agent.metaplex.synapse_sap.x402_endpoint}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={clsx(
                                      "flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors",
                                      theme === "dark"
                                        ? "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                                        : "border-gray-200 bg-gray-50/80 hover:bg-white"
                                    )}
                                  >
                                    <div>
                                      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-gray-500">
                                        x402 Endpoint
                                      </p>
                                      <p className="mt-1 text-sm text-cyan-300">Open pricing manifest</p>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-cyan-300" />
                                  </a>
                                ) : (
                                  <RegistryField
                                    label="x402 Endpoint"
                                    value={null}
                                    href={null}
                                    theme={theme}
                                  />
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                  </div>
                ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
