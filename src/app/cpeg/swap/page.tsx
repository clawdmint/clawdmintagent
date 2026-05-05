import { Suspense } from "react";
import { CpegSwapClient } from "@/components/cpeg-swap-client";

export const dynamic = "force-dynamic";

function SwapSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 md:px-10">
      <div className="h-3 w-32 animate-pulse bg-neutral-300/80 dark:bg-white/[0.05]" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="h-96 animate-pulse border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.03]" />
        <div className="h-96 animate-pulse border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/[0.03]" />
      </div>
    </div>
  );
}

export default function CpegSwapPage() {
  return (
    <Suspense fallback={<SwapSkeleton />}>
      <CpegSwapClient />
    </Suspense>
  );
}
