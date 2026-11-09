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

type RateLimitRecord = {
  attempts: number;
  blockedUntil?: number;
  lastAttempt: number;
};

type OtpRecord = {
  code: string;
  ip: string;
  expiresAt: number;
  createdAt: number;
};

// Global in-memory storage (singleton in Node.js process)
const inMemoryRateLimits = new Map<string, RateLimitRecord>();
const inMemoryOtps = new Map<string, OtpRecord>();
const inMemoryActiveOtpsByIp = new Map<string, string>();
let inMemoryDynamicPassword: string | null = null;

export async function isLoginBlocked(ip: string, isMasterScope: boolean): Promise<{ blocked: boolean; attempts: number; remainingSeconds: number }> {
  const key = isMasterScope ? `master:${ip}` : `client:${ip}`;
  const now = Date.now();
  const entry = inMemoryRateLimits.get(key);
  if (entry && entry.blockedUntil && entry.blockedUntil > now) {
    return {
      blocked: true,
      attempts: entry.attempts,
      remainingSeconds: Math.ceil((entry.blockedUntil - now) / 1000)
    };
  }
  if (entry && entry.blockedUntil && entry.blockedUntil <= now) {
    inMemoryRateLimits.delete(key);
  }

  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const redisKey = isMasterScope ? `crm:ratelimit:master_login:${ip}` : `crm:ratelimit:login:${ip}`;
      const count = await redis.get(redisKey);
      const attempts = count ? parseInt(count, 10) : 0;
      if (attempts >= (isMasterScope ? 5 : 8)) {
        return { blocked: true, attempts, remainingSeconds: 900 };
      }
    }
  } catch {}

  return { blocked: false, attempts: entry?.attempts || 0, remainingSeconds: 0 };
}

export async function recordFailedLoginAttempt(ip: string, isMasterScope: boolean): Promise<{ attempts: number; blocked: boolean; otpDispatched?: boolean; otpCode?: string }> {
  const key = isMasterScope ? `master:${ip}` : `client:${ip}`;
  const now = Date.now();
  const maxAttempts = isMasterScope ? 5 : 8;
  const ttlMs = 15 * 60 * 1000;

  let entry = inMemoryRateLimits.get(key);
  if (!entry || now - entry.lastAttempt > ttlMs) {
    entry = { attempts: 0, lastAttempt: now };
  }

  entry.attempts += 1;
  entry.lastAttempt = now;

  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const redisKey = isMasterScope ? `crm:ratelimit:master_login:${ip}` : `crm:ratelimit:login:${ip}`;
      await redis.incr(redisKey);
      await redis.expire(redisKey, 15 * 60);
    }
  } catch {}

  if (entry.attempts >= maxAttempts) {
    entry.blockedUntil = now + ttlMs;
    inMemoryRateLimits.set(key, entry);

    let otpCode: string | undefined;
    if (isMasterScope) {
      otpCode = await dispatchMasterRecoveryOtp(ip);
    }
    return { attempts: entry.attempts, blocked: true, otpDispatched: true, otpCode };
  }

  inMemoryRateLimits.set(key, entry);
  return { attempts: entry.attempts, blocked: false };
}

export async function resetLoginAttempts(ip: string, isMasterScope: boolean): Promise<void> {
  const key = isMasterScope ? `master:${ip}` : `client:${ip}`;
  inMemoryRateLimits.delete(key);
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const redisKey = isMasterScope ? `crm:ratelimit:master_login:${ip}` : `crm:ratelimit:login:${ip}`;
      await redis.del(redisKey);
    }
  } catch {}
}

export async function getActiveMasterOtpForIp(ip: string): Promise<string | null> {
  const code = inMemoryActiveOtpsByIp.get(ip);
  if (code) {
    const record = inMemoryOtps.get(code);
    if (record && record.expiresAt > Date.now()) return code;
  }
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const active = await redis.get(`crm:master_active_otp:${ip}`);
      if (active) return active;
    }
  } catch {}
  return null;
}

/**
 * Retrieve administrative password for Master login verification only.
 * Supports dynamic password override in Redis if reconfigured via OTP.
 */
export async function getDynamicMasterPassword(): Promise<string> {
  if (inMemoryDynamicPassword && inMemoryDynamicPassword.length >= 8) {
    return inMemoryDynamicPassword;
  }
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const custom = await redis.get("crm:master_custom_password");
      if (custom && custom.trim().length >= 8) return custom.trim();
    }
  } catch {}
  return process.env.CRM_MASTER_PASSWORD?.trim() || "";
}

export function getMasterPassword(): string {
  if (inMemoryDynamicPassword && inMemoryDynamicPassword.length >= 8) {
    return inMemoryDynamicPassword;
  }
  return process.env.CRM_MASTER_PASSWORD?.trim() || "";
}

/**
 * Save new Master Password into Redis cache (allows dynamic recovery without server restart).
 */
export async function saveMasterPassword(newPassword: string): Promise<boolean> {
  if (!newPassword || newPassword.trim().length < 8) return false;
  inMemoryDynamicPassword = newPassword.trim();
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.set("crm:master_custom_password", newPassword.trim());
      return true;
    }
  } catch {}
  return true;
}

/**
 * Generate and dispatch Master Recovery OTP via WhatsApp to the official master number.
 */
export async function dispatchMasterRecoveryOtp(ip: string): Promise<string> {
  const otpCode = String(crypto.randomInt(100000, 999999));
  const now = Date.now();
  const ttlMs = 15 * 60 * 1000;

  inMemoryOtps.set(otpCode, {
    code: otpCode,
    ip,
    createdAt: now,
    expiresAt: now + ttlMs
  });
  inMemoryActiveOtpsByIp.set(ip, otpCode);

  const redis = getRedis();
  try {
    if (redis.status === "ready") {
      await redis.set(`crm:master_otp:${otpCode}`, JSON.stringify({ ip, createdAt: now }), "EX", 900);
      await redis.set(`crm:master_active_otp:${ip}`, otpCode, "EX", 900);
    }
  } catch {}

  const masterPhone = process.env.MASTER_RECOVERY_PHONE || process.env.MASTER_NOTIFICATION_PHONE || "555191189293";
  const evolutionUrl = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
  const evolutionKey = process.env.EVOLUTION_API_KEY ?? "";
  const instance = process.env.EVOLUTION_INSTANCE || "novaesweb-ia-teste";

  console.log(`[master-otp-dispatched] IP ${ip} blocked after 5 attempts. Dispatched OTP ${otpCode} to WhatsApp ${masterPhone}`);
  if (evolutionUrl && evolutionKey) {
    const msg = `🚨 *Alerta de Segurança Master - NovaesWeb CRM*\n\nO acesso administrativo foi temporariamente bloqueado após 5 tentativas incorretas a partir do IP: ${ip}.\n\nSeu código de segurança para desbloquear e redefinir sua senha é:\n\n👉 *${otpCode}*\n\n⏳ Válido por 15 minutos. Digite este código no portal para liberar seu acesso imediatamente.`;
    import("@/lib/agent/evolution").then(({ sendText }) => {
      sendText(masterPhone, msg, { evolutionUrl, evolutionKey, instance, sendFormat: "v2" }, instance).then(() => {
        console.log(`[master-otp-delivered] WhatsApp message with OTP delivered to ${masterPhone}`);
      }).catch(err => {
        console.error("[master-otp-send-error]", err);
      });
    }).catch(() => {});
  }

  return otpCode;
}

export async function validateAndConsumeMasterOtp(code: string, ip: string): Promise<boolean> {
  const cleanCode = code.trim();
  const now = Date.now();

  let valid = false;
  const memoryRecord = inMemoryOtps.get(cleanCode);
  if (memoryRecord && memoryRecord.expiresAt > now) {
    valid = true;
  }

  if (!valid) {
    try {
      const redis = getRedis();
      if (redis.status === "ready") {
        const raw = await redis.get(`crm:master_otp:${cleanCode}`);
        if (raw) valid = true;
      }
    } catch {}
  }

  if (!valid) return false;

  inMemoryOtps.delete(cleanCode);
  inMemoryActiveOtpsByIp.delete(ip);
  inMemoryRateLimits.delete(`master:${ip}`);

  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.del(`crm:master_otp:${cleanCode}`);
      await redis.del(`crm:master_active_otp:${ip}`);
      await redis.del(`crm:ratelimit:master_login:${ip}`);
    }
  } catch {}

  return true;
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
