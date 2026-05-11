import Link from "next/link";
import { headers } from "next/headers";
import { ArrowUpRight, ImageOff, Rocket, ShoppingBag } from "lucide-react";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";
import { truncateAddress } from "@/lib/cpeg-ui";
import { CpegRelativeTime } from "@/components/cpeg-relative-time";
import { CpegFlowAnimation } from "@/components/cpeg-flow-animation";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";

export const dynamic = "force-dynamic";

const lobster = "\u{1F99E}";

const sampleMint = "cPEG111111111111111111111111111111111111111";
const heroSamples = [11, 23, 47, 69, 88, 142].map((pegId) => ({
  pegId,
  svg: renderClawPegSvg({
    rendererId: "clawpeg-agent-pixel",
    rendererVersion: "0.3.0",
    collectionSeed: "0f0e0d0c0b0a09080706050403020100fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0",
    tokenMint: sampleMint,
    pegId,
    params: {
      subject: "ape",
      palette: "auto",
      accessory: "auto",
      background: "auto",
      vibe: "auto",
    },
  }),
}));

interface LaunchRow {
  id: string;
  name: string;
  symbol: string;
  token_mint: string;
  collection_address: string | null;
  cluster: string;
  max_pegs: number;
  status: string;
  standard_mode?: string;
  agent_token_mint?: string | null;
  hybrid_status?: string | null;
  identity_mode?: string;
  canonical_root?: string | null;
  agent_asset_address?: string | null;
  agent_identity_pda?: string | null;
  is_sealed?: boolean;
  market: {
    active_listings: number;
    filled_listings: number;
    floor_sol: string | null;
    volume_sol: string;
  };
  preview_image: string;
}

interface ActivityEvent {
  id: string;
  kind: "ACTIVE" | "FILLED" | "CANCELLED";
  peg_id: number;
  token_mint: string;
  collection_name: string | null;
  collection_symbol: string | null;
  price_sol: string;
  seller: string;
  buyer: string | null;
  tx: string | null;
  at: string;
  image: string;
}

function requestContext(): { baseUrl: string; isCpegSite: boolean } {
  try {
    const h = headers();
    const protocol = h.get("x-forwarded-proto") || "http";
    const host = h.get("host");
    const fallback = process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000";
    return {
      baseUrl: host ? `${protocol}://${host}` : fallback,
      isCpegSite: h.get(CPEG_SITE_HEADER) === "1",
    };
  } catch {
    return {
      baseUrl: process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000",
      isCpegSite: false,
    };
  }
}

async function fetchJson<T>(path: string, baseUrl: string): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function CpegPage() {
  const ctx = requestContext();
  const urls = cpegPublicPaths(ctx.isCpegSite);
  const [launchesBody, activityBody] = await Promise.all([
    fetchJson<{ success: boolean; launches: LaunchRow[] }>("/api/cpeg?limit=9", ctx.baseUrl),
    fetchJson<{ success: boolean; events: ActivityEvent[] }>("/api/cpeg/activity?limit=14", ctx.baseUrl),
  ]);

  const launches = launchesBody?.launches || [];
  const events = activityBody?.events || [];

  const featured = launches
    .filter((launch) => launch.collection_address || launch.standard_mode === "metaplex_hybrid")
    .slice(0, 6);

  return (
    <div className="flex flex-col">
      {/* ─────────────── HERO ─────────────── */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-80 dark:hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 30%, rgba(83,199,255,0.14), transparent 55%), radial-gradient(circle at 82% 5%, rgba(236,92,255,0.08), transparent 55%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden opacity-65 dark:block"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 30%, rgba(83,199,255,0.22), transparent 55%), radial-gradient(circle at 82% 8%, rgba(236,92,255,0.16), transparent 55%), radial-gradient(circle at 50% 100%, rgba(247,201,72,0.06), transparent 50%)",
          }}
        />
        {/* faint dotted grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] dark:opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(circle at 50% 40%, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 40%, black 30%, transparent 80%)",
          }}
        />

        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-[1.1fr_460px] md:gap-10 md:px-10 md:py-24">
          <div className="relative">
            <div className="inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.26em] text-[#53c7ff]">
              <span className="cpeg-hero-live relative inline-flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-block h-2 w-2 rounded-full bg-[#53c7ff]/55" />
                <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#53c7ff]" />
              </span>
              Live on Solana mainnet
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black uppercase leading-[0.9] text-neutral-950 dark:text-[#f7f2df] md:text-7xl">
              Every token
              <span className="block text-[#53c7ff]">gets a face.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-700 dark:text-white/72 md:text-lg">
              Token-backed Metaplex Core identities on Solana. Hold the agent token, mint
              its on-chain face. Capture is reversible. Identities are tradeable. Art is
              generated on-chain, never hosted.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={urls.launch}
                className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
              >
                <Rocket className="h-4 w-4" /> Launch cPEG
              </Link>
              <Link
                href={urls.market()}
                className="inline-flex items-center gap-2 border border-neutral-400 dark:border-white/25 px-5 py-3 text-sm font-black uppercase tracking-wide text-neutral-900 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:text-white"
              >
                <ShoppingBag className="h-4 w-4" /> cPEG Market
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-l-2 border-[#53c7ff]/60 pl-4 font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-500 dark:text-white/45">
              <span>Metaplex Core</span>
              <span className="opacity-40">/</span>
              <span>MPL Hybrid</span>
              <span className="opacity-40">/</span>
              <span>Genesis</span>
            </div>
          </div>

          {/* cinematic PEG showcase */}
          <div className="relative h-[420px] md:h-[460px]">
            <style>{`
              @keyframes cpegHeroFloat1 {
                0%, 100% { transform: translate(0, 0) rotate(-3deg); }
                50% { transform: translate(0, -10px) rotate(-3deg); }
              }
              @keyframes cpegHeroFloat2 {
                0%, 100% { transform: translate(0, 0) rotate(2deg); }
                50% { transform: translate(0, -7px) rotate(2deg); }
              }
              @keyframes cpegHeroFloat3 {
                0%, 100% { transform: translate(0, 0) rotate(-1deg); }
                50% { transform: translate(0, -12px) rotate(-1deg); }
              }
              @keyframes cpegHeroFloatHero {
                0%, 100% { transform: translate(0, 0); }
                50% { transform: translate(0, -6px); }
              }
              @keyframes cpegHeroPulse {
                0%, 100% { transform: scale(0.9); opacity: 0.45; }
                50% { transform: scale(2.2); opacity: 0; }
              }
              .cpeg-hero-card-1 { animation: cpegHeroFloat1 6s ease-in-out infinite; }
              .cpeg-hero-card-2 { animation: cpegHeroFloat2 7s ease-in-out infinite; }
              .cpeg-hero-card-3 { animation: cpegHeroFloat3 5.5s ease-in-out infinite; }
              .cpeg-hero-card-main { animation: cpegHeroFloatHero 5s ease-in-out infinite; }
              .cpeg-hero-live span:first-child { animation: cpegHeroPulse 2.2s ease-out infinite; }
              @media (prefers-reduced-motion: reduce) {
                .cpeg-hero-card-1, .cpeg-hero-card-2, .cpeg-hero-card-3, .cpeg-hero-card-main, .cpeg-hero-live span:first-child {
                  animation: none !important;
                }
              }
            `}</style>

            {/* radial glow behind cards */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 55%, rgba(83,199,255,0.22), transparent 55%)",
              }}
            />

            {/* back-left card */}
            <div className="cpeg-hero-card-1 absolute left-0 top-6 w-[40%] border border-neutral-300/70 bg-neutral-50/90 p-2 shadow-[0_18px_60px_-30px_rgba(83,199,255,0.5)] backdrop-blur-sm dark:border-white/15 dark:bg-white/[0.04]">
              <div className="aspect-square w-full" dangerouslySetInnerHTML={{ __html: heroSamples[0].svg }} />
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                <span>#{heroSamples[0].pegId}</span>
                <span className="text-[#53c7ff]">Pool</span>
              </div>
            </div>

            {/* back-right card */}
            <div className="cpeg-hero-card-2 absolute right-0 top-2 w-[40%] border border-neutral-300/70 bg-neutral-50/90 p-2 shadow-[0_18px_60px_-30px_rgba(236,92,255,0.5)] backdrop-blur-sm dark:border-white/15 dark:bg-white/[0.04]">
              <div className="aspect-square w-full" dangerouslySetInnerHTML={{ __html: heroSamples[1].svg }} />
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                <span>#{heroSamples[1].pegId}</span>
                <span className="text-[#ec5cff]">Listed</span>
              </div>
            </div>

            {/* main focal card */}
            <div className="cpeg-hero-card-main absolute left-1/2 top-1/2 w-[58%] -translate-x-1/2 -translate-y-1/2 border-2 border-[#53c7ff]/55 bg-neutral-50 p-3 shadow-[0_28px_80px_-20px_rgba(83,199,255,0.7)] dark:bg-[#0c0c0c]">
              <div className="absolute -top-3 left-3 inline-flex items-center gap-1.5 border border-[#53c7ff]/60 bg-[#0c0c0c] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[#53c7ff]">
                <span className="cpeg-hero-live relative inline-flex h-1.5 w-1.5 items-center justify-center">
                  <span className="absolute inline-block h-1.5 w-1.5 rounded-full bg-[#53c7ff]/55" />
                  <span className="relative inline-block h-1 w-1 rounded-full bg-[#53c7ff]" />
                </span>
                Identity
              </div>
              <div className="aspect-square w-full" dangerouslySetInnerHTML={{ __html: heroSamples[2].svg }} />
              <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em]">
                <span className="text-neutral-500 dark:text-white/55">cPEG #{heroSamples[2].pegId}</span>
                <span className="font-black text-neutral-950 dark:text-[#f7f2df]">Backed</span>
              </div>
            </div>

            {/* bottom-left card */}
            <div className="cpeg-hero-card-3 absolute bottom-2 left-2 w-[34%] border border-neutral-300/70 bg-neutral-50/90 p-2 shadow-[0_18px_60px_-30px_rgba(247,201,72,0.5)] backdrop-blur-sm dark:border-white/15 dark:bg-white/[0.04]">
              <div className="aspect-square w-full" dangerouslySetInnerHTML={{ __html: heroSamples[3].svg }} />
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                <span>#{heroSamples[3].pegId}</span>
                <span className="text-[#f7c948]">Trade</span>
              </div>
            </div>

            {/* bottom-right card */}
            <div className="cpeg-hero-card-1 absolute bottom-0 right-3 w-[34%] border border-neutral-300/70 bg-neutral-50/90 p-2 shadow-[0_18px_60px_-30px_rgba(83,199,255,0.4)] backdrop-blur-sm dark:border-white/15 dark:bg-white/[0.04]" style={{ animationDelay: "1.5s" }}>
              <div className="aspect-square w-full" dangerouslySetInnerHTML={{ __html: heroSamples[4].svg }} />
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                <span>#{heroSamples[4].pegId}</span>
                <span className="text-[#53c7ff]">Owned</span>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* ─────────────── FEATURED COLLECTIONS ─────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
              Featured
            </p>
            <h2 className="mt-3 text-3xl font-black uppercase text-neutral-950 dark:text-[#f7f2df] md:text-4xl">
              Live collections
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-700 dark:text-white/55">
              Live on Solana mainnet with deterministic on-chain art.
            </p>
          </div>
          <Link
            href={urls.market()}
            className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral-600 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:text-white/70"
          >
            See all <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {featured.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((launch) => (
              <Link
                key={launch.id}
                href={urls.collection(launch.token_mint)}
                className="group relative flex flex-col gap-4 border border-neutral-200 dark:border-white/10 bg-neutral-100/95 dark:bg-white/[0.03] p-5 transition hover:-translate-y-0.5 hover:border-[#53c7ff]/60 hover:shadow-[0_8px_30px_rgba(83,199,255,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black uppercase tracking-tight">
                      {launch.name}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
                      ${launch.symbol}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff]">
                    {launch.max_pegs.toLocaleString()} max
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((peg) => (
                    <div
                      key={peg}
                      className="aspect-square overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200 dark:bg-black"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/cpeg/${launch.token_mint}/pegs/${peg}/svg`}
                        alt={`${launch.symbol} #${peg}`}
                        className="h-full w-full object-cover [image-rendering:pixelated]"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-neutral-200 dark:border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <div>
                    <p className="text-neutral-500 dark:text-white/35">Floor</p>
                    <p className="mt-1 text-sm font-black tracking-tight text-[#53c7ff]">
                      {launch.market.floor_sol ? `${launch.market.floor_sol} SOL` : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500 dark:text-white/35">Volume</p>
                    <p className="mt-1 text-sm font-black tracking-tight text-neutral-900 dark:text-[#f7f2df]">
                      {launch.market.volume_sol} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500 dark:text-white/35">Listed</p>
                    <p className="mt-1 text-sm font-black tracking-tight text-neutral-700 dark:text-white/72">
                      {launch.market.active_listings.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span
                    className="truncate font-mono text-[10px] tracking-tight text-neutral-500 dark:text-white/45"
                    title={launch.token_mint}
                  >
                    {launch.token_mint.slice(0, 6)}…{launch.token_mint.slice(-6)}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-700 dark:text-white/55">
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:text-[#53c7ff]" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 border border-dashed border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] py-14 text-center">
            <ImageOff className="h-6 w-6 text-neutral-400 dark:text-white/30" />
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
              No collections yet
            </p>
            <Link
              href={urls.launch}
              className="mt-1 inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
            >
              <Rocket className="h-3.5 w-3.5" /> Be the first
            </Link>
          </div>
        )}
      </section>

      {/* ─────────────── RECENT ACTIVITY ─────────────── */}
      <section className="border-y border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#53c7ff]">
                Live feed
              </p>
              <h2 className="mt-2 text-3xl font-black uppercase text-neutral-950 dark:text-[#f7f2df] md:text-4xl">
                Recent activity
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-700 dark:text-white/55">
                Every list, sale, and delisting across the cPEG market, in real time.
              </p>
            </div>
            <Link
              href={urls.market()}
              className="inline-flex items-center gap-2 border border-neutral-300 dark:border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:text-white/55"
            >
              Open market <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {events.length > 0 ? (
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {events.slice(0, 14).map((event) => {
                const kindLabel =
                  event.kind === "FILLED" ? "Sold" : event.kind === "CANCELLED" ? "Delisted" : "Listed";
                const kindStyle =
                  event.kind === "FILLED"
                    ? "border-[#53c7ff]/40 bg-[#53c7ff]/10 text-[#53c7ff]"
                    : event.kind === "CANCELLED"
                    ? "border-neutral-300 bg-neutral-200/60 text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-white/45"
                    : "border-[#ec5cff]/35 bg-[#ec5cff]/10 text-[#ec5cff]";
                return (
                  <Link
                    key={event.id}
                    href={urls.collection(event.token_mint)}
                    className="group flex items-center gap-4 border border-neutral-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-[#53c7ff]/40 hover:shadow-[0_4px_18px_rgba(83,199,255,0.08)] dark:border-white/10 dark:bg-[#0f0f0f]"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden border border-neutral-200 bg-neutral-200 dark:border-white/10 dark:bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={event.image}
                        alt={`${event.collection_symbol || "PEG"} #${event.peg_id}`}
                        className="h-full w-full object-cover [image-rendering:pixelated]"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.2em] ${kindStyle}`}
                        >
                          {kindLabel}
                        </span>
                        <span className="truncate font-bold uppercase tracking-tight text-neutral-900 dark:text-white/90">
                          {event.collection_symbol || truncateAddress(event.token_mint)} #{event.peg_id}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500 dark:text-white/40">
                        {event.kind === "FILLED" && event.buyer
                          ? `${truncateAddress(event.buyer)} ← ${truncateAddress(event.seller)}`
                          : truncateAddress(event.seller)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-base font-black tracking-tight text-[#53c7ff]">
                        {event.price_sol} <span className="text-xs text-neutral-500 dark:text-white/40">SOL</span>
                      </span>
                      <CpegRelativeTime
                        iso={event.at}
                        className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500 dark:text-white/40"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-8 border border-dashed border-neutral-200 bg-neutral-50 p-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                No activity yet, be the first to list
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ─────────────── HOW IT WORKS ─────────────── */}
      <section id="standard" className="mx-auto max-w-7xl px-5 py-20 md:px-10">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-black uppercase text-neutral-950 dark:text-[#f7f2df] md:text-5xl">
            Token-backed identity.
          </h2>
          <p className="mt-4 text-base leading-7 text-neutral-700 dark:text-white/60">
            Three Metaplex programs working together as one product. Your token mints with
            Genesis, your collection lives in Core, and Hybrid handles the swap between
            them.
          </p>
        </div>

        <div className="mt-10">
          <CpegFlowAnimation />
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <div className="group border border-neutral-200 bg-neutral-100/95 p-7 transition hover:-translate-y-1 hover:border-[#53c7ff]/60 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="font-mono text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">01 / Capture</div>
            <h3 className="mt-3 text-2xl font-black uppercase">Hold to mint</h3>
            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/62">
              Lock a fixed amount of the agent token and receive one cPEG identity. The
              backing tokens stay safe in escrow.
            </p>
          </div>
          <div className="group border border-neutral-200 bg-neutral-100/95 p-7 transition hover:-translate-y-1 hover:border-[#ec5cff]/60 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="font-mono text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">02 / Release</div>
            <h3 className="mt-3 text-2xl font-black uppercase">Reverse anytime</h3>
            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/62">
              Return the cPEG to escrow and reclaim the full backing amount. Identities
              re-enter the pool for the next holder.
            </p>
          </div>
          <div className="group border border-neutral-200 bg-neutral-100/95 p-7 transition hover:-translate-y-1 hover:border-[#f7c948]/60 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="font-mono text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">03 / Trade</div>
            <h3 className="mt-3 text-2xl font-black uppercase">Or sell directly</h3>
            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/62">
              List a captured cPEG on the marketplace. Buyers pay in SOL, sellers exit
              instantly, no backing tokens needed.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 border-l-2 border-[#53c7ff] pl-5 font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">
          <span>Powered by</span>
          <span className="text-neutral-900 dark:text-[#f7f2df]">Metaplex Core</span>
          <span className="opacity-50">·</span>
          <span className="text-neutral-900 dark:text-[#f7f2df]">MPL Hybrid</span>
          <span className="opacity-50">·</span>
          <span className="text-neutral-900 dark:text-[#f7f2df]">Genesis</span>
        </div>
      </section>
    </div>
  );
}
