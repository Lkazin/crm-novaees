import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, svgs, etc)
     * - api routes (handled directly by API route handlers with granular 401/403)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|gif|png|webp|svg|ico)$|api/).*)"
  ]
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const masterCookie = request.cookies.get("nw_master_session")?.value;
  const operatorCookie = request.cookies.get("nw_crm_session")?.value;

  // 1. Redirect legacy /operator routes to /cliente
  if (pathname === "/operator") {
    return NextResponse.redirect(new URL("/cliente", request.url));
  }
  if (pathname.startsWith("/operator/")) {
    const target = pathname.replace(/^\/operator/, "/cliente");
    return NextResponse.redirect(new URL(target, request.url));
  }

  // 2. Protect /admin routes: must have Master session cookie.
  // Unauthenticated users are redirected to the secret master login route /novaescrmadm
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!masterCookie) {
      const loginUrl = new URL("/novaescrmadm", request.url);
      loginUrl.searchParams.set("error", "unauthorized_admin");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 3. Secret Master Login ("/novaescrmadm"):
  // If already authenticated as Master, automatically redirect to /admin
  if (pathname === "/novaescrmadm" || pathname === "/novaescrmadm/") {
    if (request.nextUrl.searchParams.has("error") || request.nextUrl.searchParams.has("logout")) {
      return NextResponse.next();
    }
    if (masterCookie) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  // 4. Protect /cliente routes: must have Client/Operator session cookie
  if (pathname === "/cliente" || pathname.startsWith("/cliente/")) {
    if (!operatorCookie && !masterCookie) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("error", "unauthorized_client");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 5. Client Login root ("/"):
  // If already authenticated, redirect to the respective workspace
  if (pathname === "/") {
    // If request arrived with an error or explicit logout intent, DO NOT auto-redirect.
    if (request.nextUrl.searchParams.has("error") || request.nextUrl.searchParams.has("logout")) {
      return NextResponse.next();
    }

    // Never auto-redirect to /admin from root (client login)
    if (operatorCookie) {
      return NextResponse.redirect(new URL("/cliente", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}
