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

type DetailTab = "traits" | "details";

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

function formatDetailValue(label: string, value: string | null) {
  if (value) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (value === "Not applicable" || value === "Metaplex Core") return value;
    return truncateAddress(value, 10, 10);
  }
  if (label.toLowerCase().includes("slot")) return "Not applicable";
  return "--";
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

      <main className="relative mx-auto max-w-7xl px-5 py-8 md:px-10 md:py-12">
        <section className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            {/* compact toolbar: search + sort + collection */}
            <form
              onSubmit={submitSearch}
              className="flex flex-col gap-3 border border-neutral-200 bg-neutral-50/80 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03] md:flex-row md:items-center"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Wallet, token mint, or PEG ID"
                  className="h-11 w-full border border-neutral-200 bg-white pl-9 pr-3 font-mono text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[#53c7ff] dark:border-white/10 dark:bg-[#0c0c0c] dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <label className="inline-flex h-11 items-center gap-2 border border-neutral-200 bg-white px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:border-white/10 dark:bg-[#0c0c0c] dark:text-white/45">
                <span>Collection</span>
                <select
                  value={mint}
                  onChange={(event) => changeMint(event.target.value)}
                  className="bg-transparent text-neutral-950 outline-none dark:text-white"
                >
                  {payload.collections.map((item) => (
                    <option key={item.token_mint} value={item.token_mint} className="bg-white dark:bg-[#0c0c0c]">
                      {item.symbol}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-flex h-11 overflow-hidden border border-neutral-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setSort("visual");
                    setOffset(0);
                  }}
                  className={`h-full px-3 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                    sort === "visual"
                      ? "bg-neutral-950 text-white dark:bg-[#f7f2df] dark:text-black"
                      : "bg-white text-neutral-500 hover:text-[#53c7ff] dark:bg-[#0c0c0c] dark:text-white/45"
                  }`}
                >
                  Featured
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSort("age");
                    setOffset(0);
                  }}
                  className={`h-full border-l border-neutral-200 px-3 font-mono text-[10px] uppercase tracking-[0.18em] transition dark:border-white/10 ${
                    sort === "age"
                      ? "bg-neutral-950 text-white dark:bg-[#f7f2df] dark:text-black"
                      : "bg-white text-neutral-500 hover:text-[#53c7ff] dark:bg-[#0c0c0c] dark:text-white/45"
                  }`}
                >
                  Latest
                </button>
              </div>

              <button
                type="button"
                onClick={() => void load()}
                title="Refresh"
                className="inline-flex h-11 w-11 items-center justify-center border border-neutral-200 bg-white text-neutral-500 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/10 dark:bg-[#0c0c0c] dark:text-white/45"
              >
                <ArrowDownWideNarrow className="h-4 w-4" />
              </button>

              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
              >
                <Search className="h-4 w-4" /> Search
              </button>
            </form>

            {/* compact stat strip */}
            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden border border-neutral-200 bg-neutral-200/40 dark:border-white/10 dark:bg-white/5">
              <div className="bg-neutral-50 p-4 dark:bg-[#0c0c0c]">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">cPEGs</p>
                <p className="mt-1 text-xl font-black tracking-tight text-neutral-950 dark:text-[#f7f2df]">
                  {payload.stats.cpegs.toLocaleString()}
                </p>
              </div>
              <div className="bg-neutral-50 p-4 dark:bg-[#0c0c0c]">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">Holders</p>
                <p className="mt-1 text-xl font-black tracking-tight text-neutral-950 dark:text-[#f7f2df]">
                  {payload.stats.holders.toLocaleString()}
                </p>
              </div>
              <div className="bg-neutral-50 p-4 dark:bg-[#0c0c0c]">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">Minted</p>
                <p className="mt-1 text-xl font-black tracking-tight text-[#53c7ff]">
                  {payload.stats.minted.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <aside className="border border-neutral-200 bg-neutral-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#53c7ff]">Collection</p>
            <h2 className="mt-3 text-3xl font-black uppercase leading-none">
              {collection?.name || "No collection"}
            </h2>
            {collection ? (
              <p className="mt-1 font-mono text-xs text-neutral-500 dark:text-white/45">${collection.symbol}</p>
            ) : null}
            <div className="mt-5 grid gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
              <div className="flex items-center justify-between gap-3">
                <span>Supply</span>
                <span className="text-neutral-950 dark:text-white">{collection ? collection.max_pegs.toLocaleString() : "--"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Token</span>
                <span className="text-neutral-950 dark:text-white">{collection ? truncateAddress(collection.token_mint, 5, 5) : "--"}</span>
              </div>
            </div>
            {collection ? (
              <Link
                href={urls.collection(collection.token_mint)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-3 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
              >
                Open collection <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.22em] text-neutral-400 dark:text-white/30">
              On Metaplex Core
            </p>
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
                  className="group relative overflow-hidden border border-neutral-200 bg-neutral-100 text-left transition hover:-translate-y-0.5 hover:border-[#ec5cff]/60 hover:shadow-[0_8px_30px_rgba(236,92,255,0.15)] dark:border-white/10 dark:bg-[#0e0e0e]"
                >
                  <div className="relative aspect-square overflow-hidden bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={peg.image}
                      alt={peg.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04] [image-rendering:pixelated]"
                      loading="lazy"
                    />
                    {peg.minted ? (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 bg-black/75 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300 backdrop-blur-sm">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]" />
                        Minted
                      </span>
                    ) : (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 bg-black/75 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/75 backdrop-blur-sm">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/55" />
                        Pool
                      </span>
                    )}
                    <span className="absolute -bottom-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ec5cff]/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
                      {peg.collection_symbol}{" "}
                      <span className="font-black text-neutral-950 dark:text-white">#{peg.id}</span>
                    </p>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400 dark:text-white/35">
                      #{peg.visual_score.toLocaleString()}
                    </span>
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
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl border border-white/10 bg-gradient-to-br from-[#1d1a18] to-[#0d0c0b] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#ec5cff]">
                  {selected.collection_name}
                </p>
                <h2 className="mt-2 text-3xl font-black uppercase leading-none text-white md:text-4xl">
                  {selected.collection_symbol} #{selected.id}
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

            <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_0.95fr]">
              <div>
                <div className="aspect-square overflow-hidden bg-black shadow-[0_8px_30px_rgba(236,92,255,0.15)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.image}
                    alt={selected.name}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void downloadJpeg(selected)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:border-[#53c7ff] hover:bg-[#53c7ff]/15 hover:text-[#53c7ff]"
                >
                  <Download className="h-3.5 w-3.5" /> Save image
                </button>
              </div>

              <div className="flex flex-col">
                <div className="flex gap-5 border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.2em]">
                  {(["traits", "details"] as DetailTab[]).map((item) => (
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
                  <div className="mt-5 grid gap-x-8 md:grid-cols-2">
                    {selectedTraits.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.16em]"
                      >
                        <span className="text-white/35">{row.label}</span>
                        <span className="text-right font-black text-white">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {tab === "details" ? (
                  <div className="mt-5 grid gap-0">
                    {([
                      ["Owner", selected.owner],
                      ["Status", selected.status],
                      ["Token mint", selected.token_mint],
                      ["Asset", selected.peg_record],
                    ] as Array<[string, string | null]>).map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-4 border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.16em]"
                      >
                        <span className="text-white/35">{label}</span>
                        <span className="max-w-[68%] truncate text-right font-black text-white" title={value || ""}>
                          {formatDetailValue(label, value)}
                        </span>
                      </div>
                    ))}
                    <div className="mt-4 inline-flex items-center gap-2 border border-[#53c7ff]/30 bg-[#53c7ff]/5 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#53c7ff]/80">
                      <span>Metaplex Core asset</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
