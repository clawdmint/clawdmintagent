import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { CpegLaunchpad } from "@/components/cpeg-launchpad";
import { CPEG_SITE_HEADER, cpegPublicPaths } from "@/lib/cpeg-site-paths";

export const dynamic = "force-dynamic";

export default function CpegLaunchPage() {
  const site = headers().get(CPEG_SITE_HEADER) === "1";
  const urls = cpegPublicPaths(site);

  return (
    <div className="flex flex-col">
      <section className="border-b border-neutral-200 dark:border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-10 md:px-10 md:py-14">
          <Link
            href={urls.home}
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-neutral-700 transition hover:text-[#53c7ff] dark:text-white/55"
          >
            <ArrowLeft className="h-3 w-3" /> Back to cPEG
          </Link>
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.28em] text-[#53c7ff]">
            ClawPEG / Launch
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black uppercase leading-[0.94] text-neutral-950 dark:text-[#f7f2df] md:text-6xl">
            Prepare Agent PEGs.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-600 dark:text-white/65 md:text-base">
            Pick a subject and palette, then bind cPEG to your verified Metaplex Agent root and
            existing agent token.
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-6 text-neutral-500 dark:text-white/45">
            The first step saves the Hybrid setup plan. The next steps create and fund the Core
            PEG collection so capture and release can map whole agent token units to Agent PEG
            identities.
          </p>
        </div>
      </section>

      <CpegLaunchpad />
    </div>
  );
}
