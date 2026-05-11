"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";

const STORAGE_KEY = "clawdmint-referral-widget-dismissed";

function isEnabled(value: string | undefined, url: string) {
  if (!url) return false;
  if (!value) return true;
  return value !== "false";
}

export function ReferralWidget() {
  const url = process.env["NEXT_PUBLIC_REFERRAL_WIDGET_URL"] || "";
  const enabled = isEnabled(process.env["NEXT_PUBLIC_REFERRAL_WIDGET_ENABLED"], url);
  const title = process.env["NEXT_PUBLIC_REFERRAL_WIDGET_TITLE"] || "Power your agents with Synapse RPC";
  const description =
    process.env["NEXT_PUBLIC_REFERRAL_WIDGET_DESCRIPTION"] ||
    "Fast, reliable Solana routing by OOBE.";
  const cta = process.env["NEXT_PUBLIC_REFERRAL_WIDGET_CTA"] || "Try it";
  const imageUrl = process.env["NEXT_PUBLIC_REFERRAL_WIDGET_IMAGE_URL"] || "/referrals/synapse-rpc-widget.jpg";
  const storageKey = useMemo(() => `${STORAGE_KEY}:${url}`, [url]);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [enabled, storageKey]);

  if (!enabled || dismissed) return null;

  const dismiss = () => {
    window.localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  return (
    <aside className="animate-referral-widget-in fixed bottom-4 right-4 z-50 w-[min(calc(100vw-2rem),420px)]">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/15 dark:border-white/10 dark:bg-white">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="group block"
          aria-label={`${title} referral link`}
        >
          <span className="relative block aspect-[3/1] overflow-hidden border-b border-gray-100 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          </span>
          <span className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-black leading-4 text-gray-950">
                {title}
              </span>
              <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-500">
                {description}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-black text-white transition group-hover:bg-violet-500">
              {cta} <ExternalLink className="h-3 w-3" />
            </span>
          </span>
        </a>
        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={dismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/85 text-gray-400 shadow-sm backdrop-blur transition hover:border-gray-300 hover:text-gray-700"
            aria-label="Dismiss sponsored referral"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
