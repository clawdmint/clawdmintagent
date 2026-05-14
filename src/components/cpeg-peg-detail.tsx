"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  ShoppingCart,
  Tag,
  XCircle,
} from "lucide-react";
import { truncateAddress } from "@/lib/cpeg-ui";

export interface CpegPegDetailViewProps {
  tokenMint: string;
  pegId: number;
  symbol: string;
  collectionName: string;
  backHref: string;
  marketHref: string;
  galleryHref: string;
  collectionHref: string;
}

interface CpegPegDetailPayload {
  id: number;
  name: string;
  token_mint: string;
  collection_address: string | null;
  peg_record: string | null;
  asset_address?: string | null;
  minted: boolean;
  owner: string | null;
  status: string | null;
  on_chain_seed: string | null;
  minted_slot: string | null;
  transferred_slot: string | null;
  burned_slot: string | null;
  image: string;
  traits: Record<string, string | number | boolean | null>;
}

interface ActiveListingSummary {
  id: string;
  price_sol: string;
  price_lamports: string;
  seller: string;
  listing_address: string;
}

type DetailTab = "info" | "traits" | "details";

function formatProvenanceValue(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Pending";
  const str = String(value);
  if (label === "Minted" || label === "Last transfer") {
    const date = new Date(str);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  if (str.length > 22) return truncateAddress(str, 10, 8);
  return str;
}

const TRAIT_LABELS: Record<string, string> = {
  rarity: "Rarity",
  rank: "Rank",
  subject: "Subject",
  subject_label: "Subject (label)",
  style: "Style",
  palette: "Palette",
  background: "Background",
  pose: "Pose",
  accessory: "Accessory",
  accessory_label: "Accessory (label)",
  marking: "Marking",
  aura: "Aura",
  vibe: "Vibe",
  renderer: "Renderer",
  image_model: "Image model",
  canonical_source: "Canonical source",
};

function formatTraitLabel(key: string) {
  if (TRAIT_LABELS[key]) return TRAIT_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CpegPegDetail({
  tokenMint,
  pegId,
  symbol,
  collectionName,
  backHref,
  marketHref,
  galleryHref,
  collectionHref,
}: CpegPegDetailViewProps) {
  const [peg, setPeg] = useState<CpegPegDetailPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tab, setTab] = useState<DetailTab>("info");
  const [activeListing, setActiveListing] = useState<ActiveListingSummary | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/cpeg/${tokenMint}/pegs/${pegId}?format=cpeg`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; peg?: CpegPegDetailPayload; error?: string }
        | null;
      if (!response.ok || !body?.success || !body.peg) {
        setStatus("error");
        setErrorMessage(body?.error || "Failed to load PEG details.");
        return;
      }
      setPeg(body.peg);
      setStatus("ready");
    } catch (loadError) {
      setStatus("error");
      setErrorMessage(loadError instanceof Error ? loadError.message : "Failed to load PEG details.");
    }
  }, [tokenMint, pegId]);

  const refreshListing = useCallback(async () => {
    try {
      const response = await fetch(`/api/cpeg/${tokenMint}/market/listings?limit=240`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            listings?: Array<{
              id: string;
              listing_address: string;
              peg_id: number;
              price_sol: string;
              price_lamports: string;
              seller: string;
            }>;
          }
        | null;
      if (!response.ok || !body?.success || !Array.isArray(body.listings)) {
        setActiveListing(null);
        return;
      }
      const match = body.listings.find((row) => row.peg_id === pegId);
      setActiveListing(
        match
          ? {
              id: match.id,
              price_sol: match.price_sol,
              price_lamports: match.price_lamports,
              seller: match.seller,
              listing_address: match.listing_address,
            }
          : null
      );
    } catch {
      setActiveListing(null);
    }
  }, [tokenMint, pegId]);

  useEffect(() => {
    void refresh();
    void refreshListing();
  }, [refresh, refreshListing]);

  const traitRows = useMemo(() => {
    if (!peg?.traits) return [] as Array<{ label: string; value: string }>;
    return Object.entries(peg.traits)
      .filter(([key, value]) => key !== "seed" && value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({ label: formatTraitLabel(key), value: String(value) }));
  }, [peg]);

  const headerTitle = peg?.name || `${symbol} #${pegId}`;
  const imageSrc = peg?.image || `/api/cpeg/${tokenMint}/pegs/${pegId}/svg`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050608] text-[#f7f2df]">
      <div
        className="pointer-events-none absolute -top-40 left-1/3 h-[40rem] w-[40rem] -translate-x-1/2 opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #53c7ff 0%, transparent 60%)" }}
      />
      <div
        className="pointer-events-none absolute bottom-[-15rem] right-[-10rem] h-[36rem] w-[36rem] opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(circle, #f0a8ff 0%, transparent 60%)" }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={collectionHref}
              className="inline-flex items-center gap-2 border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
            >
              {symbol} collection <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href={galleryHref}
              className="inline-flex items-center gap-2 border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
            >
              Open gallery <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr]">
          <div className="relative aspect-square overflow-hidden border border-white/10 bg-black">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(83,199,255,0.18),transparent_55%)]" />
            <Image
              src={imageSrc}
              alt={headerTitle}
              width={720}
              height={720}
              unoptimized
              className="relative h-full w-full object-cover [image-rendering:pixelated]"
            />
          </div>

          <div className="flex flex-col">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              {collectionName} / cPEG
            </p>
            <h1 className="mt-1 text-4xl font-black uppercase tracking-tight text-white">{headerTitle}</h1>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.16em] text-white/40">
              PEG ID #{pegId}
              {peg?.owner ? ` / Owner ${truncateAddress(peg.owner, 6, 6)}` : ""}
            </p>

            {activeListing ? (
              <p className="mt-4 inline-flex w-fit items-center gap-2 border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-emerald-200">
                Listed for {activeListing.price_sol} SOL
              </p>
            ) : (
              <p className="mt-4 inline-flex w-fit items-center gap-2 border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-white/55">
                Not listed
              </p>
            )}

            <div className="mt-8 flex border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              {(["info", "traits", "details"] as DetailTab[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setTab(entry)}
                  className={`flex-1 px-2 pb-3 text-center transition ${
                    tab === entry ? "border-b border-[#53c7ff] text-white" : "hover:text-white/70"
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>

            <div className="min-h-[260px] pt-5">
              {tab === "info" ? (
                <div className="grid gap-0">
                  {[
                    ["Status", peg?.status || (activeListing ? "Listed" : "Owned")],
                    ["Owner", peg?.owner || "Pending"],
                    ["Asset", peg?.asset_address || peg?.peg_record || ""],
                    ["Collection", peg?.collection_address || ""],
                    ["Token mint", tokenMint],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.16em]"
                    >
                      <span className="text-white/35">{label}</span>
                      <span
                        className="max-w-[62%] truncate text-right font-black text-white"
                        title={String(value || "")}
                      >
                        {label === "Status" || !value
                          ? String(value || "Pending")
                          : truncateAddress(String(value), 10, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "traits" ? (
                traitRows.length ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                    {traitRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.14em]"
                      >
                        <span className="truncate text-white/35">{row.label}</span>
                        <span className="truncate font-black text-white">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : status === "loading" ? (
                  <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-white/35">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading traits
                  </p>
                ) : status === "error" ? (
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-rose-300/80">
                    Could not load traits {errorMessage ? `(${errorMessage})` : ""}
                  </p>
                ) : (
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/35">
                    No traits available for this peg
                  </p>
                )
              ) : null}

              {tab === "details" ? (
                <div className="grid gap-0">
                  {[
                    ["Owner", peg?.owner || "Pending"],
                    ["PEG record", peg?.peg_record || peg?.asset_address || ""],
                    ["Minted", peg?.minted_slot || "Pending"],
                    ["Last transfer", peg?.transferred_slot || "Pending"],
                    ["On-chain seed", peg?.on_chain_seed || ""],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 border-b border-white/10 py-3 font-mono text-[11px] uppercase tracking-[0.16em]"
                    >
                      <span className="text-white/35">{label}</span>
                      <span
                        className="max-w-[62%] truncate text-right font-black text-white"
                        title={String(value || "")}
                      >
                        {formatProvenanceValue(String(label), value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-auto grid gap-3 pt-8">
              {activeListing ? (
                <Link
                  href={marketHref}
                  className="inline-flex items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
                >
                  <ShoppingCart className="h-4 w-4" /> Buy on market
                </Link>
              ) : (
                <Link
                  href={`${marketHref}#list`}
                  className="inline-flex items-center justify-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
                >
                  <Tag className="h-4 w-4" /> List or release
                </Link>
              )}
              {status === "error" ? (
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center justify-center gap-2 border border-white/15 px-5 py-3 text-sm font-black uppercase tracking-wide text-white/55 transition hover:border-rose-300/40 hover:text-rose-200"
                >
                  <XCircle className="h-4 w-4" /> Retry load
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
