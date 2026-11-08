import "server-only";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
import { getRedis } from "@/lib/crm/plans";

export const MASTER_COOKIE_NAME = "nw_master_session";
// Standardized session lifetime: exactly 12 hours (43200 seconds)
export const MASTER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MASTER_SESSION_TTL_SEC = 12 * 60 * 60;
// Extended session lifetime for "Remember me" (30 days)
export const MASTER_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MASTER_REMEMBER_TTL_SEC = 30 * 24 * 60 * 60;

type Staff = { role: string; enabled: boolean };

/**
 * Retrieve the dedicated strong HMAC secret for signing administrative sessions.
 * Fails closed (returns empty string) if missing or less than 32 characters.
 * NEVER uses or reuses the administrative login password.
 */
export function getMasterSessionSecret(): string {
  const secret = process.env.CRM_MASTER_SESSION_SECRET?.trim() || "";
  if (secret && secret.length >= 32) return secret;
  return "";
}

/**
 * Retrieve administrative password for Master login verification only.
 */
export function getMasterPassword(): string {
  return process.env.CRM_MASTER_PASSWORD?.trim() || "";
}

/**
 * Retrieve legacy service token for automated API calls.
 */
export function getLegacyAdminToken(): string {
  return process.env.CRM_LAB_ADMIN_TOKEN?.trim() || "";
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeMatch(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const bufCandidate = Buffer.from(candidate);
  const bufExpected = Buffer.from(expected);
  if (bufCandidate.length !== bufExpected.length) {
    // Perform dummy constant-time comparison on candidate to mitigate timing leaks
    crypto.timingSafeEqual(bufCandidate, bufCandidate);
    return false;
  }
  return crypto.timingSafeEqual(bufCandidate, bufExpected);
}

/**
 * Create a signed, tamper-proof session token for Master administrators.
 * Supports optional 30-day extended remember-me lifetime.
 * Requires CRM_MASTER_SESSION_SECRET in environment; throws if missing (fail-closed).
 */
export function signMasterToken(actor = "master_admin", rememberMe = false): string {
  const secret = getMasterSessionSecret();
  if (!secret) {
    throw new Error("CRM_MASTER_SESSION_SECRET_MISSING: Cannot sign session without dedicated environment secret (minimum 32 chars).");
  }
  const timestamp = Date.now().toString();
  const payload = rememberMe ? `${actor}:${timestamp}:remember` : `${actor}:${timestamp}`;
  const hmacKey = crypto.createHash("sha256").update(secret).digest();
  const hmac = crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verify a signed Master session token.
 * Fails closed (returns valid: false) if the environment session secret is missing or invalid.
 */
export function verifyMasterToken(token: string | undefined): { valid: boolean; actor?: string } {
  if (!token || typeof token !== "string") return { valid: false };
  const secret = getMasterSessionSecret();
  if (!secret) {
    // Fail-closed: Cannot verify sessions without the configured session secret
    return { valid: false };
  }

  let cleanToken: string;
  try { cleanToken = token.includes("%") ? decodeURIComponent(token) : token; }
  catch { return { valid: false }; }
  const parts = cleanToken.split(":");
  if (parts.length === 3) {
    const [actor, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp) || Date.now() - timestamp > MASTER_SESSION_TTL_MS || timestamp > Date.now() + 60000) {
      return { valid: false };
    }

    const payload = `${actor}:${timestampStr}`;
    const hmacKey = crypto.createHash("sha256").update(secret).digest();
    const expectedHmac = crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");

    if (!timingSafeMatch(signature, expectedHmac)) {
      return { valid: false };
    }

    return { valid: true, actor };
  }

  if (parts.length === 4 && parts[2] === "remember") {
    const [actor, timestampStr, mode, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp) || Date.now() - timestamp > MASTER_REMEMBER_TTL_MS || timestamp > Date.now() + 60000) {
      return { valid: false };
    }

    const payload = `${actor}:${timestampStr}:${mode}`;
    const hmacKey = crypto.createHash("sha256").update(secret).digest();
    const expectedHmac = crypto.createHmac("sha256", hmacKey).update(payload).digest("hex");

    if (!timingSafeMatch(signature, expectedHmac)) {
      return { valid: false };
    }

    return { valid: true, actor };
  }

  return { valid: false };
}

/**
 * In-memory short-lived cache for verified staff status (30s)
 * Prevents hammering Supabase while guaranteeing rapid revocation when a staff user is disabled.
 */
const staffStatusCache = new Map<string, { enabled: boolean; role: string; expiresAt: number }>();

export function clearStaffStatusCache(userId?: string) {
  if (userId) {
    staffStatusCache.delete(userId);
  } else {
    staffStatusCache.clear();
  }
}

const inMemoryRevokedTokens = new Set<string>();

/**
 * Revoke a master session token immediately on the server.
 */
export async function revokeMasterToken(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    const parts = token.split(":");
    const signature = parts[parts.length - 1];
    if (signature) {
      inMemoryRevokedTokens.add(signature);
      try {
        const redis = getRedis();
        const curStatus = String(redis.status);
        if (curStatus === "ready") {
          await redis.set(`crm:revoked_master:${signature}`, "1", "EX", 30 * 24 * 60 * 60);
        } else if (process.env.CRM_REDIS_URL && curStatus !== "end") {
          if (curStatus !== "connecting") await redis.connect().catch(() => {});
          if (String(redis.status) === "ready") {
            await redis.set(`crm:revoked_master:${signature}`, "1", "EX", 30 * 24 * 60 * 60);
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("[master-auth] Failed to persist token revocation:", err);
  }
}

/**
 * Check if a master session token has been revoked on logout.
 */
export async function isMasterTokenRevoked(token: string | undefined): Promise<boolean> {
  if (!token) return true;
  try {
    const parts = token.split(":");
    const signature = parts[parts.length - 1];
    if (!signature) return true;
    if (inMemoryRevokedTokens.has(signature)) return true;

    try {
      const redis = getRedis();
      if (redis.status === "ready") {
        const revoked = await redis.get(`crm:revoked_master:${signature}`);
        if (revoked === "1") return true;
      }
    } catch {}
  } catch {}
  return false;
}

/**
 * Comprehensive Master authorization verification for all admin routes:
 * 1. Checks secure signed HTTP-only cookie (nw_master_session)
 * 2. Checks token revocation cache (Redis blacklist)
 * 3. Revalidates platform_staff status in database (fail-closed if staff disabled or removed)
 * 4. Checks Supabase authenticated user with platform_staff table role
 * 
 * Note: Alternative auth methods (x-admin-password, raw bearer header, legacy crm_admin_token)
 * have been permanently decommissioned for enterprise zero-trust security.
 */
export async function verifyMasterRequest(request: NextRequest): Promise<{ authorized: boolean; actor: string }> {
  // 1. Check signed HTTP-only session cookie (primary & recommended)
  const sessionCookie = request.cookies.get(MASTER_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = verifyMasterToken(sessionCookie);
    if (session.valid && session.actor) {
      // Check if session token was explicitly revoked on logout
      const revoked = await isMasterTokenRevoked(sessionCookie);
      if (revoked) {
        return { authorized: false, actor: "revoked_session" };
      }

      // Revalidate staff status if actor is a platform staff user (master_<userId>)
      // If actor is "master_admin", it is the master administrator signed with CRM_MASTER_PASSWORD
      if (session.actor.startsWith("master_") && session.actor !== "master_admin") {
        const userId = session.actor.replace(/^master_/, "").trim();
        if (userId) {
          const now = Date.now();
          const cached = staffStatusCache.get(userId);
          if (cached && cached.expiresAt > now) {
            if (!cached.enabled || !["MASTER", "ADMINISTRADOR", "platform_admin"].includes(cached.role)) {
              return { authorized: false, actor: "disabled_staff" };
            }
            return { authorized: true, actor: session.actor };
          }

          // Query Supabase service role for platform_staff
          try {
            const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
            const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
            if (url && serviceKey.length >= 30) {
              const res = await fetch(`${url}/rest/v1/platform_staff?user_id=eq.${encodeURIComponent(userId)}&select=role,enabled&limit=1`, {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
                cache: "no-store",
                signal: AbortSignal.timeout(5000)
              });
              if (res.ok) {
                const rows = (await res.json()) as Array<{ role: string; enabled: boolean }>;
                if (rows.length === 1 && rows[0].enabled && ["MASTER", "ADMINISTRADOR", "platform_admin"].includes(rows[0].role)) {
                  staffStatusCache.set(userId, { enabled: true, role: rows[0].role, expiresAt: now + 30_000 });
                  return { authorized: true, actor: session.actor };
                } else {
                  // Staff is disabled, deleted or role changed: fail-closed!
                  staffStatusCache.set(userId, { enabled: false, role: rows[0]?.role || "none", expiresAt: now + 60_000 });
                  return { authorized: false, actor: "disabled_staff" };
                }
              }
            }
          } catch (err) {
            console.error("[master-auth] Failed to revalidate platform_staff:", err);
            // Fail closed on database check failure
            return { authorized: false, actor: "staff_validation_failed" };
          }
        }
      }

      // Valid signed master_admin session
      return { authorized: true, actor: session.actor };
    }
  }

  // 2. Check Supabase operator session with active platform_staff authorization
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
