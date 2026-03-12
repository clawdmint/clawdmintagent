import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function isPublicAsset(pathname: string): boolean {
  return /\.[^/]+$/.test(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/clawdmintbanner.png" ||
    isPublicAsset(pathname)
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/clawdmintbanner.png";
  url.search = "";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/:path*"],
};
