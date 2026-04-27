"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";
import { getCollectionCountdownDeadline } from "@/lib/collection-countdowns";

type Variant = "banner" | "compact";

function formatRemaining(ms: number): { h: string; m: string; s: string } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

export function useCollectionCountdown(address: string | null | undefined): {
  locked: boolean;
  label: string | null;
  remainingMs: number;
} {
  const deadline = getCollectionCountdownDeadline(address);
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    deadline ? deadline.getTime() - Date.now() : 0
  );

  useEffect(() => {
    if (!deadline) {
      setRemainingMs(0);
      return;
    }
    const tick = () => setRemainingMs(deadline.getTime() - Date.now());
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [deadline]);

  if (!deadline || remainingMs <= 0) {
    return { locked: false, label: null, remainingMs: 0 };
  }
  const { h, m, s } = formatRemaining(remainingMs);
  return { locked: true, label: `${h}:${m}:${s}`, remainingMs };
}

export function CollectionCountdown({
  address,
  variant = "banner",
  className,
}: {
  address: string;
  variant?: Variant;
  className?: string;
}) {
  const deadline = getCollectionCountdownDeadline(address);
  const { theme } = useTheme();
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    deadline ? deadline.getTime() - Date.now() : null
  );

  useEffect(() => {
    if (!deadline) {
      return;
    }
    const tick = () => setRemainingMs(deadline.getTime() - Date.now());
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [deadline]);

  if (!deadline || remainingMs === null || remainingMs <= 0) {
    return null;
  }

  const { h, m, s } = formatRemaining(remainingMs);

  if (variant === "compact") {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-md",
          theme === "dark"
            ? "border-amber-400/25 bg-black/45 text-amber-200"
            : "border-amber-300 bg-white/85 text-amber-700",
          className
        )}
      >
        <Clock className="h-3 w-3" />
        {h}:{m}:{s}
      </span>
    );
  }

  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-2xl border px-4 py-3",
        theme === "dark"
          ? "border-amber-500/25 bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.04] to-orange-500/[0.04]"
          : "border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50/60 to-orange-50",
        className
      )}
    >
      <div
        className={clsx(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
          theme === "dark" ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-700"
        )}
      >
        <Clock className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "font-mono text-[10px] uppercase tracking-[0.2em]",
            theme === "dark" ? "text-amber-300/75" : "text-amber-700/75"
          )}
        >
          Limited window
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-tight">
          Ends in{" "}
          <span className="font-mono tabular-nums">
            {h}:{m}:{s}
          </span>
        </p>
      </div>
    </div>
  );
}
