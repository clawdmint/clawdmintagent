import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CPEG_SITE_HEADER,
  hostnameMatchesCpegSite,
  isLikelyMintPathSegment,
} from "@/lib/cpeg-site-paths";

const DISABLED_ROUTES = new Set([
  "/mint",
  "/names",
  "/launch",
  "/screener",
  "/trade",
  "/predictions",
  "/automation",
  "/portfolio",
]);

function isStaticPublicPath(pathname: string) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/.well-known")) return true;
  return /\.[a-z0-9]{1,8}$/i.test(pathname);
}

function withCpegHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CPEG_SITE_HEADER, "1");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectMain(request: NextRequest, pathname: string) {
  const base = process.env["NEXT_PUBLIC_APP_URL"] || "https://clawdmint.xyz";
  const target = new URL(pathname, base.endsWith("/") ? base : `${base}/`);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}

/**
 * cPEG subdomain: canonical short paths (/, /launch, /market, /<mint>) rewrite to /cpeg/* internally.
 * Legacy /cpeg/* URLs redirect to the short form so the address bar stays clean.
 */
function handleCpegSubdomain(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    return withCpegHeader(request);
  }

  if (isStaticPublicPath(pathname)) {
    return withCpegHeader(request);
  }

  if (pathname.startsWith("/cpeg")) {
    if (pathname === "/cpeg" || pathname === "/cpeg/") {
      const target = new URL("/", request.url);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }
    const rest = pathname.slice("/cpeg".length) || "/";
    const target = new URL(rest, request.url);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  if (pathname === "/" || pathname === "") {
    const internal = new URL("/cpeg", request.url);
    internal.search = request.nextUrl.search;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(CPEG_SITE_HEADER, "1");
    return NextResponse.rewrite(internal, { request: { headers: requestHeaders } });
  }

  if (pathname === "/launch") {
    const internal = new URL("/cpeg/launch", request.url);
    internal.search = request.nextUrl.search;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(CPEG_SITE_HEADER, "1");
    return NextResponse.rewrite(internal, { request: { headers: requestHeaders } });
  }

  if (pathname === "/explore" || pathname === "/explore/") {
    const internal = new URL("/cpeg/explore", request.url);
    internal.search = request.nextUrl.search;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(CPEG_SITE_HEADER, "1");
    return NextResponse.rewrite(internal, { request: { headers: requestHeaders } });
  }

  if (pathname === "/market" || pathname === "/market/") {
    const internal = new URL(`/cpeg/market`, request.url);
    internal.search = request.nextUrl.search;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(CPEG_SITE_HEADER, "1");
    return NextResponse.rewrite(internal, { request: { headers: requestHeaders } });
  }

  const top = pathname.split("/").filter(Boolean)[0];
  if (top && isLikelyMintPathSegment(top) && pathname.split("/").filter(Boolean).length === 1) {
    const target = new URL("/market", request.url);
    target.searchParams.set("mint", top);
    return NextResponse.redirect(target, 308);
  }

  return redirectMain(request, pathname === "" ? "/" : pathname);
}

export function middleware(request: NextRequest) {
  const rawHost = request.headers.get("host") || "";
  const host = rawHost.split(":")[0]?.toLowerCase() ?? "";

  if (hostnameMatchesCpegSite(host)) {
    return handleCpegSubdomain(request);
  }

  const pathname = request.nextUrl.pathname;
  if (!DISABLED_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/drops";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Include "/" explicitly  -  some Next matcher patterns skip the bare root path, which
     * would leave the cPEG subdomain homepage without rewrites (and unrelated paths could
     * fall through to redirectMain).
     */
    "/",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
