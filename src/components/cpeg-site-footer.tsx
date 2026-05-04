"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { ExternalLink } from "lucide-react";
import { useTheme } from "./theme-provider";

const MAIN_URL = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
const lobster = "\u{1F99E}";

export function CpegSiteFooter() {
  const { theme } = useTheme();

  return (
    <footer className="mt-auto">
      <div
        className={clsx(
          "border-t",
          theme === "dark"
            ? "border-white/[0.06] bg-[#0a0a0a]/90"
            : "border-neutral-200 bg-white/90"
        )}
      >
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-10 text-center sm:flex-row sm:text-left">
          <div>
            <p
              className={clsx(
                "font-mono text-[10px] uppercase tracking-[0.28em]",
                theme === "dark" ? "text-cyan-500/80" : "text-cyan-600/80"
              )}
            >
              Clawdmint sidecar
            </p>
            <p className={clsx("mt-2 text-sm font-bold", theme === "dark" ? "text-white/85" : "text-gray-900")}>
              {lobster} Claw + JPEG = cPEG
            </p>
            <p className={clsx("mt-1 max-w-md text-xs", theme === "dark" ? "text-white/45" : "text-gray-500")}>
              Token-2022 units with on-chain PEG identity. Same brand line as Clawdmint, focused for cPEG
              for the standard.
            </p>
          </div>
          <Link
            href={MAIN_URL}
            target="_blank"
            rel="noreferrer"
            className={clsx(
              "inline-flex items-center gap-2 border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] transition",
              theme === "dark"
                ? "border-white/15 text-white/72 hover:border-cyan-500/40 hover:text-cyan-300"
                : "border-gray-200 text-gray-700 hover:border-cyan-300 hover:text-cyan-700"
            )}
          >
            Back to Clawdmint
            <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
          </Link>
        </div>
      </div>
    </footer>
  );
}
