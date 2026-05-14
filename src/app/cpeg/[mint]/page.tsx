import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { CpegHybridPanel } from "@/components/cpeg-hybrid-panel";
import { CpegBondingCurve } from "@/components/cpeg-bonding-curve";
import { truncateAddress } from "@/lib/cpeg-ui";

interface CpegCollectionPageProps {
  params: {
    mint: string;
  };
}

export const dynamic = "force-dynamic";

export default async function CpegCollectionPage({ params }: CpegCollectionPageProps) {
  const site = headers().get(CPEG_SITE_HEADER) === "1";
  const urls = cpegPublicPaths(site);
  const launch = await prisma.clawPegLaunch
    .findUnique({
      where: { tokenMint: params.mint },
      select: {
        id: true,
        name: true,
        symbol: true,
        tokenMint: true,
        standardMode: true,
        hybridStatus: true,
        authorityAddress: true,
        cluster: true,
        collectionAddress: true,
      },
    })
    .catch(() => null);
  if (!launch) {
    notFound();
  }
  if (launch.standardMode !== CPEG_STANDARD_MODE_METAPLEX_HYBRID) {
    redirect(urls.market({ mint: params.mint }));
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050608] text-[#f7f2df]">
      <div
        className="pointer-events-none absolute -top-40 left-1/3 h-[40rem] w-[40rem] -translate-x-1/2 opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #53c7ff 0%, transparent 60%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/3 right-0 h-[35rem] w-[35rem] opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(circle, #ec5cff 0%, transparent 65%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-12 md:px-10 lg:px-14">
        <Link
          href={urls.home}
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 transition hover:text-[#53c7ff]"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#53c7ff]" />
          cPEG
        </Link>

        <header className="mt-8 border-b border-white/10 pb-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-7xl">
                {launch.name}
              </h1>
              <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.26em] text-white/45">
                <span className="text-[#9fe2ff]">{launch.symbol}</span>
                <span className="mx-2 text-white/20">|</span>
                {truncateAddress(launch.tokenMint, 6, 6)}
                <span className="mx-2 text-white/20">|</span>
                {launch.cluster}
              </p>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60">
                Buy the agent token, get cPEG with the fixed backing amount, release cPEG back to
                tokens, or trade exact cPEG identities on the market. Every action is settled
                through the Metaplex Hybrid escrow PDA.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`${urls.explore}?mint=${encodeURIComponent(launch.tokenMint)}`}
                className="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
              >
                View gallery
              </Link>
              <a
                href={`https://www.metaplex.com/token/${launch.tokenMint}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#53c7ff] transition hover:bg-[#53c7ff]/20"
              >
                Buy token
              </a>
              <Link
                href={urls.market({ mint: launch.tokenMint })}
                className="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
              >
                Open market
              </Link>
            </div>
          </div>
        </header>

        <div className="mt-10">
          <CpegHybridPanel
            tokenMint={launch.tokenMint}
            initialAuthorityAddress={launch.authorityAddress}
          />
        </div>

        <div className="mt-10">
          <CpegBondingCurve tokenMint={launch.tokenMint} />
        </div>
      </div>
    </div>
  );
}
