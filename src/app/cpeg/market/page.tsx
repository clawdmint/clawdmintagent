import { Suspense } from "react";
import { CpegMarketClient } from "@/components/cpeg-market-client";

export const dynamic = "force-dynamic";

function MarketSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-10 md:px-10 md:pt-12">
      <div className="h-3 w-32 animate-pulse bg-neutral-300/80 dark:bg-white/[0.05]" />
      <div className="mt-6 grid gap-6 border border-neutral-200 bg-neutral-50 p-6 dark:border-white/10 dark:bg-white/[0.02] lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <div className="h-3 w-40 animate-pulse bg-neutral-300/80 dark:bg-white/[0.05]" />
          <div className="h-12 w-2/3 animate-pulse bg-neutral-300/80 dark:bg-white/[0.05]" />
          <div className="h-3 w-3/4 animate-pulse bg-neutral-300/60 dark:bg-white/[0.04]" />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04]"
          />
        ))}
      </div>
    </div>
  );
}

export default function CpegMarketPage() {
  return (
    <div className="flex flex-col">
      <Suspense fallback={<MarketSkeleton />}>
        <CpegMarketClient />
      </Suspense>
    </div>
  );
}
