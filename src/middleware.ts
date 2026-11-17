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

const MASTER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MASTER_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HEX_64 = /^[0-9a-f]{64}$/i;

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyMasterCookieInEdge(rawCookie: string | undefined): Promise<boolean> {
  if (!rawCookie) return false;
  let token = rawCookie;
  try {
    if (token.includes("%")) token = decodeURIComponent(token);
  } catch {
    return false;
  }

  const parts = token.split(":");
  let payload = "";
  let signature = "";
  let maxAgeMs = MASTER_SESSION_TTL_MS;
  let ts = NaN;

  if (parts.length === 3) {
    const [actor, tsStr, sig] = parts;
    if (!actor || !sig) return false;
    ts = parseInt(tsStr, 10);
    payload = `${actor}:${tsStr}`;
    signature = sig;
  } else if (parts.length === 4 && parts[2] === "remember") {
    const [actor, tsStr, mode, sig] = parts;
    if (!actor || !sig) return false;
    ts = parseInt(tsStr, 10);
    maxAgeMs = MASTER_REMEMBER_TTL_MS;
    payload = `${actor}:${tsStr}:${mode}`;
    signature = sig;
  } else {
    return false;
  }

  const now = Date.now();
  if (Number.isNaN(ts) || now - ts > maxAgeMs || ts > now + 60_000 || !HEX_64.test(signature)) {
    return false;
  }

  const secret = process.env.CRM_MASTER_SESSION_SECRET?.trim() || "";
  if (secret.length >= 32 && typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(secret));
      const hmacKey = await crypto.subtle.importKey(
        "raw",
        keyMaterial,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const mac = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(payload));
      const expectedHex = Array.from(new Uint8Array(mac))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return timingSafeHexEqual(signature.toLowerCase(), expectedHex);
    } catch {
      return false;
    }
  }

  return true;
}

function isValidOperatorJwtFormat(rawCookie: string | undefined): boolean {
  if (!rawCookie) return false;
  const parts = rawCookie.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { exp?: number; sub?: string };
    if (typeof json.exp === "number" && json.exp * 1000 < Date.now() - 30_000) {
      return false;
    }
    return Boolean(json.sub);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
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

  const needsMasterCheck =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/novaescrmadm" ||
    pathname === "/novaescrmadm/" ||
    pathname === "/cliente" ||
    pathname.startsWith("/cliente/");

  const hasValidMaster = needsMasterCheck ? await verifyMasterCookieInEdge(masterCookie) : false;
  const hasValidOperator = isValidOperatorJwtFormat(operatorCookie);

  // 2. Protect /admin routes: must have verified Master session cookie.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasValidMaster) {
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
    if (hasValidMaster) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  // 4. Protect /cliente routes: must have Client/Operator session cookie or valid Master preview
  if (pathname === "/cliente" || pathname.startsWith("/cliente/")) {
    if (pathname === "/cliente" && hasValidMaster && request.nextUrl.searchParams.get("tenant") === "novaesweb") {
      return NextResponse.redirect(new URL("/admin?section=crm", request.url));
    }
    if (!hasValidOperator && !hasValidMaster) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("error", "unauthorized_client");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 5. Client Login root ("/"):
  // If already authenticated, redirect to the respective workspace
  if (pathname === "/") {
    if (request.nextUrl.searchParams.has("error") || request.nextUrl.searchParams.has("logout")) {
      return NextResponse.next();
    }

    if (hasValidOperator) {
      return NextResponse.redirect(new URL("/cliente", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}
