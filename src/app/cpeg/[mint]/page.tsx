import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";

interface CpegCollectionRedirectPageProps {
  params: {
    mint: string;
  };
}

export const dynamic = "force-dynamic";

export default function CpegCollectionRedirectPage({ params }: CpegCollectionRedirectPageProps) {
  const site = headers().get(CPEG_SITE_HEADER) === "1";
  const urls = cpegPublicPaths(site);
  redirect(urls.market({ mint: params.mint }));
}
