import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";
import { CPEG_STANDARD_MODE_METAPLEX_HYBRID } from "@/lib/cpeg-metaplex-hybrid";
import { CpegHybridPanel } from "@/components/cpeg-hybrid-panel";
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
    <div className="min-h-screen bg-[#070707] text-[#f7f2df]">
      <div className="mx-auto max-w-5xl px-5 pb-20 pt-12 md:px-10">
        <Link
          href={urls.home}
          className="font-mono text-xs uppercase tracking-[0.18em] text-white/55 transition hover:text-[#53c7ff]"
        >
          cPEG
        </Link>
        <h1 className="mt-6 text-5xl font-black uppercase leading-[0.95] md:text-7xl">
          {launch.name}
        </h1>
        <p className="mt-4 max-w-2xl font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
          {launch.symbol} · {truncateAddress(launch.tokenMint, 6, 6)} · {launch.cluster}
        </p>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65">
          Convert the agent token into deterministic Metaplex Core cPEG identities. Each cPEG is
          backed by a fixed token amount, so token supply and collection capacity move together.
        </p>

        <div className="mt-10">
          <CpegHybridPanel
            tokenMint={launch.tokenMint}
            initialAuthorityAddress={launch.authorityAddress}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`${urls.explore}?mint=${encodeURIComponent(launch.tokenMint)}`}
            className="inline-flex items-center gap-2 border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
          >
            View gallery
          </Link>
          <a
            href={`https://www.metaplex.com/token/${launch.tokenMint}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-[#53c7ff]/40 bg-[#53c7ff]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#53c7ff] transition hover:bg-[#53c7ff]/20"
          >
            Buy token
          </a>
          <Link
            href={urls.market({ mint: launch.tokenMint })}
            className="inline-flex items-center gap-2 border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/65 transition hover:border-[#53c7ff] hover:text-[#53c7ff]"
          >
            Open market
          </Link>
        </div>
      </div>
    </div>
  );
}
