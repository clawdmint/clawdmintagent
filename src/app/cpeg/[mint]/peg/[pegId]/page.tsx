import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";
import { CpegPegDetail } from "@/components/cpeg-peg-detail";

interface CpegPegDetailPageProps {
  params: {
    mint: string;
    pegId: string;
  };
}

export const dynamic = "force-dynamic";

export default async function CpegPegDetailPage({ params }: CpegPegDetailPageProps) {
  const pegId = Number(params.pegId);
  if (!Number.isInteger(pegId) || pegId < 1) {
    notFound();
  }

  const launch = await prisma.clawPegLaunch
    .findUnique({
      where: { tokenMint: params.mint },
      select: { tokenMint: true, name: true, symbol: true },
    })
    .catch(() => null);
  if (!launch) {
    notFound();
  }

  const site = headers().get(CPEG_SITE_HEADER) === "1";
  const urls = cpegPublicPaths(site);

  return (
    <CpegPegDetail
      tokenMint={launch.tokenMint}
      pegId={pegId}
      symbol={launch.symbol}
      collectionName={launch.name}
      backHref={urls.collection(launch.tokenMint)}
      marketHref={urls.market({ mint: launch.tokenMint })}
      galleryHref={`${urls.explore}?mint=${launch.tokenMint}`}
      collectionHref={urls.collection(launch.tokenMint)}
    />
  );
}
