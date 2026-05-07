"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ChevronLeft, ChevronRight, Download, ExternalLink, Search, X } from "lucide-react";
import { useCpegSite } from "@/components/cpeg-site-context";
import { cpegPublicPaths } from "@/lib/cpeg-site-paths";
import { truncateAddress } from "@/lib/cpeg-ui";

interface ExploreCollection {
  id: string;
  name: string;
  symbol: string;
  token_mint: string;
  max_pegs: number;
  cluster: string;
  identity_mode?: string;
}

interface ExplorePeg {
  id: number;
  name: string;
  collection_name: string;
  collection_symbol: string;
  token_mint: string;
  peg_record: string | null;
  image: string;
  minted: boolean;
  owner: string | null;
  owner_short: string | null;
  status: string | null;
  on_chain_seed: string | null;
  minted_slot: string | null;
  transferred_slot: string | null;
  burned_slot: string | null;
  visual_score: number;
  rarity_percent: string;
  traits: Record<string, string | number | boolean | null>;
}

interface ExplorePayload {
  success: boolean;
  collections: ExploreCollection[];
  selected_collection: {
    id: string;
    name: string;
    symbol: string;
    token_mint: string;
    collection_address: string | null;
    identity_mode?: string;
    canonical_root?: string | null;
    agent_asset_address?: string | null;
    agent_identity_pda?: string | null;
    cluster: string;
    renderer: string;
    renderer_hash: string;
    max_pegs: number;
    created_at: string;
    launched_at: string | null;
  } | null;
  stats: {
    cpegs: number;
    holders: number;
    minted: number;
  };
  page: {
    offset: number;
    limit: number;
    next_offset: number | null;
    previous_offset: number | null;
  };
  pegs: ExplorePeg[];
}

type DetailTab = "traits" | "provenance" | "rarity";

const DEFAULT_PAYLOAD: ExplorePayload = {
  success: true,
  collections: [],
  selected_collection: null,
  stats: { cpegs: 0, holders: 0, minted: 0 },
  page: { offset: 0, limit: 36, next_offset: null, previous_offset: null },
  pegs: [],
};

function normalizePayload(payload: ExplorePayload | null): ExplorePayload {
  if (!payload?.success) return DEFAULT_PAYLOAD;
  return payload;
}

function traitRows(traits: ExplorePeg["traits"]) {
  return Object.entries(traits)
    .filter(([key]) => !["seed", "renderer", "image_model", "canonical_source"].includes(key))
    .map(([key, value]) => ({
      label: key.replaceAll("_", " "),
      value: value == null ? "None" : String(value),
    }));
}

function rarityRows(peg: ExplorePeg) {
  return traitRows(peg.traits).filter((row) => row.label !== "rank");
}

async function downloadJpeg(peg: ExplorePeg) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image could not be loaded"));
  });
  image.src = peg.image;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/jpeg", 0.94);
  a.download = `${peg.collection_symbol}-cpeg-${peg.id}.jpg`;
  a.click();
}

export function CpegExploreClient({ initialPayload }: { initialPayload: ExplorePayload }) {
  const site = useCpegSite();
  const searchParams = useSearchParams();
  const urls = useMemo(() => cpegPublicPaths(site), [site]);
  const normalizedInitialPayload = useMemo(() => normalizePayload(initialPayload), [initialPayload]);
  const urlMint = searchParams?.get("mint") || "";
  const [payload, setPayload] = useState(normalizedInitialPayload);
  const [mint, setMint] = useState(urlMint || normalizedInitialPayload.selected_collection?.token_mint || "");
  const [query, setQuery] = useState(searchParams?.get("q") || "");
  const [sort, setSort] = useState<"visual" | "age">(searchParams?.get("sort") === "age" ? "age" : "visual");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ExplorePeg | null>(null);
  const [tab, setTab] = useState<DetailTab>("traits");

  const collection = payload.selected_collection;
  const pegs = payload.pegs;

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: "36",
        offset: String(offset),
        sort,
      });
      if (mint) params.set("mint", mint);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/cpeg/explore?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as ExplorePayload | null;
      if (!response.ok || !body?.success) {
        throw new Error("Explorer data is unavailable.");
      }
      const next = normalizePayload(body);
      setPayload(next);
      if (next.selected_collection?.token_mint) {
        setMint(next.selected_collection.token_mint);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Explorer data is unavailable.");
    } finally {
      setBusy(false);
    }
  }, [mint, offset, query, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const nextMint = searchParams?.get("mint") || "";
    if (nextMint && nextMint !== mint) {
      setMint(nextMint);
      setOffset(0);
    }
  }, [mint, searchParams]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    void load();
  };

  const changeMint = (value: string) => {
    setMint(value);
    setOffset(0);
  };

  const selectedTraits = selected ? traitRows(selected.traits) : [];
  const selectedRarity = selected ? rarityRows(selected) : [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4efe7] text-neutral-950 dark:bg-[#070707] dark:text-[#f7f2df]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 22%, rgba(83,199,255,0.18), transparent 38%), radial-gradient(circle at 82% 18%, rgba(236,92,255,0.14), transparent 32%)",
        }}
      />

      <main className="relative mx-auto max-w-7xl px-5 py-10 md:px-10 md:py-14">
        <section className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#ec5cff]">Explore</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
              <div>
                <h1 className="text-5xl font-black uppercase leading-none md:text-7xl">Gallery</h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-white/55">
                  Browse deterministic PEG identities by score, owner, peg id, or collection.
                </p>
                {collection ? (
                  <p className="mt-3 inline-flex border border-neutral-300 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 dark:border-white/15 dark:text-white/45">
                    {collection.identity_mode === "metaplex_agent" ? "Metaplex Agent Root" : "Legacy Test Collection"}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-5 font-mono text-xs uppercase tracking-[0.18em]">
                <div>
                  <p className="text-2xl font-black text-neutral-950 dark:text-white">{payload.stats.cpegs.toLocaleString()}</p>
                  <p className="mt-1 text-neutral-500 dark:text-white/35">Identities</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-neutral-950 dark:text-white">{payload.stats.holders.toLocaleString()}</p>
                  <p className="mt-1 text-neutral-500 dark:text-white/35">Holders</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-neutral-950 dark:text-white">{payload.stats.minted.toLocaleString()}</p>
                  <p className="mt-1 text-neutral-500 dark:text-white/35">Minted</p>
                </div>
              </div>
            </div>

            <form onSubmit={submitSearch} className="mt-8 grid max-w-3xl gap-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-500 dark:text-white/45">
                Search
              </label>
              <div className="grid gap-2 sm:grid-cols-[1fr_132px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Wallet address, token mint, or PEG ID"
                  className="h-12 border border-neutral-300 bg-neutral-50 px-4 font-mono text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[#53c7ff] dark:border-white/10 dark:bg-[#1b1917] dark:text-white dark:placeholder:text-white/25"
                />
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
                >
                  <Search className="h-4 w-4" /> Search
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSort("visual");
                  setOffset(0);
                }}
                className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                  sort === "visual"
                    ? "border-neutral-950 text-neutral-950 dark:border-[#f7f2df] dark:text-white"
                    : "border-neutral-300 text-neutral-500 hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/10 dark:text-white/45"
                }`}
              >
                Visual Score
              </button>
              <button
                type="button"
                onClick={() => {
                  setSort("age");
                  setOffset(0);
                }}
                className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                  sort === "age"
                    ? "border-neutral-950 text-neutral-950 dark:border-[#f7f2df] dark:text-white"
                    : "border-neutral-300 text-neutral-500 hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/10 dark:text-white/45"
                }`}
              >
                Age Score
              </button>
              <label className="inline-flex items-center gap-2 border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:border-white/10 dark:bg-[#111] dark:text-white/45">
                <span>Set</span>
                <select
                  value={mint}
                  onChange={(event) => changeMint(event.target.value)}
                  className="bg-transparent text-neutral-950 outline-none dark:text-white"
                >
                  {payload.collections.map((item) => (
                    <option key={item.token_mint} value={item.token_mint} className="bg-neutral-50 dark:bg-[#111]">
                      {item.symbol} / {item.identity_mode === "metaplex_agent" ? "Agent" : "Legacy"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 border border-neutral-300 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/10 dark:text-white/45"
              >
                <ArrowDownWideNarrow className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          <aside className="border border-neutral-200 bg-neutral-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#53c7ff]">Collection</p>
            <h2 className="mt-3 text-3xl font-black uppercase leading-none">
              {collection?.name || "No collection"}
            </h2>
            <div className="mt-4 grid gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
              <div className="flex items-center justify-between gap-3">
                <span>Symbol</span>
                <span className="text-neutral-950 dark:text-white">{collection?.symbol || "--"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Renderer</span>
                <span className="truncate text-neutral-950 dark:text-white">{collection?.renderer || "--"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Root</span>
                <span className="truncate text-neutral-950 dark:text-white">
                  {collection?.identity_mode === "metaplex_agent" ? "Metaplex Agent" : "Legacy"}
                </span>
              </div>
              {collection?.agent_asset_address ? (
                <div className="flex items-center justify-between gap-3">
                  <span>Agent Asset</span>
                  <span className="text-neutral-950 dark:text-white">{truncateAddress(collection.agent_asset_address, 5, 5)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span>Mint</span>
                <span className="text-neutral-950 dark:text-white">{collection ? truncateAddress(collection.token_mint, 5, 5) : "--"}</span>
              </div>
            </div>
            {collection ? (
              <Link
                href={urls.collection(collection.token_mint)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
              >
                Open market <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </aside>
        </section>

        {error ? (
          <div className="mt-6 border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>
        ) : null}

        <section className="mt-8">
          {busy ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 18 }).map((_, index) => (
                <div key={index} className="aspect-[0.76] animate-pulse bg-neutral-200 dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : pegs.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
              {pegs.map((peg, index) => (
                <button
                  key={`${peg.token_mint}-${peg.id}`}
                  type="button"
                  onClick={() => {
                    setSelected(peg);
                    setTab("traits");
                  }}
                  className="group border border-neutral-200 bg-neutral-100 text-left transition hover:-translate-y-0.5 hover:border-[#ec5cff]/60 dark:border-white/10 dark:bg-[#171717]"
                >
                  <div className="relative aspect-square overflow-hidden bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={peg.image}
                      alt={peg.name}
                      className="h-full w-full object-cover [image-rendering:pixelated]"
                      loading="lazy"
                    />
                    <span className="absolute right-2 top-2 bg-[#ec5cff] px-1.5 py-0.5 font-mono text-[9px] font-black text-white shadow-[0_0_14px_rgba(236,92,255,0.45)]">
                      #{index + 1 + payload.page.offset}
                    </span>
                    <span className="absolute left-2 top-2 bg-black/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/85">
                      Visual
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                      {peg.collection_symbol} <span className="text-neutral-950 dark:text-white">#{peg.id}</span>
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-200 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] dark:border-white/10">
                      <span className="text-neutral-500 dark:text-white/40">Score</span>
                      <span className="bg-[#f7c948] px-1.5 py-0.5 font-black text-black">
                        #{peg.visual_score.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">No PEGs found</p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={payload.page.previous_offset == null || busy}
              onClick={() => setOffset(payload.page.previous_offset || 0)}
              className="inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 transition hover:border-[#53c7ff] hover:text-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:text-white/55"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/35">
              {payload.page.offset + 1} to {payload.page.offset + pegs.length}
            </span>
            <button
              type="button"
              disabled={payload.page.next_offset == null || busy}
              onClick={() => setOffset(payload.page.next_offset || 0)}
              className="inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600 transition hover:border-[#53c7ff] hover:text-[#53c7ff] disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:text-white/55"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </main>

      {selected ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/72 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl border border-white/10 bg-[#1d1a18] p-5 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#ec5cff]">Detail</p>
                <h2 className="mt-3 text-3xl font-black uppercase leading-none text-white md:text-4xl">
                  {selected.collection_symbol} #{selected.id} <span className="align-middle text-sm text-[#ec5cff]">#{selected.visual_score}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center text-white/45 transition hover:text-white"
                aria-label="Close detail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.95fr]">
              <div>
                <div className="aspect-square overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.image}
                    alt={selected.name}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                  />
                </div>
              </div>

              <div className="flex min-h-[520px] flex-col">
                <div className="flex gap-5 border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.2em]">
                  {(["traits", "provenance", "rarity"] as DetailTab[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTab(item)}
                      className={`pb-3 transition ${
                        tab === item ? "border-b border-[#f7f2df] text-white" : "text-white/35 hover:text-[#53c7ff]"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                {tab === "traits" ? (
                  <div className="mt-6 grid gap-x-8 gap-y-0 md:grid-cols-2">
                    {selectedTraits.map((row) => (
                      <div key={row.label} className="flex items-center justify-between border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.16em]">
                        <span className="text-white/35">{row.label}</span>
                        <span className="text-right font-black text-white">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === "provenance" ? (
                  <div className="mt-6 grid gap-0">
                    {[
                      ["Peg record", selected.peg_record],
                      ["Owner", selected.owner],
                      ["Status", selected.status],
                      ["Minted slot", selected.minted_slot],
                      ["Transferred slot", selected.transferred_slot],
                      ["Burned slot", selected.burned_slot],
                      ["Seed", selected.on_chain_seed || String(selected.traits.seed || "")],
                      ["Token mint", selected.token_mint],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.16em]">
                        <span className="text-white/35">{label}</span>
                        <span className="max-w-[68%] truncate text-right font-black text-white" title={value || ""}>
                          {value ? truncateAddress(value, 10, 10) : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === "rarity" ? (
                  <div className="mt-6">
                    <p className="font-mono text-sm font-black uppercase tracking-[0.16em] text-white">
                      Top {selected.rarity_percent} <span className="text-white/35">by deterministic rank</span>
                    </p>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {selectedRarity.map((row, index) => {
                        const width = `${Math.max(8, Math.min(100, (selected.visual_score + index * 377) % 100))}%`;
                        return (
                          <div key={row.label}>
                            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
                              <span className="text-white/35">{row.label}</span>
                              <span className="text-[#ec5cff]">{row.value}</span>
                            </div>
                            <div className="mt-2 h-1 bg-white/10">
                              <div className="h-full bg-[#ec5cff]" style={{ width }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-auto pt-8">
                  <div className="grid gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">
                    <div>
                      <p>Hash</p>
                      <p className="mt-1 break-all text-white">{String(selected.traits.seed || selected.on_chain_seed || "pending")}</p>
                    </div>
                    <div>
                      <p>Owner</p>
                      <p className="mt-1 break-all text-white">{selected.owner || "Pending mint"}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void downloadJpeg(selected)}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-[#8ca0bd] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#53c7ff]"
                  >
                    <Download className="h-4 w-4" /> Save as JPEG
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
