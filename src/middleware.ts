import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

export function middleware(request: NextRequest) {
  if (!DISABLED_ROUTES.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/drops";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/mint",
    "/names",
    "/launch",
    "/screener",
    "/trade",
    "/predictions",
    "/automation",
    "/portfolio",
  ],
};
