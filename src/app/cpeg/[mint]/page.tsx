import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { CpegCollectionClient } from "@/components/cpeg-collection-client";
import { CpegContractBar } from "@/components/cpeg-contract-bar";
import { prisma } from "@/lib/db";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";

interface CpegCollectionPageProps {
  params: {
    mint: string;
  };
}

export const dynamic = "force-dynamic";

export default async function CpegCollectionPage({ params }: CpegCollectionPageProps) {
  const launch = await prisma.clawPegLaunch.findUnique({
    where: { tokenMint: params.mint },
    select: {
      name: true,
      symbol: true,
      tokenMint: true,
      collectionAddress: true,
      hookValidationAddress: true,
      cluster: true,
      pegUnitRaw: true,
      maxPegs: true,
      authorityAddress: true,
      status: true,
      rendererId: true,
      rendererVersion: true,
    },
  });

  if (!launch?.collectionAddress || !launch.hookValidationAddress) {
    notFound();
  }

  const site = headers().get(CPEG_SITE_HEADER) === "1";
  const urls = cpegPublicPaths(site);

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-80 dark:hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 25%, rgba(83,199,255,0.12), transparent 55%), radial-gradient(circle at 80% 0%, rgba(38,38,38,0.06), transparent 60%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden opacity-60 dark:block"
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 25%, rgba(83,199,255,0.18), transparent 55%), radial-gradient(circle at 80% 0%, rgba(247,242,223,0.06), transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
          <Link
            href={urls.home}
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral-700 transition hover:text-[#53c7ff] dark:text-white/55"
          >
            <ArrowLeft className="h-3 w-3" /> All cPEGs
          </Link>

          <div className="mt-8 grid gap-10 md:grid-cols-[1fr_360px] md:gap-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">
                {launch.name} / {launch.cluster.toUpperCase()}
              </p>
              <h1 className="mt-4 text-5xl font-black uppercase leading-none text-neutral-950 dark:text-[#f7f2df] md:text-7xl">
                Every token. A cPEG.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-600 dark:text-white/65 md:text-base">
                Hold one whole {launch.symbol} token and own one numbered cPEG. Sell or send
                the token and the identity moves with it.
              </p>

              <div className="mt-7">
                <CpegContractBar
                  tokenMint={launch.tokenMint}
                  cluster={launch.cluster}
                  symbol={launch.symbol}
                />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="border border-neutral-200 bg-neutral-100/95 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                    Max PEGs
                  </p>
                  <p className="mt-1 text-lg font-black tracking-tight">
                    {launch.maxPegs.toLocaleString()}
                  </p>
                </div>
                <div className="border border-neutral-200 bg-neutral-100/95 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                    Renderer
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-[#53c7ff]">
                    {launch.rendererId || "clawpeg"}
                  </p>
                  <p className="font-mono text-[10px] text-neutral-500 dark:text-white/40">
                    v{launch.rendererVersion || "0.1.0"}
                  </p>
                </div>
                <div className="border border-neutral-200 bg-neutral-100/95 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                    Cluster
                  </p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tight">{launch.cluster}</p>
                </div>
                <div className="border border-neutral-200 bg-neutral-100/95 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-white/40">
                    Status
                  </p>
                  <p className="mt-1 text-lg font-black uppercase tracking-tight">{launch.status}</p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href={urls.market({ mint: launch.tokenMint })}
                  className="inline-flex items-center gap-2 border border-[#f7f2df] bg-[#f7f2df] px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-[#53c7ff]"
                >
                  <Sparkles className="h-4 w-4" /> Open P2P market
                </Link>
                <Link
                  href={urls.launch}
                  className="inline-flex items-center gap-2 border border-neutral-300 px-5 py-3 text-sm font-bold uppercase tracking-wide text-neutral-700 transition hover:border-[#53c7ff] hover:text-[#53c7ff] dark:border-white/15 dark:text-white/72"
                >
                  <ShieldCheck className="h-4 w-4" /> Launch your own
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[1, 7, 23, 47, 88, 142].map((pegId) => (
                <div
                  key={pegId}
                  className="aspect-square overflow-hidden border border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-black"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/cpeg/${launch.tokenMint}/pegs/${pegId}/svg`}
                    alt={`${launch.symbol} cPEG #${pegId}`}
                    className="h-full w-full object-cover [image-rendering:pixelated]"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-10">
        <CpegCollectionClient
          launch={{
            name: launch.name,
            symbol: launch.symbol,
            tokenMint: launch.tokenMint,
            collectionAddress: launch.collectionAddress,
            hookValidationAddress: launch.hookValidationAddress,
            cluster: launch.cluster,
            pegUnitRaw: launch.pegUnitRaw,
            maxPegs: launch.maxPegs,
            authorityAddress: launch.authorityAddress,
          }}
        />
      </section>
    </div>
  );
}
