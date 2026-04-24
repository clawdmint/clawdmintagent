import type { ReactNode } from "react";
import { StudioComingSoon } from "@/components/studio-coming-soon";

/**
 * Set NEXT_PUBLIC_STUDIO_COMING_SOON=false in your environment to load the full studio app while developing.
 * Default (omitted or "true") shows a public "Coming soon" page for all /studio/* routes.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  const enabled = process.env["NEXT_PUBLIC_STUDIO_COMING_SOON"] !== "false";

  if (enabled) {
    return <StudioComingSoon />;
  }

  return <>{children}</>;
}
