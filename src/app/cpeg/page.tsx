import Link from "next/link";
import { headers } from "next/headers";
import {
  ArrowUpRight,
  Coins,
  Flame,
  ImageOff,
  Layers,
  Rocket,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { renderClawPegSvg } from "@/lib/clawpeg-renderer";
import { truncateAddress } from "@/lib/cpeg-ui";
import { CpegRelativeTime } from "@/components/cpeg-relative-time";
import { CpegFlowAnimation } from "@/components/cpeg-flow-animation";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";

export const dynamic = "force-dynamic";

const lobster = "\u{1F99E}";

const sampleMint = "cPEG111111111111111111111111111111111111111";
const heroAccessories = ["wizard_hat", "fire_mohawk", "gold_chain", "crown", "samurai_helm", "headphones"];
const heroPalettes = ["claw", "shadow", "volcanic", "gold", "cyber", "emerald"];
const heroBackgrounds = ["stars", "solid", "horizon", "vignette", "dust", "grid"];
const heroSamples = [11, 23, 47, 69, 88, 142].map((pegId, index) => ({
  pegId,
  svg: renderClawPegSvg({
    rendererId: "clawpeg-agent-pixel",
    rendererVersion: "0.3.0",
    collectionSeed: "0f0e0d0c0b0a09080706050403020100fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0",
    tokenMint: sampleMint,
    pegId,
    params: {
      subject: "ape",
      palette: heroPalettes[index % heroPalettes.length],
      accessory: heroAccessories[index % heroAccessories.length],
      background: heroBackgrounds[index % heroBackgrounds.length],
      vibe: "balanced",
    },
  }),
}));

interface GlobalStats {
  total_launches: number;
  active_listings: number;
  filled_listings: number;
  distinct_sellers: number;
  distinct_buyers: number;
  floor_lamports: string | null;
  floor_sol: string | null;
  volume_lamports: string;
  volume_sol: string;
  identity_modes?: Record<string, number>;
}

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
  const [statsBody, launchesBody, activityBody] = await Promise.all([
    fetchJson<{ success: boolean; stats: GlobalStats }>("/api/cpeg/stats", ctx.baseUrl),
    fetchJson<{ success: boolean; launches: LaunchRow[] }>("/api/cpeg?limit=9", ctx.baseUrl),
    fetchJson<{ success: boolean; events: ActivityEvent[] }>("/api/cpeg/activity?limit=14", ctx.baseUrl),
  ]);

  const stats = statsBody?.stats;
  const launches = launchesBody?.launches || [];
  const events = activityBody?.events || [];

  const featured = launches
    .filter((launch) => launch.collection_address || launch.standard_mode === "metaplex_hybrid")
    .slice(0, 6);

  const statCells: Array<{ label: string; value: string; accent: string; icon: typeof Coins }> = [
    {
      label: "Floor",
      value: stats?.floor_sol ? `${stats.floor_sol} SOL` : "--",
      accent: "text-[#53c7ff]",
      icon: Coins,
    },
    {
      label: "Volume",
      value: stats ? `${stats.volume_sol} SOL` : "0 SOL",
      accent: "text-neutral-900 dark:text-[#f7f2df]",
      icon: Flame,
    },
    {
      label: "Listings",
      value: stats ? stats.active_listings.toLocaleString() : "0",
      accent: "text-neutral-900 dark:text-[#f7f2df]",
      icon: Layers,
    },
    {
      label: "Trades",
      value: stats ? stats.filled_listings.toLocaleString() : "0",
      accent: "text-neutral-900 dark:text-[#f7f2df]",
      icon: Sparkles,
    },
  ];

  return (
    <div className="flex flex-col">
      {/* ─────────────── HERO ─────────────── */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-80 dark:hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 30%, rgba(83,199,255,0.12), transparent 55%), radial-gradient(circle at 82% 0%, rgba(38,38,38,0.06), transparent 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden opacity-50 dark:block"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 30%, rgba(83,199,255,0.18), transparent 55%), radial-gradient(circle at 82% 0%, rgba(247,242,223,0.06), transparent 60%)",
          }}
        />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-[1fr_460px] md:gap-10 md:px-10 md:py-24">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#53c7ff]">
              <span aria-hidden>{lobster}</span> Built on Metaplex / Solana
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black uppercase leading-[0.92] text-neutral-950 dark:text-[#f7f2df] md:text-7xl">
              The token is the PEG.
              <span className="block text-[#53c7ff]">No mint required.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-700 dark:text-white/72 md:text-lg">
              Hold the agent token, get the identity. Every cPEG is a Metaplex Core asset
              tied to a fixed amount of backing tokens — capture it, release it, or trade it.
              Art is generated on-chain, not hosted.
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
                <ShoppingBag className="h-4 w-4" /> Explore market
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {heroSamples.map((sample) => (
              <div
                key={sample.pegId}
                className="border border-neutral-300 dark:border-white/15 bg-neutral-50 dark:bg-white/[0.02] p-2 transition hover:border-[#53c7ff]/60"
              >
                <div className="aspect-square w-full" dangerouslySetInnerHTML={{ __html: sample.svg }} />
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                  PEG #{sample.pegId}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto -mt-2 max-w-7xl px-5 pb-14 md:px-10 md:pb-16">
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-200/40 dark:bg-white/5 md:grid-cols-4">
            {statCells.map((cell) => {
              const Icon = cell.icon;
              return (
                <div key={cell.label} className="bg-neutral-100 p-5 dark:bg-[#0c0c0c]">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-neutral-400 dark:text-white/30" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-white/40">
                      {cell.label}
                    </p>
                  </div>
                  <p className={`mt-3 text-2xl font-black tracking-tight ${cell.accent}`}>{cell.value}</p>
                </div>
              );
            })}
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
                Every list, sale, and delisting across the cPEG market — in real time.
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
                No activity yet — be the first to list
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
            Three Metaplex programs working together — one product. Your token mints with
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
              instantly — no backing tokens needed.
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
