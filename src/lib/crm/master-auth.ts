import "server-only";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";

export const MASTER_COOKIE_NAME = "nw_master_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

type Staff = { role: string; enabled: boolean };

function getMasterSecret(): string {
  const password = process.env.CRM_MASTER_PASSWORD?.trim();
  if (password && password.length >= 8) return password;
  const token = process.env.CRM_LAB_ADMIN_TOKEN?.trim();
  if (token && token.length >= 8) return token;
  return "";
}

function getHmacKey(): Buffer {
  const secret = getMasterSecret() || "novaesweb-crm-master-fallback-key";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeMatch(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const bufCandidate = Buffer.from(candidate);
  const bufExpected = Buffer.from(expected);
  if (bufCandidate.length !== bufExpected.length) {
    // Perform dummy comparison to keep constant-ish time
    crypto.timingSafeEqual(bufCandidate, bufCandidate);
    return false;
  }
  return crypto.timingSafeEqual(bufCandidate, bufExpected);
}

/**
 * Create a signed, tamper-proof session token for Master administrators
 */
export function signMasterToken(actor = "master_admin"): string {
  const timestamp = Date.now().toString();
  const payload = `${actor}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", getHmacKey()).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verify a signed Master session token
 */
export function verifyMasterToken(token: string | undefined): { valid: boolean; actor?: string } {
  if (!token || typeof token !== "string") return { valid: false };
  const parts = token.split(":");
  if (parts.length !== 3) return { valid: false };
  const [actor, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp) || Date.now() - timestamp > SESSION_TTL_MS || timestamp > Date.now() + 60000) {
    return { valid: false };
  }

  const payload = `${actor}:${timestampStr}`;
  const expectedHmac = crypto.createHmac("sha256", getHmacKey()).update(payload).digest("hex");

  if (!timingSafeMatch(signature, expectedHmac)) {
    return { valid: false };
  }

  return { valid: true, actor };
}

/**
 * Comprehensive Master authorization verification for all admin routes:
 * 1. Checks secure signed HTTP-only cookie (nw_master_session)
 * 2. Checks Bearer token or x-admin-password against environment secret
 * 3. Checks Supabase authenticated user with platform_staff table role
 */
export async function verifyMasterRequest(request: NextRequest): Promise<{ authorized: boolean; actor: string }> {
  const masterSecret = getMasterSecret();

  // 1. Check signed HTTP-only session cookie
  const sessionCookie = request.cookies.get(MASTER_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = verifyMasterToken(sessionCookie);
    if (session.valid && session.actor) {
      return { authorized: true, actor: session.actor };
    }
  }

  // 2. Check direct header (Authorization: Bearer <key> or x-admin-password)
  const authHeader = request.headers.get("x-admin-password") || request.headers.get("authorization") || "";
  const cleanKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (cleanKey && masterSecret && timingSafeMatch(cleanKey, masterSecret)) {
    return { authorized: true, actor: "api_master_key" };
  }

  // 3. Check legacy crm_admin_token cookie if it matches environment secret
  const legacyCookie = request.cookies.get("crm_admin_token")?.value;
  if (legacyCookie && masterSecret && timingSafeMatch(legacyCookie, masterSecret)) {
    return { authorized: true, actor: "legacy_admin_cookie" };
  }

  // 4. Check Supabase operator session with platform_staff authorization
  try {
    const operator = await verifyOperator();
    if (operator) {
      const staff = await supabaseRows<Staff[]>(
        `platform_staff?select=role,enabled&user_id=eq.${encodeURIComponent(operator.id)}&limit=2`,
        operator.token
      );
      if (staff.length === 1 && staff[0].enabled && ["MASTER", "ADMINISTRADOR", "platform_admin"].includes(staff[0].role)) {
        return { authorized: true, actor: operator.email || operator.id };
      }
    }
  } catch {}

  return { authorized: false, actor: "anonymous" };
}

