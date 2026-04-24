"use client";

import { Construction } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";

/**
 * Shown when NEXT_PUBLIC_STUDIO_COMING_SOON is not "false".
 * Set NEXT_PUBLIC_STUDIO_COMING_SOON=false in .env to work on the full studio UI.
 */
export function StudioComingSoon() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen noise relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-80" />
      <div className="absolute inset-0 tech-grid opacity-25" />
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-20">
        <div
          className={clsx(
            "max-w-md rounded-2xl border p-8 text-center shadow-xl backdrop-blur-sm",
            theme === "dark" ? "border-white/[0.08] bg-white/[0.03]" : "border-gray-200 bg-white/90"
          )}
        >
          <div
            className={clsx(
              "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl",
              theme === "dark" ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-600"
            )}
          >
            <Construction className="h-7 w-7" />
          </div>
          <h1
            className={clsx(
              "mt-5 font-mono text-xl font-semibold tracking-tight",
              theme === "dark" ? "text-white" : "text-gray-900"
            )}
          >
            Coming soon
          </h1>
          <p className={clsx("mt-2 text-sm leading-relaxed", theme === "dark" ? "text-gray-400" : "text-gray-600")}>
            The studio is not available yet. We are building the experience; check back later.
          </p>
        </div>
      </div>
    </div>
  );
}
