import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName =
  process.env.NEXT_PUBLIC_SSO_COOKIE_NAME ?? "legal_session";
const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3017";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicRoute(pathname) || !request.cookies.get(sessionCookieName)?.value) {
    if (isPublicRoute(pathname)) return NextResponse.next();

    const loginUrl = new URL("/auth/login", backendUrl);
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

function isPublicRoute(pathname: string) {
  return pathname === "/legal/public" || pathname.startsWith("/legal/public/");
}
