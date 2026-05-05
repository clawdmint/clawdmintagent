import type { Metadata } from "next";
import { headers } from "next/headers";
import { CpegExploreClient } from "@/components/cpeg-explore-client";
import { CPEG_SITE_HEADER } from "@/lib/cpeg-site-paths";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore cPEG Gallery",
  description: "Browse deterministic PEG identities, traits, provenance, and rarity on Solana.",
};

function requestBaseUrl() {
  try {
    const h = headers();
    const protocol = h.get("x-forwarded-proto") || "http";
    const host = h.get("host");
    const fallback = process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000";
    return host ? `${protocol}://${host}` : fallback;
  } catch {
    return process.env["NEXT_PUBLIC_APP_URL"] || "http://localhost:3000";
  }
}

const EMPTY_EXPLORE_PAYLOAD = {
  success: true,
  collections: [],
  selected_collection: null,
  stats: { cpegs: 0, holders: 0, minted: 0 },
  page: { offset: 0, limit: 36, next_offset: null, previous_offset: null },
  pegs: [],
};

async function getInitialPayload(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/api/cpeg/explore?limit=36`, {
      cache: "no-store",
      headers: headers().get(CPEG_SITE_HEADER) === "1" ? { [CPEG_SITE_HEADER]: "1" } : undefined,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default async function CpegExplorePage() {
  const initialPayload = await getInitialPayload(requestBaseUrl());
  return <CpegExploreClient initialPayload={initialPayload || EMPTY_EXPLORE_PAYLOAD} />;
}
