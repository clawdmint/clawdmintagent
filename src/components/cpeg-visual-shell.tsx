"use client";

import { useCpegSite } from "@/components/cpeg-site-context";

/** Full-page background + default text when browsing the cPEG subdomain (Hub / Launch / Market / mint). */
export function CpegVisualShell({ children }: { children: React.ReactNode }) {
  const isCpeg = useCpegSite();

  if (!isCpeg) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f0eb] text-neutral-900 transition-colors duration-300 dark:bg-[#080808] dark:text-[#f0ebe0]">
      {children}
    </div>
  );
}
