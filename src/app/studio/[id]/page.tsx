"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  Layers3,
  MessageSquare,
  Palette,
  Rocket,
  Send,
  Shield,
  Sparkles,
  Wallet,
  Wrench,
  Orbit,
  ScrollText,
  Activity,
} from "lucide-react";
import { clsx } from "clsx";
import { useWallet } from "@/components/wallet-context";

type StudioTab = "overview" | "chat" | "skills" | "runs";

export default function StudioAgentDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { address, authenticated, login } = useWallet();
  const [tab, setTab] = useState<StudioTab>((searchParams.get("tab") as StudioTab) || "overview");
  const [agent, setAgent] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [collectionForm, setCollectionForm] = useState({
    name: "",
    symbol: "",
    description: "",
    image: "",
    max_supply: 100,
    mint_price_sol: "0.1",
    payout_address: address || "",
    royalty_bps: 500,
  });
  const [tokenForm, setTokenForm] = useState({
    name: "",
    symbol: "",
    description: "",
    image: "",
    website_url: "",
  });

  const fetchAgent = async () => {
    if (!address || !params.id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/agents/${params.id}?owner_wallet_address=${address}`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to load studio agent");
      }
      setAgent(json.agent);
      setSessionId((current) => current || json.agent.sessions?.[0]?.id || "");
      setCollectionForm((current) => ({ ...current, payout_address: json.agent.wallet.address }));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Failed to load studio agent");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAgent();
  }, [address, params.id]);

  const activeSession = useMemo(
    () => agent?.sessions?.find((session: any) => session.id === sessionId) || agent?.sessions?.[0],
    [agent, sessionId]
  );

  const soul = agent?.soul_profile || {};
  const liveSignal = agent?.openclaw?.configured ? "Live operator" : "Provisioning";
  const walletSignal = `${agent?.wallet?.balance_sol || "0"} SOL`;
  const guardrailCount = Array.isArray(soul.boundaries) ? soul.boundaries.length : 0;

  const handleCreateSession = async () => {
    if (!address) return;
    const response = await fetch(`/api/studio/agents/${params.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_wallet_address: address, title: `Session ${new Date().toLocaleTimeString()}` }),
    });
    const json = await response.json();
    if (json.success) {
      await fetchAgent();
      setSessionId(json.session.id);
      setTab("chat");
    }
  };

  const handleSendChat = async () => {
    if (!address || !activeSession || !chatInput.trim()) return;
    setChatLoading(true);
    try {
      const response = await fetch(`/api/studio/agents/${params.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_wallet_address: address, session_id: activeSession.id, content: chatInput }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to send message");
      }
      setChatInput("");
      await fetchAgent();
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to send message");
    } finally {
      setChatLoading(false);
    }
  };

  const runAction = async (action: "sync-metaplex" | "launch-collection" | "launch-token", payload: Record<string, unknown>) => {
    if (!address) return;
    setActionLoading(action);
    setError(null);
    try {
      const response = await fetch(`/api/studio/agents/${params.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_wallet_address: address, action, payload }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to run action");
      }
      await fetchAgent();
      setTab("runs");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to run action");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSkill = async (skillKey: string, enabled: boolean) => {
    if (!address) return;
    const response = await fetch(`/api/studio/agents/${params.id}/skills`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_wallet_address: address, skill_key: skillKey, enabled }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setError(json.error || "Failed to update skill");
      return;
    }
    await fetchAgent();
  };

  if (!authenticated || !address) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="glass-card max-w-2xl">
          <h1 className="text-3xl font-semibold">Connect your wallet</h1>
          <p className="mt-3 text-gray-400">Studio dashboards are wallet-owned. Connect the owner wallet to continue.</p>
          <button onClick={() => login()} className="btn-primary mt-6">connect wallet</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-16"><div className="glass-card h-96 animate-pulse" /></div>;
  }

  if (error && !agent) {
    return <div className="container mx-auto px-4 py-16"><div className="glass-card text-red-200">{error}</div></div>;
  }

  return (
    <div className="min-h-screen noise relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-80" />
      <div className="absolute inset-0 tech-grid opacity-30" />

      <div className="container relative mx-auto px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to Studio
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigator.clipboard.writeText(agent.wallet.address)} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm">
              <Copy className="h-4 w-4" />
              Copy Wallet
            </button>
            <button onClick={() => setTab("chat")} className="btn-primary inline-flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Open Chat
            </button>
          </div>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
          <div className="glass-card overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
            <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
              <div className="rounded-[32px] border border-white/[0.08] bg-black/30 p-4">
                {agent.avatar_url ? (
                  <img src={agent.avatar_url} alt={agent.name} className="h-full w-full rounded-[24px] object-cover" />
                ) : (
                  <div className="flex h-[260px] items-center justify-center rounded-[24px] border border-dashed border-white/[0.08] text-sm text-gray-500">No portrait</div>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em]">{agent.name}</h1>
                  <Badge tone={agent.openclaw.configured ? "emerald" : "amber"}>{liveSignal}</Badge>
                  {agent.metaplex?.registered ? <Badge tone="fuchsia">On-chain identity</Badge> : null}
                  {agent.collections.length ? <Badge tone="cyan">NFT</Badge> : null}
                  {agent.token_launches.length ? <Badge tone="amber">TOKEN</Badge> : null}
                </div>
                <p className="mt-4 max-w-2xl text-gray-400 leading-7">{agent.description}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {soul.archetype ? <Badge tone="cyan">{soul.archetype}</Badge> : null}
                  {soul.tone ? <Badge tone="emerald">{soul.tone}</Badge> : null}
                  {agent.skills.length ? <Badge tone="amber">{agent.skills.length} skills</Badge> : null}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                  <MetricCard label="Agent Wallet" value={walletSignal} icon={<Wallet className="h-4 w-4" />} />
                  <MetricCard label="Collections" value={String(agent.collections.length)} icon={<Sparkles className="h-4 w-4" />} />
                  <MetricCard label="Tokens" value={String(agent.token_launches.length)} icon={<Coins className="h-4 w-4" />} />
                  <MetricCard label="Guardrails" value={String(guardrailCount)} icon={<Shield className="h-4 w-4" />} />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300">Artist soul</p>
            <h2 className="mt-3 text-2xl font-semibold">Creative posture</h2>
            <p className="mt-3 text-sm leading-7 text-gray-400">
              This profile shapes how the agent frames launches, protects collector trust, and presents its work across every collection and token action.
            </p>

            <div className="mt-6 grid gap-3">
              <InfoRow icon={<Bot className="h-4 w-4" />} label="Archetype" value={soul.archetype || "not set"} />
              <InfoRow icon={<Palette className="h-4 w-4" />} label="Tone" value={soul.tone || "not set"} />
              <InfoRow icon={<Orbit className="h-4 w-4" />} label="Launch state" value={liveSignal} />
              <InfoRow icon={<Wrench className="h-4 w-4" />} label="Installed skills" value={`${agent.skills.length}`} />
            </div>

            {soul.backstory ? (
              <div className="mt-6 rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Backstory</p>
                <p className="mt-3 text-sm leading-7 text-gray-300">{soul.backstory}</p>
              </div>
            ) : null}

            {Array.isArray(soul.boundaries) && soul.boundaries.length ? (
              <div className="mt-6 rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Guardrails</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {soul.boundaries.map((item: string) => (
                    <span key={item} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-gray-300">{item}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.24fr,0.76fr]">
          <div className="glass-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {(["overview", "chat", "skills", "runs"] as StudioTab[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.24em]",
                      tab === item ? "bg-cyan-400 text-black" : "bg-white/[0.05] text-gray-500"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-gray-400">
                {tab === "overview" ? "launch surface" : tab === "chat" ? "live conversation" : tab === "skills" ? "capability control" : "run history"}
              </div>
            </div>

            {error ? <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

            {tab === "overview" ? (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                  <SignalCard label="Wallet readiness" value={walletSignal} note="Fund this wallet before launch actions." icon={<Wallet className="h-4 w-4" />} />
                  <SignalCard label="Identity rail" value={agent.metaplex?.registered ? "Synced" : "Pending"} note="Registry and delegation state." icon={<Layers3 className="h-4 w-4" />} />
                  <SignalCard label="Chat control" value={agent.openclaw.chat_enabled ? "Ready" : "Preparing"} note="Private operator chat and actions." icon={<MessageSquare className="h-4 w-4" />} />
                </div>

                <ActionPanel title="On-chain identity" description="Sync the agent into the registry and attach the execution rail before public launch activity." cta="Sync identity" loading={actionLoading === "sync-metaplex"} onClick={() => runAction("sync-metaplex", {})} />

                <div className="grid gap-6 xl:grid-cols-2">
                  <form onSubmit={(event) => { event.preventDefault(); void runAction("launch-collection", collectionForm); }} className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-cyan-300"><Sparkles className="h-4 w-4" /><h3 className="text-lg font-semibold">Launch NFT Collection</h3></div>
                    <p className="mt-2 text-sm leading-6 text-gray-400">Deploy a collection directly from the agent wallet with collector-ready metadata and premium launch controls.</p>
                    <div className="mt-4 space-y-3">
                      <input className="input-field" placeholder="Collection name" value={collectionForm.name} onChange={(e) => setCollectionForm((c) => ({ ...c, name: e.target.value }))} />
                      <input className="input-field" placeholder="Symbol" value={collectionForm.symbol} onChange={(e) => setCollectionForm((c) => ({ ...c, symbol: e.target.value.toUpperCase() }))} />
                      <textarea className="input-field min-h-[100px]" placeholder="Description" value={collectionForm.description} onChange={(e) => setCollectionForm((c) => ({ ...c, description: e.target.value }))} />
                      <input className="input-field" placeholder="Cover image URL" value={collectionForm.image} onChange={(e) => setCollectionForm((c) => ({ ...c, image: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-3">
                        <input className="input-field" placeholder="Supply" type="number" value={collectionForm.max_supply} onChange={(e) => setCollectionForm((c) => ({ ...c, max_supply: Number(e.target.value) }))} />
                        <input className="input-field" placeholder="Mint price SOL" value={collectionForm.mint_price_sol} onChange={(e) => setCollectionForm((c) => ({ ...c, mint_price_sol: e.target.value }))} />
                      </div>
                      <button disabled={actionLoading === "launch-collection"} className="btn-primary w-full">{actionLoading === "launch-collection" ? "Launching..." : "Launch NFT Collection"}</button>
                    </div>
                  </form>

                  <form onSubmit={(event) => { event.preventDefault(); void runAction("launch-token", tokenForm); }} className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-amber-300"><Coins className="h-4 w-4" /><h3 className="text-lg font-semibold">Launch Agent Token</h3></div>
                    <p className="mt-2 text-sm leading-6 text-gray-400">Open a Genesis token flow from the same operator wallet to pair funding and on-chain identity around the agent.</p>
                    <div className="mt-4 space-y-3">
                      <input className="input-field" placeholder="Token name" value={tokenForm.name} onChange={(e) => setTokenForm((c) => ({ ...c, name: e.target.value }))} />
                      <input className="input-field" placeholder="Symbol" value={tokenForm.symbol} onChange={(e) => setTokenForm((c) => ({ ...c, symbol: e.target.value.toUpperCase() }))} />
                      <textarea className="input-field min-h-[100px]" placeholder="Description" value={tokenForm.description} onChange={(e) => setTokenForm((c) => ({ ...c, description: e.target.value }))} />
                      <input className="input-field" placeholder="Token image URL" value={tokenForm.image} onChange={(e) => setTokenForm((c) => ({ ...c, image: e.target.value }))} />
                      <input className="input-field" placeholder="Website URL" value={tokenForm.website_url} onChange={(e) => setTokenForm((c) => ({ ...c, website_url: e.target.value }))} />
                      <button disabled={actionLoading === "launch-token"} className="btn-primary w-full">{actionLoading === "launch-token" ? "Launching..." : "Launch Agent Token"}</button>
                    </div>
                  </form>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <OutputList title="Collections" items={agent.collections} empty="No NFT collections yet." urlKey="collection_url" />
                  <OutputList title="Tokens" items={agent.token_launches} empty="No token launches yet." urlKey="launch_url" />
                </div>
              </div>
            ) : null}

            {tab === "chat" ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-[0.33fr,0.67fr]">
                <div className="space-y-3">
                  <button onClick={handleCreateSession} className="btn-secondary w-full justify-center inline-flex items-center gap-2 px-4 py-3"><PlusIcon />New Session</button>
                  <div className="space-y-2">
                    {agent.sessions.map((session: any) => (
                      <button key={session.id} onClick={() => setSessionId(session.id)} className={clsx("w-full rounded-2xl border px-4 py-3 text-left", activeSession?.id === session.id ? "border-cyan-400/30 bg-cyan-400/10" : "border-white/[0.08] bg-white/[0.03]") }>
                        <p className="text-sm font-medium">{session.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{new Date(session.updated_at).toLocaleString()}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/[0.08] bg-black/20 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300">Agent chat</p>
                      <h3 className="mt-2 text-xl font-semibold">{activeSession?.title || "Main Session"}</h3>
                    </div>
                    <Badge tone={agent.openclaw.configured ? "emerald" : "amber"}>{liveSignal}</Badge>
                  </div>
                  <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-2">
                    {(activeSession?.messages || []).map((message: any) => (
                      <div key={message.id} className={clsx("rounded-2xl px-4 py-3 text-sm", message.role === "assistant" ? "bg-white/[0.05] text-gray-100" : "bg-cyan-400/10 text-cyan-50") }>
                        <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{message.role}</p>
                        <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex gap-3">
                    <textarea className="input-field min-h-[96px]" placeholder="Ask the agent to inspect its wallet, prepare a launch, or explain its current state..." value={chatInput} onChange={(event) => setChatInput(event.target.value)} />
                    <button onClick={handleSendChat} disabled={chatLoading} className="btn-primary h-[96px] px-5"><Send className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "skills" ? (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {agent.skills.map((skill: any) => (
                  <div key={skill.id} className="rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300">{skill.key}</p>
                        <h3 className="mt-2 text-lg font-semibold">{skill.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-gray-400">{skill.description}</p>
                      </div>
                      <button onClick={() => void toggleSkill(skill.key, !skill.enabled)} className={clsx("rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.22em]", skill.enabled ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-gray-500")}>{skill.enabled ? "enabled" : "disabled"}</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "runs" ? (
              <div className="mt-6 space-y-3">
                {agent.runs.length === 0 ? (
                  <div className="rounded-[22px] border border-white/[0.08] bg-black/20 px-5 py-5 text-sm text-gray-400">No action runs yet.</div>
                ) : (
                  agent.runs.map((run: any) => (
                    <div key={run.id} className="rounded-[24px] border border-white/[0.08] bg-black/20 px-5 py-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300">{run.action_type}</p>
                          <h3 className="mt-2 text-lg font-semibold">{run.title}</h3>
                        </div>
                        <Badge tone={run.status === "success" ? "emerald" : run.status === "failed" ? "red" : "cyan"}>{run.status}</Badge>
                      </div>
                      {run.error ? <p className="mt-3 text-sm text-red-200">{run.error}</p> : null}
                      {run.tx_hash ? <p className="mt-3 text-sm text-gray-300">tx: {run.tx_hash}</p> : null}
                      <p className="mt-3 text-xs text-gray-500">{new Date(run.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <div className="glass-card">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Operational canvas</p>
              <div className="mt-4 space-y-3 text-sm text-gray-300">
                <InfoRow icon={<Activity className="h-4 w-4" />} label="Studio state" value={liveSignal} />
                <InfoRow icon={<Wallet className="h-4 w-4" />} label="Execution wallet" value={walletSignal} />
                <InfoRow icon={<ScrollText className="h-4 w-4" />} label="Sessions" value={`${agent.sessions.length}`} />
              </div>
            </div>

            <div className="glass-card">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">On-chain identity</p>
              <div className="mt-4 space-y-3 text-sm text-gray-300">
                <InfoRow icon={<CheckCircle2 className="h-4 w-4" />} label="Registered" value={agent.metaplex?.registered ? "yes" : "not yet"} />
                <InfoRow icon={<Rocket className="h-4 w-4" />} label="Delegated" value={agent.metaplex?.delegated ? "yes" : "not yet"} />
                {agent.metaplex?.registration_uri ? (
                  <a href={agent.metaplex.registration_uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">
                    Open registration document
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="glass-card">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Soul notes</p>
              <div className="mt-4 space-y-3 text-sm text-gray-300">
                <InfoRow icon={<Palette className="h-4 w-4" />} label="Archetype" value={soul.archetype || "not set"} />
                <InfoRow icon={<MessageSquare className="h-4 w-4" />} label="Tone" value={soul.tone || "not set"} />
                <InfoRow icon={<Shield className="h-4 w-4" />} label="Boundaries" value={`${guardrailCount} active`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-h-[132px] rounded-[22px] border border-white/[0.08] bg-black/20 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <span className="max-w-[120px] text-[11px] leading-5 font-mono uppercase tracking-[0.22em] text-gray-500">{label}</span>
        <span className="mt-0.5 shrink-0 text-cyan-300">{icon}</span>
      </div>
      <div className="mt-5 text-3xl font-semibold leading-none">{value}</div>
    </div>
  );
}

function SignalCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-black/20 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{label}</span>
        <span className="text-cyan-300">{icon}</span>
      </div>
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-gray-400">{note}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "cyan" | "emerald" | "amber" | "fuchsia" | "red"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    cyan: "bg-cyan-400/10 text-cyan-300",
    emerald: "bg-emerald-400/10 text-emerald-300",
    amber: "bg-amber-400/10 text-amber-200",
    fuchsia: "bg-fuchsia-400/10 text-fuchsia-200",
    red: "bg-red-500/10 text-red-200",
  };

  return <span className={clsx("rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em]", tones[tone])}>{children}</span>;
}

function ActionPanel({ title, description, cta, onClick, loading }: { title: string; description: string; cta: string; onClick: () => void; loading: boolean; }) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
        </div>
        <button onClick={onClick} disabled={loading} className="btn-secondary px-4 py-2">{loading ? "Running..." : cta}</button>
      </div>
    </div>
  );
}

function OutputList({ title, items, empty, urlKey }: { title: string; items: any[]; empty: string; urlKey: string }) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">{empty}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-100">{item.name}</p>
                  <p className="mt-1 text-sm text-gray-500">{item.symbol || item.token_address}</p>
                </div>
                {item[urlKey] ? (
                  <Link href={item[urlKey]} target="_blank" className="text-cyan-300 hover:text-cyan-200"><ExternalLink className="h-4 w-4" /></Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <div className="inline-flex items-center gap-2 text-gray-400">{icon}<span>{label}</span></div>
      <span className="max-w-[230px] truncate font-mono text-xs text-gray-100">{value}</span>
    </div>
  );
}

function PlusIcon() {
  return <span className="text-lg leading-none">+</span>;
}



