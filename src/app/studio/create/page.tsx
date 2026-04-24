"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Sparkles, Wand2, Palette, Shield, Bot, Star, Brush, Gem, Flame } from "lucide-react";
import { clsx } from "clsx";
import { useWallet } from "@/components/wallet-context";

const skillOptions = [
  {
    key: "clawdmint-nft-launch",
    title: "NFT Launch",
    description: "Deploy Metaplex-powered NFT collections from the agent wallet.",
  },
  {
    key: "clawdmint-token-launch",
    title: "Token Launch",
    description: "Launch Metaplex Genesis agent tokens from the same wallet.",
  },
  {
    key: "clawdmint-registry",
    title: "Metaplex Identity",
    description: "Sync and repair the on-chain agent identity and execution delegation.",
  },
];

const soulArchetypes = [
  {
    key: "Visual Storyteller",
    title: "Visual Storyteller",
    description: "Turns launches into cinematic worlds with strong narrative framing.",
    instinct: "Leads with atmosphere, pacing, and emotional payoff.",
    signature: ["Narrative drops", "Collector emotion", "Cohesive worldbuilding"],
    icon: <Star className="h-4 w-4" />,
  },
  {
    key: "Concept Architect",
    title: "Concept Architect",
    description: "Builds systems, motifs, and collectible logic with crisp design discipline.",
    instinct: "Structures every launch like a designed system, not a loose campaign.",
    signature: ["Lore systems", "Edition logic", "Controlled symbolism"],
    icon: <Gem className="h-4 w-4" />,
  },
  {
    key: "Style Chameleon",
    title: "Style Chameleon",
    description: "Adapts across aesthetics without losing a recognizable signature.",
    instinct: "Moves across references quickly while preserving a clean, premium finish.",
    signature: ["Style agility", "Mood matching", "Flexible visual language"],
    icon: <Brush className="h-4 w-4" />,
  },
  {
    key: "Commercial Creator",
    title: "Commercial Creator",
    description: "Optimized for polished creator campaigns, drops, and launch operations.",
    instinct: "Balances taste with conversion, keeping the work launch-ready at all times.",
    signature: ["Campaign polish", "Drop momentum", "Brand discipline"],
    icon: <Flame className="h-4 w-4" />,
  },
];

const toneOptions = [
  { key: "Friendly", note: "Warm and welcoming without losing clarity." },
  { key: "Professional", note: "Calm, crisp, and operator-grade." },
  { key: "Playful", note: "Lighter touch with expressive energy." },
  { key: "Wise", note: "Measured, insightful, and mentor-like." },
  { key: "Hype", note: "Momentum-driven with launch-day confidence." },
  { key: "Calm", note: "Minimal, centered, and reassuring." },
] as const;

const defaultBoundaries = [
  "Do not generate NSFW, violent, or hateful imagery.",
  "Respect creative ownership and attribution.",
  "Do not replicate copyrighted characters or art without permission.",
  "Be transparent when output is AI-generated.",
];

const boundarySuggestions = [
  "Do not imitate living artists too closely.",
  "Keep launch advice grounded in verified wallet and chain state.",
  "Avoid overstating rarity, utility, or guaranteed outcomes.",
  "Preserve collector trust over short-term hype.",
];

const steps = ["Identity", "Soul", "Skills", "Review"] as const;

export default function CreateStudioAgentPage() {
  const { address, authenticated, login } = useWallet();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generatingPfp, setGeneratingPfp] = useState(false);
  const [created, setCreated] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boundaryInput, setBoundaryInput] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    avatar_url: "",
    x_handle: "",
    persona: "Operate like a premium creator operator. Keep answers direct, polished, and trustworthy. Help with wallet readiness, Metaplex identity, NFT launches, token launches, and on-chain status without hype.",
    soul_archetype: "Visual Storyteller",
    tone: "Professional",
    backstory: "Born inside Clawdmint Studio to craft premium on-chain launches with a collector's eye and operator discipline.",
    boundaries: defaultBoundaries,
    pfp_data_url: "",
    pfp_prompt_summary: "",
    skills: ["clawdmint-nft-launch", "clawdmint-token-launch", "clawdmint-registry"],
  });

  const canContinue = useMemo(() => {
    if (step === 0) {
      return form.name.trim().length >= 2 && form.description.trim().length >= 12;
    }
    if (step === 1) {
      return form.persona.trim().length >= 20 && form.boundaries.length > 0;
    }
    return true;
  }, [form, step]);

  const activeArchetype = soulArchetypes.find((item) => item.key === form.soul_archetype);
  const activeTone = toneOptions.find((tone) => tone.key === form.tone);

  const toggleSkill = (skillKey: string) => {
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(skillKey)
        ? current.skills.filter((item) => item !== skillKey)
        : [...current.skills, skillKey],
    }));
  };

  const generatePfp = async () => {
    setGeneratingPfp(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/pfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || "Claw Agent",
          description: form.description,
          soul_archetype: form.soul_archetype,
          tone: form.tone,
          backstory: form.backstory,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to generate PFP");
      }

      setForm((current) => ({
        ...current,
        avatar_url: json.pfp.data_url,
        pfp_data_url: json.pfp.data_url,
        pfp_prompt_summary: json.pfp.prompt_summary,
      }));
    } catch (pfpError) {
      setError(pfpError instanceof Error ? pfpError.message : "Failed to generate PFP");
    } finally {
      setGeneratingPfp(false);
    }
  };

  const addBoundary = () => {
    const trimmed = boundaryInput.trim();
    if (!trimmed) return;
    setForm((current) => ({ ...current, boundaries: [...current.boundaries, trimmed] }));
    setBoundaryInput("");
  };

  const removeBoundary = (value: string) => {
    setForm((current) => ({ ...current, boundaries: current.boundaries.filter((item) => item !== value) }));
  };

  const addSuggestedBoundary = (value: string) => {
    setForm((current) => ({
      ...current,
      boundaries: current.boundaries.includes(value) ? current.boundaries : [...current.boundaries, value],
    }));
  };

  const handleCreate = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/studio/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_wallet_address: address,
          ...form,
          avatar_url: form.avatar_url || undefined,
          x_handle: form.x_handle || undefined,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to create agent");
      }

      setCreated(json.agent);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const reviewLines = [
    `${activeArchetype?.title || form.soul_archetype} soul`,
    `${form.tone} tone`,
    `${form.skills.length} skills enabled`,
    `${form.boundaries.length} guardrails active`,
  ];

  return (
    <div className="min-h-screen noise relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-85" />
      <div className="absolute inset-0 tech-grid opacity-25" />

      <div className="container mx-auto px-4 py-10 relative">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Studio
            </Link>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Create Agent</h1>
            <p className="mt-2 max-w-2xl text-gray-400">
              Build a premium Clawdmint operator with a distinct creative soul, a dedicated Solana wallet, and launch actions for collections and tokens.
            </p>
          </div>
          <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-mono uppercase tracking-[0.24em] text-cyan-300">
            <Palette className="h-4 w-4" />
            Studio Forge
          </div>
        </div>

        {!authenticated || !address ? (
          <div className="glass-card max-w-2xl">
            <h2 className="text-2xl font-semibold">Connect your wallet first</h2>
            <p className="mt-2 text-gray-400">
              Studio agents belong to the connected Solana wallet. Connect Phantom to provision your agent and dashboard.
            </p>
            <button onClick={() => login()} className="btn-primary mt-6 inline-flex items-center gap-2">
              connect wallet
            </button>
          </div>
        ) : created ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="glass-card border border-emerald-400/20 bg-emerald-400/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.24em] text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Agent ready
                  </div>
                  <h2 className="mt-4 text-3xl font-semibold">{created.name}</h2>
                  <p className="mt-2 text-gray-400">Wallet, control surface, and Studio dashboard are provisioned.</p>
                </div>
                <Link href={created.next_url} className="btn-primary">
                  Open dashboard
                </Link>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <StudioOutputCard label="Agent Wallet" value={created.wallet.address} />
                <StudioOutputCard label="Control ID" value={created.openclaw.agent_id} />
                <StudioOutputCard label="Studio Status" value={created.openclaw.configured ? "Active" : "Activating"} />
              </div>
            </div>

            <div className="glass-card">
              <h3 className="text-xl font-semibold">Next steps</h3>
              <div className="mt-5 space-y-3 text-sm text-gray-300">
                <p>1. Fund the agent wallet with SOL.</p>
                <p>2. Open the dashboard and sync on-chain identity.</p>
                <p>3. Launch a collection or token from the same operator wallet.</p>
                <p>4. Use Chat to direct the agent in real time.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
            <div className="glass-card">
              <div className="mb-8 flex flex-wrap gap-2">
                {steps.map((label, index) => (
                  <div
                    key={label}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.24em]",
                      index === step ? "bg-cyan-400 text-black" : index < step ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-gray-500"
                    )}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {step === 0 ? (
                <div className="space-y-5">
                  <Field label="Agent Name">
                    <input className="input-field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="noah, atlas, lumen..." />
                  </Field>
                  <Field label="Description">
                    <textarea className="input-field min-h-[150px]" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe what this agent does, who it serves, and what kind of launches it handles." />
                  </Field>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="X Handle">
                      <input className="input-field" value={form.x_handle} onChange={(event) => setForm((current) => ({ ...current, x_handle: event.target.value.replace(/^@/, "") }))} placeholder="without @" />
                    </Field>
                    <Field label="Owner Wallet">
                      <input className="input-field" disabled value={address} />
                    </Field>
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Artist Soul</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {soulArchetypes.map((item) => {
                        const active = item.key === form.soul_archetype;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, soul_archetype: item.key }))}
                            className={clsx(
                              "rounded-[24px] border p-5 text-left transition-colors",
                              active ? "border-cyan-400/30 bg-cyan-400/10" : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16]"
                            )}
                          >
                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
                              {item.icon}
                            </div>
                            <div className="mt-4 text-base font-semibold text-white">{item.title}</div>
                            <div className="mt-2 text-sm leading-6 text-gray-400">{item.description}</div>
                            <div className="mt-3 text-xs uppercase tracking-[0.22em] text-gray-500">Core instinct</div>
                            <div className="mt-2 text-sm text-gray-300">{item.instinct}</div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {item.signature.map((tag) => (
                                <span key={tag} className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-gray-300">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Tone</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {toneOptions.map((tone) => (
                        <button
                          key={tone.key}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, tone: tone.key }))}
                          className={clsx(
                            "rounded-[20px] border px-4 py-4 text-left transition-colors",
                            form.tone === tone.key ? "border-cyan-400/30 bg-cyan-400/10" : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]"
                          )}
                        >
                          <div className="text-sm font-semibold text-white">{tone.key}</div>
                          <div className="mt-2 text-xs leading-5 text-gray-400">{tone.note}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Field label="Persona">
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
                      <div className="text-sm text-gray-400">This becomes the agent&apos;s operating voice and behavior.</div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            persona: `Operate like a ${current.tone.toLowerCase()} ${current.soul_archetype.toLowerCase()} for Clawdmint. Keep answers polished, grounded, and useful. Help with wallet readiness, Metaplex identity, NFT launches, token launches, and creator operations without filler. Protect collector trust and make every move feel intentional.`,
                          }))
                        }
                        className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-xs"
                      >
                        <Wand2 className="h-4 w-4" />
                        AI Generate
                      </button>
                    </div>
                    <textarea className="input-field min-h-[180px]" value={form.persona} onChange={(event) => setForm((current) => ({ ...current, persona: event.target.value }))} />
                  </Field>

                  <Field label="Backstory">
                    <textarea className="input-field min-h-[120px]" value={form.backstory} onChange={(event) => setForm((current) => ({ ...current, backstory: event.target.value }))} placeholder="Where did this agent come from, what motivates it, and how should it frame its creative work?" />
                  </Field>

                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Boundaries & Rules</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {form.boundaries.map((item) => (
                        <button key={item} type="button" onClick={() => removeBoundary(item)} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-gray-300 hover:border-red-400/30 hover:text-red-200">
                          {item}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-3">
                      <input className="input-field" value={boundaryInput} onChange={(event) => setBoundaryInput(event.target.value)} placeholder="Add a custom boundary..." />
                      <button type="button" onClick={addBoundary} className="btn-secondary px-4 py-3">Add</button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {boundarySuggestions.map((item) => (
                        <button key={item} type="button" onClick={() => addSuggestedBoundary(item)} className="rounded-full border border-dashed border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-200 hover:border-cyan-400/40">
                          + {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300">PFP Generator</p>
                        <h3 className="mt-2 text-xl font-semibold">Forge the agent portrait</h3>
                        <p className="mt-2 text-sm text-gray-400">Generate a signature avatar from the soul profile instead of leaving the identity blank.</p>
                      </div>
                      <button type="button" onClick={generatePfp} disabled={generatingPfp} className="btn-primary inline-flex items-center gap-2">
                        <Palette className="h-4 w-4" />
                        {generatingPfp ? "Forging..." : "Generate PFP"}
                      </button>
                    </div>

                    <div className="mt-5 grid gap-5 md:grid-cols-[180px,1fr]">
                      <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-black/30 p-3">
                        {form.pfp_data_url ? (
                          <img src={form.pfp_data_url} alt="Generated agent portrait" className="h-full w-full rounded-[20px] object-cover" />
                        ) : (
                          <div className="flex h-[180px] items-center justify-center rounded-[20px] border border-dashed border-white/[0.08] text-sm text-gray-500">
                            Generate portrait
                          </div>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-sm text-gray-300">
                          <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Visual signature</div>
                          <div className="mt-2">{form.pfp_prompt_summary || "No portrait generated yet."}</div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          {skillOptions.map((skill) => {
                            const active = form.skills.includes(skill.key);
                            return (
                              <button key={skill.key} type="button" onClick={() => toggleSkill(skill.key)} className={clsx("rounded-2xl border px-4 py-4 text-left transition-colors", active ? "border-cyan-400/30 bg-cyan-400/10" : "border-white/[0.08] bg-white/[0.03]") }>
                                <div className="text-sm font-semibold text-white">{skill.title}</div>
                                <div className="mt-2 text-xs text-gray-400">{skill.description}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-6">
                  <ReviewBlock title="Identity" lines={[form.name, form.description]} />
                  <ReviewBlock title="Artist soul" lines={[`${activeArchetype?.title || form.soul_archetype} • ${form.tone}`, activeArchetype?.instinct || "", form.backstory]} />
                  <ReviewBlock title="Persona" lines={[form.persona]} />
                  <ReviewBlock title="Boundaries" lines={form.boundaries} />
                  <ReviewBlock title="Skills" lines={form.skills.map((skillKey) => skillOptions.find((item) => item.key === skillKey)?.title || skillKey)} />
                </div>
              ) : null}

              {error ? <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

              <div className="mt-8 flex items-center justify-between gap-4">
                <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="btn-secondary inline-flex items-center gap-2 px-5 py-3 disabled:opacity-40">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>

                {step < steps.length - 1 ? (
                  <button type="button" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} disabled={!canContinue} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={handleCreate} disabled={loading} className="btn-primary inline-flex items-center gap-2">
                    {loading ? "Creating..." : "Create Agent"}
                    <Sparkles className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="glass-card">
              <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-cyan-300">Studio Blueprint</p>
              <h2 className="mt-3 text-2xl font-semibold">{form.name || "Your agent"}</h2>
              <p className="mt-3 text-gray-400">
                {form.description || "Your Clawdmint operator will appear here as you shape its identity, portrait, and creative posture."}
              </p>

              <div className="mt-6 overflow-hidden rounded-[32px] border border-white/[0.08] bg-black/30 p-4">
                {form.pfp_data_url ? (
                  <img src={form.pfp_data_url} alt="Generated portrait preview" className="w-full rounded-[24px] object-cover" />
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-[24px] border border-dashed border-white/[0.08] text-sm text-gray-500">
                    Portrait preview
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">Soul summary</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <PreviewMetric icon={<Bot className="h-4 w-4" />} label="Archetype" value={activeArchetype?.title || form.soul_archetype} />
                  <PreviewMetric icon={<Palette className="h-4 w-4" />} label="Tone" value={activeTone?.key || form.tone} />
                  <PreviewMetric icon={<Shield className="h-4 w-4" />} label="Guardrails" value={`${form.boundaries.length} active`} />
                  <PreviewMetric icon={<Sparkles className="h-4 w-4" />} label="Skills" value={`${form.skills.length} enabled`} />
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-cyan-400/15 bg-cyan-400/5 p-5">
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-300">Creative posture</p>
                <div className="mt-3 text-sm leading-7 text-gray-300">{activeArchetype?.instinct || "Shape a premium on-chain presence with a clear signature and reliable launch discipline."}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {reviewLines.map((line) => (
                    <span key={line} className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-gray-300">
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ReviewBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-black/20 px-5 py-4">
      <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{title}</p>
      <div className="mt-3 space-y-2 text-sm text-gray-200">
        {lines.filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function StudioOutputCard({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-black/20 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-gray-500">{label}</p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-cyan-300 transition-colors hover:text-cyan-200"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 break-all font-mono text-sm text-gray-100">{value}</p>
      {copied ? <p className="mt-2 text-xs text-emerald-300">Copied</p> : null}
    </div>
  );
}

function PreviewMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-4">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-sm font-medium text-gray-100">{value}</div>
    </div>
  );
}

