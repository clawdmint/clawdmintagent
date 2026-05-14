/**
 * Dedicated cPEG subdomain (same Next app). Middleware sets {@link CPEG_SITE_HEADER}
 * after matching {@link NEXT_PUBLIC_CPEG_SITE_HOST}.
 */
export const CPEG_SITE_HEADER = "x-cpeg-site";

/** Base58 public key-ish segment length for /<mint> rewrites on the cPEG subdomain. */
const MINT_SEGMENT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isLikelyMintPathSegment(segment: string) {
  return MINT_SEGMENT_RE.test(segment);
}

export function hostnameMatchesCpegSite(hostWithoutPort: string): boolean {
  const h = hostWithoutPort.toLowerCase();

  if (h === "cpeg.localhost" || h === "cpeg.127.0.0.1") {
    return true;
  }

  const configured =
    process.env["CPEG_SITE_HOST"] ||
    process.env["NEXT_PUBLIC_CPEG_SITE_HOST"] ||
    "";
  if (configured.trim()) {
    return h === configured.trim().toLowerCase();
  }

  // Fallback: same deploy often sets NEXT_PUBLIC_CPEG_APP_URL before CPEG_SITE_HOST.
  const cpegAppUrl = (process.env["NEXT_PUBLIC_CPEG_APP_URL"] || "").trim();
  if (cpegAppUrl.startsWith("http://") || cpegAppUrl.startsWith("https://")) {
    try {
      const u = new URL(cpegAppUrl);
      if (u.hostname && h === u.hostname.toLowerCase()) return true;
    } catch {
      //
    }
  }

  return false;
}

export function readCpegSiteFromHeaders(h: { get(name: string): string | null }) {
  return h.get(CPEG_SITE_HEADER) === "1";
}

/**
 * Public URL paths: on the cPEG subdomain we use short paths (/market);
 * on the main Clawdmint host we keep /cpeg/... so nothing breaks for existing links.
 */
export function cpegPublicPaths(isCpegSubdomain: boolean) {
  const root = isCpegSubdomain ? "/" : "/cpeg";
  const marketPath = (query?: URLSearchParams | Record<string, string | undefined | null>) => {
    const base = isCpegSubdomain ? "/market" : "/cpeg/market";
    if (!query) return base;
    const sp = query instanceof URLSearchParams ? query : new URLSearchParams();
    if (!(query instanceof URLSearchParams) && query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== "") sp.set(k, v);
      }
    }
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  return {
    /** Hub */
    home: root,
    explore: isCpegSubdomain ? "/explore" : "/cpeg/explore",
    launch: isCpegSubdomain ? "/launch" : "/cpeg/launch",
    market: marketPath,
    /** Public token to cPEG convert page. The market remains /market?mint=... */
    collection: (mint: string) => (isCpegSubdomain ? `/${mint}` : `/cpeg/${mint}`),
    collectionWithHash: (mint: string, hash: string) =>
      `${isCpegSubdomain ? `/${mint}` : `/cpeg/${mint}`}${hash.startsWith("#") ? hash : `#${hash}`}`,
    /** Dedicated peg detail page that works for both listed and unlisted assets. */
    peg: (mint: string, pegId: number | string) =>
      isCpegSubdomain ? `/${mint}/peg/${pegId}` : `/cpeg/${mint}/peg/${pegId}`,
  };
}

export function extractCpegMintFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1 && isLikelyMintPathSegment(parts[0])) {
    return parts[0];
  }
  if (parts.length === 2 && parts[0] === "cpeg" && isLikelyMintPathSegment(parts[1])) {
    return parts[1];
  }
  return "";
}
