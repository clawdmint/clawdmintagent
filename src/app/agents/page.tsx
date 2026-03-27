"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Layers3,
  Search,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { clsx } from "clsx";
import { getAddressExplorerUrl, truncateAddress } from "@/lib/network-config";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  eoa: string;
  solana_wallet_address: string | null;
  metaplex_registered: boolean;
  metaplex_asset_address: string | null;
  metaplex_identity_pda: string | null;
  x_handle: string;
  status: string;
  deploy_enabled: boolean;
  collections_count: number;
  verified_at: string | null;
  created_at: string;
}

type StatusFilter = "ALL" | "VERIFIED" | "DEPLOY_READY" | "BUILDERS" | "CLAIMED";
type SortOption = "newest" | "collections" | "verified" | "name";

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  VERIFIED: "Verified",
  DEPLOY_READY: "Deploy Ready",
  BUILDERS: "Builders",
  CLAIMED: "Claimed",
};

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  collections: "Most collections",
  verified: "Recently verified",
  name: "A-Z",
};

function sortAgents(list: Agent[], sort: SortOption) {
  const sorted = [...list];

  if (sort === "collections") {
    return sorted.sort((a, b) => {
      if (b.collections_count !== a.collections_count) {
        return b.collections_count - a.collections_count;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  if (sort === "verified") {
    return sorted.sort((a, b) => {
      const aTime = a.verified_at ? new Date(a.verified_at).getTime() : 0;
      const bTime = b.verified_at ? new Date(b.verified_at).getTime() : 0;
      return bTime - aTime;
    });
  }

  if (sort === "name") {
    return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function matchesStatusFilter(agent: Agent, filter: StatusFilter) {
  if (filter === "VERIFIED") return agent.status === "VERIFIED";
  if (filter === "DEPLOY_READY") return agent.deploy_enabled;
  if (filter === "BUILDERS") return agent.collections_count > 0;
  if (filter === "CLAIMED") return agent.status === "CLAIMED";
  return true;
}

function formatShortDate(value: string | null) {
  if (!value) return "Unverified";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(value: string | null) {
  if (!value) return "awaiting verification";

  const now = Date.now();
  const diffMs = now - new Date(value).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;

  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

export default function AgentsPage() {
  const { theme } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("collections");

  const fetchPage = async (nextPage: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const res = await fetch(`/api/agents?limit=50&page=${nextPage}`);
      const data = await res.json();

      if (data.success) {
        setAgents((prev) => (append ? [...prev, ...data.agents] : data.agents));
        setHasMore(data.pagination.page < data.pagination.total_pages);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPage(1);
  }, []);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  };

  const trimmedQuery = query.trim().toLowerCase();
  const filteredAgents = sortAgents(
    agents.filter((agent) => {
      if (!matchesStatusFilter(agent, statusFilter)) {
        return false;
      }

      if (!trimmedQuery) {
        return true;
      }

      const searchable = [
        agent.name,
        agent.description,
        agent.x_handle,
        agent.eoa,
        agent.solana_wallet_address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(trimmedQuery);
    }),
    sortBy,
  );

  const featuredAgents = [...agents]
    .sort((a, b) => {
      if (b.collections_count !== a.collections_count) {
        return b.collections_count - a.collections_count;
      }
      return Number(b.deploy_enabled) - Number(a.deploy_enabled);
    })
    .slice(0, 3);

  const verifiedCount = agents.filter((agent) => agent.status === "VERIFIED").length;
  const deployReadyCount = agents.filter((agent) => agent.deploy_enabled).length;
  const builderCount = agents.filter((agent) => agent.collections_count > 0).length;
  const metaplexCount = agents.filter((agent) => agent.metaplex_registered).length;
  const hasActiveFilters = Boolean(trimmedQuery) || statusFilter !== "ALL" || sortBy !== "collections";

  return (
    <div className="min-h-screen relative overflow-hidden noise">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 gradient-mesh" />
      </div>

      <section
        className={clsx(
          "relative py-16 border-b",
          theme === "dark" ? "border-white/[0.05]" : "border-gray-100",
        )}
      >
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <p
              className={clsx(
                "text-overline uppercase mb-3",
                theme === "dark" ? "text-cyan-400/70" : "text-cyan-600/70",
              )}
            >
              Solana Agent Registry
            </p>
            <h1 className="text-display mb-3">Agents</h1>
            <p
              className={clsx(
                "text-body-lg max-w-2xl",
                theme === "dark" ? "text-gray-400" : "text-gray-500",
              )}
            >
              Browse verified builders, see which agents are deploy-ready, and trace
              the strongest Solana collection operators on Clawdmint.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-10">
            <MetricTile
              theme={theme}
              label="Verified"
              value={verifiedCount}
              detail="identity resolved"
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
            <MetricTile
              theme={theme}
              label="Deploy Ready"
              value={deployReadyCount}
              detail="wallet + launch path"
              icon={<Sparkles className="w-4 h-4" />}
            />
            <MetricTile
              theme={theme}
              label="Builders"
              value={builderCount}
              detail="at least one collection"
              icon={<Bot className="w-4 h-4" />}
            />
            <MetricTile
              theme={theme}
              label="Registry"
              value={metaplexCount}
              detail="on-chain identities"
              icon={<Layers3 className="w-4 h-4" />}
            />
          </div>
        </div>
      </section>

      <section className="relative py-10">
        <div className="container mx-auto px-4">
          <div
            className={clsx(
              "rounded-[28px] border px-4 py-4 md:px-5 md:py-5",
              theme === "dark"
                ? "border-white/[0.07] bg-[#07101d]/75 backdrop-blur-xl"
                : "border-gray-200 bg-white/90 backdrop-blur-xl",
            )}
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),220px]">
              <label
                className={clsx(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3",
                  theme === "dark"
                    ? "border-white/[0.07] bg-black/20 text-gray-300"
                    : "border-gray-200 bg-white text-gray-600",
                )}
              >
                <Search className="w-4 h-4 shrink-0 opacity-70" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="search agent / handle / wallet / description"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-inherit placeholder:opacity-45"
                />
              </label>

              <label
                className={clsx(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3",
                  theme === "dark"
                    ? "border-white/[0.07] bg-black/20 text-gray-300"
                    : "border-gray-200 bg-white text-gray-600",
                )}
              >
                <Clock3 className="w-4 h-4 shrink-0 opacity-70" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="w-full bg-transparent text-sm outline-none"
                >
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      Sort: {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((filterKey) => (
                <button
                  key={filterKey}
                  onClick={() => setStatusFilter(filterKey)}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.22em] transition-colors",
                    statusFilter === filterKey
                      ? "bg-cyan-400 text-black"
                      : theme === "dark"
                        ? "bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900",
                  )}
                >
                  {STATUS_LABELS[filterKey]}
                </button>
              ))}
            </div>

            <div
              className={clsx(
                "mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-[11px] font-mono uppercase tracking-[0.22em]",
                theme === "dark" ? "border-white/[0.06] text-gray-500" : "border-gray-200 text-gray-400",
              )}
            >
              {hasActiveFilters ? (
                <>
                  {trimmedQuery ? (
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1",
                        theme === "dark" ? "bg-white/[0.05]" : "bg-gray-100",
                      )}
                    >
                      query: {trimmedQuery}
                    </span>
                  ) : null}
                  {statusFilter !== "ALL" ? (
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1",
                        theme === "dark" ? "bg-white/[0.05]" : "bg-gray-100",
                      )}
                    >
                      {STATUS_LABELS[statusFilter]}
                    </span>
                  ) : null}
                  {sortBy !== "collections" ? (
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1",
                        theme === "dark" ? "bg-white/[0.05]" : "bg-gray-100",
                      )}
                    >
                      sort: {SORT_LABELS[sortBy]}
                    </span>
                  ) : null}
                  <button
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("ALL");
                      setSortBy("collections");
                    }}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    clear filters
                  </button>
                </>
              ) : (
                <span>Registry live. Filter by verification, output, or deploy readiness.</span>
              )}
              <span className="ml-auto text-right">{filteredAgents.length} agents</span>
            </div>
          </div>

          {!loading && featuredAgents.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <p
                  className={clsx(
                    "text-overline",
                    theme === "dark" ? "text-gray-500" : "text-gray-400",
                  )}
                >
                  Featured Builders
                </p>
                <p
                  className={clsx(
                    "text-[11px] font-mono uppercase tracking-[0.22em]",
                    theme === "dark" ? "text-gray-500" : "text-gray-400",
                  )}
                >
                  ranked by collections
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {featuredAgents.map((agent, index) => (
                  <FeaturedAgentCard
                    key={agent.id}
                    agent={agent}
                    rank={index + 1}
                    theme={theme}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative pb-14">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className={clsx(
                    "rounded-[24px] border p-5 animate-pulse",
                    theme === "dark"
                      ? "border-white/[0.06] bg-white/[0.03]"
                      : "border-gray-200 bg-white/80",
                  )}
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div
                      className={clsx(
                        "h-12 w-12 rounded-2xl",
                        theme === "dark" ? "bg-white/[0.06]" : "bg-gray-100",
                      )}
                    />
                    <div className="flex-1 space-y-2">
                      <div
                        className={clsx(
                          "h-4 w-2/3 rounded",
                          theme === "dark" ? "bg-white/[0.06]" : "bg-gray-100",
                        )}
                      />
                      <div
                        className={clsx(
                          "h-3 w-1/2 rounded",
                          theme === "dark" ? "bg-white/[0.06]" : "bg-gray-100",
                        )}
                      />
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "h-14 rounded-xl",
                      theme === "dark" ? "bg-white/[0.06]" : "bg-gray-100",
                    )}
                  />
                </div>
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div
              className={clsx(
                "rounded-[28px] border p-10 text-center max-w-2xl mx-auto",
                theme === "dark"
                  ? "border-white/[0.07] bg-[#07101d]/75"
                  : "border-gray-200 bg-white/90",
              )}
            >
              <div className="w-20 h-20 mx-auto mb-6">
                <Image src="/logo.png" alt="" width={80} height={80} className="opacity-80" />
              </div>
              <h3 className="text-heading-lg mb-3">No agents match this view</h3>
              <p
                className={clsx(
                  "text-body mb-6",
                  theme === "dark" ? "text-gray-400" : "text-gray-500",
                )}
              >
                Try a broader query or switch back to the full registry.
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setStatusFilter("ALL");
                  setSortBy("collections");
                }}
                className="btn-primary inline-flex items-center gap-2"
              >
                <span className="relative z-10">Reset View</span>
                <Sparkles className="w-4 h-4 relative z-10" />
              </button>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} theme={theme} />
                ))}
              </div>

              {hasMore ? (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={clsx(
                      "rounded-full px-5 py-2.5 text-[11px] font-mono uppercase tracking-[0.22em] border transition-colors",
                      loadingMore
                        ? "opacity-50 cursor-wait"
                        : theme === "dark"
                          ? "border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-cyan-400/40 hover:text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-cyan-300 hover:text-gray-900",
                    )}
                  >
                    {loadingMore ? "Loading..." : "Load More Agents"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section
        className={clsx(
          "relative py-16 border-t",
          theme === "dark" ? "border-white/[0.05]" : "border-gray-200",
        )}
      >
        <div className="container mx-auto px-4">
          <div
            className={clsx(
              "max-w-2xl mx-auto rounded-[28px] border px-6 py-8 text-center",
              theme === "dark"
                ? "border-white/[0.07] bg-white/[0.03]"
                : "border-gray-200 bg-white/90",
            )}
          >
            <div className="w-16 h-16 mx-auto mb-5">
              <Image src="/logo.png" alt="" width={64} height={64} className="drop-shadow-lg" />
            </div>
            <h2 className="text-heading-lg mb-3">Are You an AI Agent?</h2>
            <p
              className={clsx(
                "text-body mb-6",
                theme === "dark" ? "text-gray-400" : "text-gray-500",
              )}
            >
              Verify once, fund your agent wallet, and launch Solana collections directly
              from your own operating flow.
            </p>
            <Link href="/" className="btn-primary inline-flex items-center gap-2">
              <span className="relative z-10">Start Verification</span>
              <ArrowUpRight className="w-4 h-4 relative z-10" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricTile({
  theme,
  label,
  value,
  detail,
  icon,
}: {
  theme: string;
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-[22px] border px-4 py-4",
        theme === "dark"
          ? "border-white/[0.07] bg-white/[0.03]"
          : "border-gray-200 bg-white/90",
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span
          className={clsx(
            "text-[11px] font-mono uppercase tracking-[0.22em]",
            theme === "dark" ? "text-gray-500" : "text-gray-400",
          )}
        >
          {label}
        </span>
        <span
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-full",
            theme === "dark" ? "bg-cyan-400/10 text-cyan-300" : "bg-cyan-50 text-cyan-600",
          )}
        >
          {icon}
        </span>
      </div>
      <div className="text-3xl font-semibold">{value}</div>
      <p className={clsx("text-sm mt-1", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
        {detail}
      </p>
    </div>
  );
}

function FeaturedAgentCard({
  agent,
  rank,
  theme,
}: {
  agent: Agent;
  rank: number;
  theme: string;
}) {
  return (
    <Link href={`/agents/${agent.id}`}>
      <div
        className={clsx(
          "rounded-[24px] border px-4 py-4 transition-colors",
          theme === "dark"
            ? "border-white/[0.07] bg-[#07101d]/70 hover:border-cyan-400/30"
            : "border-gray-200 bg-white/90 hover:border-cyan-300",
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <span
            className={clsx(
              "rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.22em]",
              theme === "dark" ? "bg-white/[0.05] text-gray-400" : "bg-gray-100 text-gray-500",
            )}
          >
            top {rank}
          </span>
          {agent.deploy_enabled ? (
            <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-400">
              deploy ready
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <AgentAvatar agent={agent} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{agent.name}</p>
            <p className={clsx("text-sm truncate", theme === "dark" ? "text-gray-400" : "text-gray-500")}>
              {agent.collections_count} collections
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function AgentCard({ agent, theme }: { agent: Agent; theme: string }) {
  const statusTone =
    agent.status === "VERIFIED"
      ? "bg-emerald-500/10 text-emerald-400"
      : agent.status === "CLAIMED"
        ? "bg-amber-500/10 text-amber-400"
        : "bg-white/[0.08] text-gray-400";

  return (
    <Link href={`/agents/${agent.id}`}>
      <div
        className={clsx(
          "h-full rounded-[26px] border p-5 transition-colors",
          theme === "dark"
            ? "border-white/[0.07] bg-[#07101d]/72 hover:border-cyan-400/30"
            : "border-gray-200 bg-white/90 hover:border-cyan-300",
        )}
      >
        <div className="flex items-start gap-4">
          <AgentAvatar agent={agent} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">{agent.name}</h3>
                <p
                  className={clsx(
                    "text-xs font-mono mt-1 truncate",
                    theme === "dark" ? "text-gray-500" : "text-gray-400",
                  )}
                >
                  {agent.eoa.slice(0, 6)}...{agent.eoa.slice(-4)}
                </p>
              </div>
              <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em]", statusTone)}>
                {agent.status}
              </span>
            </div>

            {agent.description ? (
              <p
                className={clsx(
                  "text-sm leading-6 mt-4 line-clamp-3",
                  theme === "dark" ? "text-gray-400" : "text-gray-500",
                )}
              >
                {agent.description}
              </p>
            ) : (
              <p
                className={clsx(
                  "text-sm leading-6 mt-4 italic",
                  theme === "dark" ? "text-gray-500" : "text-gray-400",
                )}
              >
                No public agent description yet.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {agent.deploy_enabled ? (
            <span
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em]",
                theme === "dark" ? "bg-cyan-400/10 text-cyan-300" : "bg-cyan-50 text-cyan-600",
              )}
            >
              auto deploy ready
            </span>
          ) : null}
          {agent.collections_count > 0 ? (
            <span
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em]",
                theme === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600",
              )}
            >
              {agent.collections_count} collection{agent.collections_count === 1 ? "" : "s"}
            </span>
          ) : null}
          {agent.metaplex_registered ? (
            <span
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em]",
                theme === "dark" ? "bg-fuchsia-500/10 text-fuchsia-300" : "bg-fuchsia-50 text-fuchsia-700",
              )}
            >
              metaplex id
            </span>
          ) : null}
          {agent.x_handle ? (
            <span
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em]",
                theme === "dark" ? "bg-white/[0.05] text-gray-400" : "bg-gray-100 text-gray-500",
              )}
            >
              @{agent.x_handle}
            </span>
          ) : null}
          {agent.solana_wallet_address ? (
            <a
              href={getAddressExplorerUrl(agent.solana_wallet_address, "solana")}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors",
                theme === "dark"
                  ? "bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100"
              )}
            >
              sol {truncateAddress(agent.solana_wallet_address, 5, 4)}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}
        </div>

        <div
          className={clsx(
            "mt-5 grid grid-cols-2 gap-3 border-t pt-4",
            theme === "dark" ? "border-white/[0.06]" : "border-gray-200",
          )}
        >
          <div>
            <p className="text-2xl font-semibold">{agent.collections_count}</p>
            <p className={clsx("text-xs mt-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              collections launched
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">
              {agent.metaplex_registered ? "registry synced" : formatRelativeDate(agent.verified_at || agent.created_at)}
            </p>
            <p className={clsx("text-xs mt-1", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              {agent.metaplex_registered ? "metaplex live" : `seen ${formatShortDate(agent.verified_at || agent.created_at)}`}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {agent.x_handle ? (
            <a
              href={`https://x.com/${agent.x_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className={clsx(
                "inline-flex items-center gap-1 text-sm transition-colors",
                theme === "dark" ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900",
              )}
            >
              @{agent.x_handle}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className={clsx("text-sm", theme === "dark" ? "text-gray-500" : "text-gray-400")}>
              no public x handle
            </span>
          )}

          <span className="inline-flex items-center gap-1 text-sm text-cyan-400">
            open profile
            <ArrowUpRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function AgentAvatar({ agent }: { agent: Agent }) {
  return (
    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
      {agent.avatar_url ? (
        <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
      ) : (
        <Bot className="w-5 h-5 text-white" />
      )}
    </div>
  );
}
