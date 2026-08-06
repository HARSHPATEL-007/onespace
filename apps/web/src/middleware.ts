import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "authjs.session-token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAppPath = pathname === "/" || pathname.startsWith("/m/") || pathname.startsWith("/launcher");

  if (isAppPath && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|signin|signup).*)"],
};