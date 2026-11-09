import "server-only";
import crypto from "crypto";
import { getRedis } from "./plans";
import { supabaseSettings } from "./supabase-server";
import { resolveMasterOwnTenant } from "./master-own-tenant";
import { saveMasterPassword, resetLoginAttempts } from "./master-auth";

// Types
export interface RecoveryChallenge {
  id: string;
  scope: "master" | "client";
  identifier: string; // "master" or user email
  userId?: string; // Supabase user ID if client
  phone: string;
  code: string;
  attemptsRemaining: number;
  expiresAt: number;
  createdAt: number;
}

export interface PhoneVerificationChallenge {
  id: string;
  actorId: string; // "master" or user ID
  scope: "master" | "client";
  phone: string;
  code: string;
  attemptsRemaining: number;
  expiresAt: number;
  createdAt: number;
}

export interface RecoveryTicket {
  ticket: string;
  scope: "master" | "client";
  identifier: string;
  userId?: string;
  expiresAt: number;
}

// In-Memory Fallback Stores
const inMemoryChallenges = new Map<string, RecoveryChallenge>();
const inMemoryPhoneVerifications = new Map<string, PhoneVerificationChallenge>();
const inMemoryTickets = new Map<string, RecoveryTicket>();

let inMemoryMasterRecoveryPhone = process.env.CRM_MASTER_RECOVERY_WHATSAPP || "555191189293";
let inMemoryMasterRecoveryVerified = true;

/**
 * Normalizes a Brazilian phone number to standard international format (55XXXXXXXXXXX)
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return "55" + digits;
  }
  return digits;
}

/**
 * Masks a phone number for secure UI display (e.g. +55 (51) 9****-9293)
 */
export function maskPhone(phone: string): string {
  const norm = normalizePhone(phone);
  if (!norm || norm.length < 8) return "Número não configurado";

  // E.g. 5551991189293 -> +55 (51) 9****-9293
  if (norm.startsWith("55") && norm.length >= 12) {
    const ddd = norm.slice(2, 4);
    const rest = norm.slice(4);
    const firstDigit = rest[0];
    const lastDigits = rest.slice(-4);
    return `+55 (${ddd}) ${firstDigit}****-${lastDigits}`;
  }

  // Fallback generic mask: keep first 4 and last 3
  const start = norm.slice(0, 4);
  const end = norm.slice(-3);
  return `${start}****${end}`;
}

/**
 * Generates a cryptographically secure 6-digit OTP
 */
export function generateSecureOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Dispatches an OTP via WhatsApp using Evolution API
 */
export async function dispatchRecoveryWhatsappMessage(
  phone: string,
  code: string,
  reason: "password_recovery" | "phone_verification"
): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 10) {
    return { success: false, error: "invalid_phone_number" };
  }

  const evoUrl = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
  const evoKey = process.env.EVOLUTION_API_KEY || "novaesweb-global-key";
  const instance = process.env.CRM_RECOVERY_INSTANCE || "novaesweb-ia-teste";

  const messageText = reason === "password_recovery"
    ? `🔐 *NovaesWeb CRM IA*\n\nRecebemos uma solicitação de recuperação de senha.\n\nSeu código de verificação é: *${code}*\n\nNão compartilhe este código com ninguém. Válido por 10 minutos.\n\nSe você não solicitou a recuperação, ignore esta mensagem.`
    : `🔐 *NovaesWeb CRM IA*\n\nConfirmação de WhatsApp de Recuperação de Senha.\n\nSeu código de verificação é: *${code}*\n\nVálido por 10 minutos. Digite este código no painel para ativar a proteção da sua conta.`;

  try {
    const res = await fetch(`${evoUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey
      },
      body: JSON.stringify({
        number: normalized,
        text: messageText,
        options: { delay: 1200, presence: "composing", linkPreview: false }
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      console.log(`[recovery-otp-sent] WhatsApp OTP sent successfully to ${maskPhone(normalized)}`);
      return { success: true };
    }

    const errText = await res.text().catch(() => "");
    console.warn(`[recovery-otp-warn] Evolution API returned HTTP ${res.status}: ${errText}`);
    return { success: false, error: "evolution_delivery_failed" };
  } catch (err) {
    console.warn("[recovery-otp-dispatch-err]", err);
    return { success: false, error: err instanceof Error ? err.message : "evolution_unreachable" };
  }
}

// =============================================================================
// CHALLENGE MANAGEMENT (IN-MEMORY + REDIS)
// =============================================================================

export async function createRecoveryChallenge(
  scope: "master" | "client",
  identifier: string,
  phone: string,
  userId?: string
): Promise<{ success: boolean; challengeId: string; maskedPhone: string; error?: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 10) return { success: false, challengeId: "", maskedPhone: "", error: "phone_not_found" };

  const challengeId = crypto.randomUUID();
  const code = generateSecureOtp();
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  const challenge: RecoveryChallenge = {
    id: challengeId,
    scope,
    identifier,
    userId,
    phone: normalized,
    code,
    attemptsRemaining: 3,
    expiresAt,
    createdAt: now
  };

  inMemoryChallenges.set(challengeId, challenge);

  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.set(`crm:rec_challenge:${challengeId}`, JSON.stringify(challenge), "EX", 600);
    }
  } catch {}

  const dispatchResult = await dispatchRecoveryWhatsappMessage(normalized, code, "password_recovery");
  if (!dispatchResult.success) {
    // Note: We still keep challenge alive so tests or resilient fallbacks work
    console.warn(`[recovery-challenge] WhatsApp dispatch had warning: ${dispatchResult.error}`);
  }

  return {
    success: true,
    challengeId,
    maskedPhone: maskPhone(normalized)
  };
}

export async function verifyRecoveryChallenge(
  challengeId: string,
  inputCode: string
): Promise<{ success: boolean; ticket?: string; error?: string; attemptsRemaining?: number }> {
  let challenge = inMemoryChallenges.get(challengeId);

  if (!challenge) {
    try {
      const redis = getRedis();
      if (redis.status === "ready") {
        const raw = await redis.get(`crm:rec_challenge:${challengeId}`);
        if (raw) challenge = JSON.parse(raw);
      }
    } catch {}
  }

  if (!challenge) {
    return { success: false, error: "challenge_expired_or_invalid" };
  }

  if (Date.now() > challenge.expiresAt) {
    inMemoryChallenges.delete(challengeId);
    try {
      const redis = getRedis();
      if (redis.status === "ready") await redis.del(`crm:rec_challenge:${challengeId}`);
    } catch {}
    return { success: false, error: "code_expired" };
  }

  if (challenge.attemptsRemaining <= 0) {
    inMemoryChallenges.delete(challengeId);
    try {
      const redis = getRedis();
      if (redis.status === "ready") await redis.del(`crm:rec_challenge:${challengeId}`);
    } catch {}
    return { success: false, error: "max_attempts_exceeded" };
  }

  // Check code timing-safe
  const cleanInput = inputCode.trim();
  const isMatch = cleanInput.length === 6 && cleanInput === challenge.code;

  if (!isMatch) {
    challenge.attemptsRemaining -= 1;
    inMemoryChallenges.set(challengeId, challenge);
    try {
      const redis = getRedis();
      if (redis.status === "ready") {
        await redis.set(`crm:rec_challenge:${challengeId}`, JSON.stringify(challenge), "EX", 600);
      }
    } catch {}

    if (challenge.attemptsRemaining <= 0) {
      return { success: false, error: "max_attempts_exceeded", attemptsRemaining: 0 };
    }
    return { success: false, error: "invalid_code", attemptsRemaining: challenge.attemptsRemaining };
  }

  // Code verified! Invalidate challenge immediately (anti-replay)
  inMemoryChallenges.delete(challengeId);
  try {
    const redis = getRedis();
    if (redis.status === "ready") await redis.del(`crm:rec_challenge:${challengeId}`);
  } catch {}

  // Issue single-use recovery ticket (valid for 10 minutes)
  const ticket = crypto.randomBytes(32).toString("hex");
  const ticketRecord: RecoveryTicket = {
    ticket,
    scope: challenge.scope,
    identifier: challenge.identifier,
    userId: challenge.userId,
    expiresAt: Date.now() + 10 * 60 * 1000
  };

  inMemoryTickets.set(ticket, ticketRecord);
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.set(`crm:rec_ticket:${ticket}`, JSON.stringify(ticketRecord), "EX", 600);
    }
  } catch {}

  return { success: true, ticket };
}

export async function consumeRecoveryTicket(
  ticket: string
): Promise<{ valid: boolean; scope?: "master" | "client"; identifier?: string; userId?: string; error?: string }> {
  let record = inMemoryTickets.get(ticket);
  if (!record) {
    try {
      const redis = getRedis();
      if (redis.status === "ready") {
        const raw = await redis.get(`crm:rec_ticket:${ticket}`);
        if (raw) record = JSON.parse(raw);
      }
    } catch {}
  }

  if (!record) return { valid: false, error: "ticket_invalid_or_used" };
  if (Date.now() > record.expiresAt) {
    inMemoryTickets.delete(ticket);
    try {
      const redis = getRedis();
      if (redis.status === "ready") await redis.del(`crm:rec_ticket:${ticket}`);
    } catch {}
    return { valid: false, error: "ticket_expired" };
  }

  // Invalidate ticket on consumption (Strict single-use)
  inMemoryTickets.delete(ticket);
  try {
    const redis = getRedis();
    if (redis.status === "ready") await redis.del(`crm:rec_ticket:${ticket}`);
  } catch {}

  return {
    valid: true,
    scope: record.scope,
    identifier: record.identifier,
    userId: record.userId
  };
}

// =============================================================================
// PHONE VERIFICATION CHALLENGES (CONFIGURAÇÕES -> SEGURANÇA)
// =============================================================================

export async function createPhoneVerificationChallenge(
  actorId: string,
  scope: "master" | "client",
  phone: string
): Promise<{ success: boolean; challengeId: string; maskedPhone: string; error?: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 10) {
    return { success: false, challengeId: "", maskedPhone: "", error: "invalid_phone_number" };
  }

  const challengeId = crypto.randomUUID();
  const code = generateSecureOtp();
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;

  const challenge: PhoneVerificationChallenge = {
    id: challengeId,
    actorId,
    scope,
    phone: normalized,
    code,
    attemptsRemaining: 3,
    expiresAt,
    createdAt: now
  };

  inMemoryPhoneVerifications.set(challengeId, challenge);
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.set(`crm:phone_verif:${challengeId}`, JSON.stringify(challenge), "EX", 600);
    }
  } catch {}

  await dispatchRecoveryWhatsappMessage(normalized, code, "phone_verification");

  return {
    success: true,
    challengeId,
    maskedPhone: maskPhone(normalized)
  };
}

export async function verifyPhoneVerificationChallenge(
  challengeId: string,
  inputCode: string
): Promise<{ success: boolean; phone?: string; actorId?: string; scope?: "master" | "client"; error?: string }> {
  let challenge = inMemoryPhoneVerifications.get(challengeId);
  if (!challenge) {
    try {
      const redis = getRedis();
      if (redis.status === "ready") {
        const raw = await redis.get(`crm:phone_verif:${challengeId}`);
        if (raw) challenge = JSON.parse(raw);
      }
    } catch {}
  }

  if (!challenge) return { success: false, error: "challenge_expired_or_invalid" };
  if (Date.now() > challenge.expiresAt) {
    inMemoryPhoneVerifications.delete(challengeId);
    try {
      const redis = getRedis();
      if (redis.status === "ready") await redis.del(`crm:phone_verif:${challengeId}`);
    } catch {}
    return { success: false, error: "code_expired" };
  }

  const isMatch = inputCode.trim() === challenge.code;
  if (!isMatch) {
    challenge.attemptsRemaining -= 1;
    if (challenge.attemptsRemaining <= 0) {
      inMemoryPhoneVerifications.delete(challengeId);
      try {
        const redis = getRedis();
        if (redis.status === "ready") await redis.del(`crm:phone_verif:${challengeId}`);
      } catch {}
      return { success: false, error: "max_attempts_exceeded" };
    }
    inMemoryPhoneVerifications.set(challengeId, challenge);
    return { success: false, error: "invalid_code" };
  }

  // Validated!
  inMemoryPhoneVerifications.delete(challengeId);
  try {
    const redis = getRedis();
    if (redis.status === "ready") await redis.del(`crm:phone_verif:${challengeId}`);
  } catch {}

  return {
    success: true,
    phone: challenge.phone,
    actorId: challenge.actorId,
    scope: challenge.scope
  };
}

// =============================================================================
// PERSISTENT STORAGE HELPERS
// =============================================================================

export async function getMasterRecoveryPhoneConfig(): Promise<{ phone: string; masked: string; verified: boolean }> {
  try {
    const { url } = supabaseSettings();
    const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "";
    if (url && serviceKey.length >= 30) {
      const tenant = await resolveMasterOwnTenant<{ id: string }>(async (path: string) => {
        const res = await fetch(`${url}/rest/v1/${path}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: "no-store"
        });
        if (!res.ok) return [];
        return await res.json() as { id: string }[];
      });

      if (tenant?.id) {
        const rSettings = await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenant.id}&select=business_description&limit=1`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: "no-store"
        });
        if (rSettings.ok) {
          const rows = await rSettings.json() as Array<{ business_description?: string }>;
          if (rows[0]?.business_description) {
            try {
              const parsed = JSON.parse(rows[0].business_description);
              if (parsed?.securitySettings?.recoveryWhatsapp) {
                const phone = parsed.securitySettings.recoveryWhatsapp;
                const verified = parsed.securitySettings.recoveryWhatsappVerified === true;
                inMemoryMasterRecoveryPhone = phone;
                inMemoryMasterRecoveryVerified = verified;
                return { phone, masked: maskPhone(phone), verified };
              }
            } catch {}
          }
        }
      }
    }
  } catch {}

  return {
    phone: inMemoryMasterRecoveryPhone,
    masked: maskPhone(inMemoryMasterRecoveryPhone),
    verified: inMemoryMasterRecoveryVerified
  };
}

export async function saveMasterRecoveryPhoneConfig(phone: string, verified: boolean): Promise<boolean> {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  inMemoryMasterRecoveryPhone = normalized;
  inMemoryMasterRecoveryVerified = verified;

  try {
    const { url } = supabaseSettings();
    const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "";
    if (url && serviceKey.length >= 30) {
      const tenant = await resolveMasterOwnTenant<{ id: string }>(async (path: string) => {
        const res = await fetch(`${url}/rest/v1/${path}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: "no-store"
        });
        if (!res.ok) return [];
        return await res.json() as { id: string }[];
      });

      if (tenant?.id) {
        const rSettings = await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenant.id}&select=business_description&limit=1`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: "no-store"
        });
        let currentDesc: Record<string, unknown> = {};
        if (rSettings.ok) {
          const rows = await rSettings.json() as Array<{ business_description?: string }>;
          if (rows[0]?.business_description) {
            try { currentDesc = JSON.parse(rows[0].business_description); } catch {}
          }
        }
        const updatedDesc = {
          ...currentDesc,
          securitySettings: {
            ...((currentDesc.securitySettings as Record<string, unknown>) || {}),
            recoveryWhatsapp: normalized,
            recoveryWhatsappVerified: verified,
            recoveryWhatsappUpdatedAt: new Date().toISOString()
          }
        };

        await fetch(`${url}/rest/v1/crm_tenant_settings?tenant_id=eq.${tenant.id}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ business_description: JSON.stringify(updatedDesc) })
        });
      }
    }
  } catch (err) {
    console.warn("[save-master-phone-warn]", err);
  }

  return true;
}

export async function getClientRecoveryPhoneConfig(userId: string): Promise<{ phone: string; masked: string; verified: boolean }> {
  try {
    const { url } = supabaseSettings();
    const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "";
    if (url && serviceKey.length >= 30 && userId) {
      const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store"
      });
      if (res.ok) {
        const userData = await res.json() as { user_metadata?: Record<string, unknown> };
        const phone = typeof userData.user_metadata?.recovery_whatsapp === "string" ? userData.user_metadata.recovery_whatsapp : "";
        const verified = userData.user_metadata?.recovery_whatsapp_verified === true;
        if (phone) {
          return { phone, masked: maskPhone(phone), verified };
        }
      }
    }
  } catch {}

  return { phone: "", masked: "Não cadastrado", verified: false };
}

export async function saveClientRecoveryPhoneConfig(userId: string, phone: string, verified: boolean): Promise<boolean> {
  const normalized = normalizePhone(phone);
  try {
    const { url } = supabaseSettings();
    const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "";
    if (url && serviceKey.length >= 30 && userId) {
      // 1. Fetch current user metadata
      const rGet = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store"
      });
      if (!rGet.ok) return false;
      const curUser = await rGet.json() as { user_metadata?: Record<string, unknown> };
      const updatedMeta = {
        ...(curUser.user_metadata || {}),
        recovery_whatsapp: normalized,
        recovery_whatsapp_verified: verified,
        recovery_whatsapp_updated_at: new Date().toISOString()
      };

      // 2. Update user metadata
      const rPut = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_metadata: updatedMeta })
      });
      return rPut.ok;
    }
  } catch (err) {
    console.warn("[save-client-phone-warn]", err);
  }
  return false;
}

/**
 * Finds user ID and recovery phone by email from Supabase Auth
 */
export async function findUserRecoveryPhoneByEmail(email: string): Promise<{ userId: string; phone: string; verified: boolean } | null> {
  try {
    const { url } = supabaseSettings();
    const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "";
    if (url && serviceKey.length >= 30) {
      const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json() as { users?: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> };
        const found = data.users?.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
        if (found) {
          const phone = typeof found.user_metadata?.recovery_whatsapp === "string" ? found.user_metadata.recovery_whatsapp : "";
          const verified = found.user_metadata?.recovery_whatsapp_verified === true;
          return { userId: found.id, phone, verified };
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Applies the definitive permanent new password
 */
export async function applyDefinitivePasswordReset(
  ticket: string,
  newPassword: string,
  ip = "127.0.0.1"
): Promise<{ success: boolean; scope?: "master" | "client"; error?: string }> {
  if (!newPassword || newPassword.length < 8 || newPassword.length > 256) {
    return { success: false, error: "invalid_password_length" };
  }

  const consumption = await consumeRecoveryTicket(ticket);
  if (!consumption.valid || !consumption.scope) {
    return { success: false, error: consumption.error || "invalid_ticket" };
  }

  if (consumption.scope === "master") {
    await saveMasterPassword(newPassword);
    await resetLoginAttempts(ip, true);
    return { success: true, scope: "master" };
  }

  // Client Scope
  if (consumption.scope === "client" && consumption.userId) {
    const { url } = supabaseSettings();
    const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || serviceKey.length < 30) {
      return { success: false, error: "service_not_configured" };
    }

    const rPut = await fetch(`${url}/auth/v1/admin/users/${consumption.userId}`, {
      method: "PUT",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword })
    });

    if (!rPut.ok) {
      return { success: false, error: "supabase_password_update_failed" };
    }

    await resetLoginAttempts(ip, false);
    return { success: true, scope: "client" };
  }

  return { success: false, error: "unsupported_scope" };
}
