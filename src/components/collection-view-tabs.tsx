"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useTheme } from "@/components/theme-provider";

export function CollectionViewTabs({
  address,
  active,
}: {
  address: string;
  active: "mint" | "market";
}) {
  const { theme } = useTheme();

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1 rounded-2xl border p-1",
        theme === "dark"
          ? "border-white/[0.08] bg-[#08111d]/84"
          : "border-gray-200 bg-white/92 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
      )}
    >
      <Link
        href={`/collection/${address}`}
        className={clsx(
          "rounded-[14px] px-4 py-2 text-sm font-medium transition-colors",
          active === "mint"
            ? theme === "dark"
              ? "bg-cyan-500/15 text-cyan-200"
              : "bg-cyan-50 text-cyan-700"
            : theme === "dark"
              ? "text-gray-400 hover:bg-white/[0.04] hover:text-white"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        )}
      >
        Mint
      </Link>
      <Link
        href={`/marketplace/${address}`}
        className={clsx(
          "rounded-[14px] px-4 py-2 text-sm font-medium transition-colors",
          active === "market"
            ? theme === "dark"
              ? "bg-cyan-500/15 text-cyan-200"
              : "bg-cyan-50 text-cyan-700"
            : theme === "dark"
              ? "text-gray-400 hover:bg-white/[0.04] hover:text-white"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        )}
      >
        Market
      </Link>
    </div>
  );
}
