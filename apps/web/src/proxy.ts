import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = process.env.SSO_COOKIE_NAME ?? "legal_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/health/") ||
    (pathname.startsWith("/auth/") && pathname !== "/auth/error")
  ) {
    const backend = process.env.LEGAL_API_URL ?? "http://localhost:3017";
    return NextResponse.rewrite(new URL(`${pathname}${search}`, backend));
  }

  if (pathname !== "/auth/error" && request.nextUrl.searchParams.has("error")) {
    const errorUrl = new URL("/auth/error", request.url);
    const reason = request.nextUrl.searchParams.get("error");
    errorUrl.searchParams.set("error", reason === "access_unavailable" || reason === "access_denied" ? reason : "auth_failed");
    return NextResponse.redirect(errorUrl);
  }

  if (isPublicRoute(pathname) || !request.cookies.get(sessionCookieName)?.value) {
    if (isPublicRoute(pathname)) return NextResponse.next();

    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/v1/:path*", "/health/:path*", "/auth/:path*", "/((?!api|_next|.*\\..*).*)"],
};

function isPublicRoute(pathname: string) {
  return pathname === "/auth/error" || pathname === "/legal/public" || pathname.startsWith("/legal/public/");
}
