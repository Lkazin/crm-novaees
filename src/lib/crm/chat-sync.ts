import "server-only";
import { getRedis } from "./plans";
import { normalizeLocalServiceUrl } from "@/lib/runtime-url";

type DeleteResult = { ok: boolean; status: number; detail?: string };

const avatarMemoryCache = new Map<string, { url: string | null; expiresAt: number }>();
const AVATAR_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const AVATAR_EMPTY_TTL_MS = 30 * 60 * 1000; // 30 min for contacts without photo

function getEvolutionSettings() {
  const rawUrl = process.env.EVOLUTION_API_URL || process.env.CRM_EVOLUTION_API_URL || "http://127.0.0.1:8080";
  const evolutionUrl = normalizeLocalServiceUrl(rawUrl, "http://127.0.0.1:8080").replace(/\/+$/, "");
  const evolutionKey = (process.env.EVOLUTION_API_KEY || process.env.CRM_EVOLUTION_API_KEY || "").trim();
  return { evolutionUrl, evolutionKey };
}

export function buildBrPhoneVariants(rawPhone: string): string[] {
  const clean = (rawPhone || "").replace(/@.*$/, "").trim();
  const variants = new Set<string>();
  if (clean) variants.add(clean);
  const digits = clean.replace(/\D/g, "");
  if (digits) {
    variants.add(digits);
    const brWith9 = digits.match(/^55(\d{2})9(\d{8})$/);
    if (brWith9) variants.add(`55${brWith9[1]}${brWith9[2]}`);
    const brWithout9 = digits.match(/^55(\d{2})(\d{8})$/);
    if (brWithout9) variants.add(`55${brWithout9[1]}9${brWithout9[2]}`);
  }
  return Array.from(variants);
}

function toWhatsAppJid(phone: string): string {
  const clean = (phone || "").trim();
  if (clean.includes("@")) return clean;
  const digits = clean.replace(/\D/g, "");
  return `${digits || clean}@s.whatsapp.net`;
}

async function safeDeleteTable(supaUrl: string, headers: Record<string, string>, path: string): Promise<void> {
  try {
    await fetch(`${supaUrl}/rest/v1/${path}`, {
      method: "DELETE",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
  } catch {
    // Best-effort cleanup of optional child tables
  }
}

export async function deleteSingleMessageCascade(
  supaUrl: string,
  supaKey: string,
  tenantId: string,
  messageId: string
): Promise<DeleteResult> {
  const headers = {
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const encodedId = encodeURIComponent(messageId);
  const encodedTenant = encodeURIComponent(tenantId);

  // 1. Clean FK child tables referencing crm_messages.id
  await Promise.all([
    safeDeleteTable(supaUrl, headers, `crm_outbox?message_id=eq.${encodedId}`),
    safeDeleteTable(supaUrl, headers, `crm_quality_events?message_id=eq.${encodedId}`)
  ]);

  // 2. Delete the message itself (scoped to tenant)
  const res = await fetch(
    `${supaUrl}/rest/v1/crm_messages?id=eq.${encodedId}&tenant_id=eq.${encodedTenant}`,
    { method: "DELETE", headers, cache: "no-store", signal: AbortSignal.timeout(7000) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, status: 200 };
}

export async function deleteConversationCascade(
  supaUrl: string,
  supaKey: string,
  tenantId: string,
  conversationId: string
): Promise<DeleteResult> {
  const headers = {
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const encodedConv = encodeURIComponent(conversationId);
  const encodedTenant = encodeURIComponent(tenantId);

  // 1. Fetch message IDs so we can clean crm_outbox FK references first
  try {
    const rMsgs = await fetch(
      `${supaUrl}/rest/v1/crm_messages?conversation_id=eq.${encodedConv}&tenant_id=eq.${encodedTenant}&select=id&limit=1000`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }, cache: "no-store", signal: AbortSignal.timeout(6000) }
    );
    if (rMsgs.ok) {
      const msgs = (await rMsgs.json()) as Array<{ id: string }>;
      // Delete crm_outbox in chunks of 100
      for (let i = 0; i < msgs.length; i += 100) {
        const chunk = msgs.slice(i, i + 100).map(m => encodeURIComponent(m.id)).join(",");
        if (chunk) {
          await safeDeleteTable(supaUrl, headers, `crm_outbox?message_id=in.(${chunk})`);
        }
      }
    }
  } catch {}

  // 2. Delete all direct child tables referencing crm_conversations.id
  await Promise.all([
    safeDeleteTable(supaUrl, headers, `crm_quality_events?conversation_id=eq.${encodedConv}`),
    safeDeleteTable(supaUrl, headers, `crm_handoffs?conversation_id=eq.${encodedConv}`),
    safeDeleteTable(supaUrl, headers, `crm_internal_notes?conversation_id=eq.${encodedConv}`),
    safeDeleteTable(supaUrl, headers, `crm_ai_usage_events?conversation_id=eq.${encodedConv}`),
    safeDeleteTable(supaUrl, headers, `crm_messages?conversation_id=eq.${encodedConv}&tenant_id=eq.${encodedTenant}`)
  ]);

  // 3. Delete the conversation row itself
  const res = await fetch(
    `${supaUrl}/rest/v1/crm_conversations?id=eq.${encodedConv}&tenant_id=eq.${encodedTenant}`,
    { method: "DELETE", headers, cache: "no-store", signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[chat-sync] deleteConversationCascade failed:", res.status, detail);
    return { ok: false, status: res.status, detail };
  }

  // 4. Clean Redis transient escalation/survey keys for this conversation
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.del(`crm:escalation:${conversationId}`, `crm:survey_sent:${conversationId}`);
    }
  } catch {}

  return { ok: true, status: 200 };
}

export async function syncDeleteMessageToWhatsApp(
  instanceName: string,
  phone: string,
  externalId: string,
  fromMe: boolean
): Promise<boolean> {
  const { evolutionUrl, evolutionKey } = getEvolutionSettings();
  if (!evolutionUrl || !evolutionKey || !instanceName || !phone || !externalId) return false;

  const remoteJid = toWhatsAppJid(phone);
  try {
    const res = await fetch(`${evolutionUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey: evolutionKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: externalId,
        remoteJid,
        fromMe
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncDeleteConversationToWhatsApp(
  instanceName: string,
  phone: string,
  messages: Array<{ external_id?: string | null; direction?: string | null }>
): Promise<{ revokedCount: number; archived: boolean }> {
  const { evolutionUrl, evolutionKey } = getEvolutionSettings();
  if (!evolutionUrl || !evolutionKey || !instanceName || !phone) {
    return { revokedCount: 0, archived: false };
  }

  const remoteJid = toWhatsAppJid(phone);
  let revokedCount = 0;

  // 1. Revoke recent outbound messages on WhatsApp so they disappear for everyone
  const outboundWithId = messages
    .filter(m => m.direction === "outbound" && m.external_id)
    .slice(0, 12);

  if (outboundWithId.length > 0) {
    const results = await Promise.allSettled(
      outboundWithId.map(m => syncDeleteMessageToWhatsApp(instanceName, phone, m.external_id!, true))
    );
    revokedCount = results.filter(r => r.status === "fulfilled" && r.value).length;
  }

  // 2. Archive chat on WhatsApp to remove it from the active WhatsApp inbox
  let archived = false;
  const lastWithId = messages.find(m => m.external_id);
  try {
    const body = lastWithId?.external_id
      ? {
          chat: remoteJid,
          archive: true,
          lastMessage: {
            key: {
              remoteJid,
              fromMe: lastWithId.direction === "outbound",
              id: lastWithId.external_id
            }
          }
        }
      : {
          chat: remoteJid,
          archive: true
        };
    const res = await fetch(`${evolutionUrl}/chat/archiveChat/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: evolutionKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    archived = res.ok;
  } catch {
    archived = false;
  }

  return { revokedCount, archived };
}

export async function fetchWhatsAppProfilePictures(
  instanceName: string,
  phones: string[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const uniquePhones = Array.from(new Set(phones.map(p => (p || "").trim()).filter(Boolean))).slice(0, 40);
  if (!instanceName || uniquePhones.length === 0) return result;

  const { evolutionUrl, evolutionKey } = getEvolutionSettings();
  if (!evolutionUrl || !evolutionKey) return result;

  const now = Date.now();
  const missing: string[] = [];

  // 1. Check in-memory cache first (instant)
  for (const phone of uniquePhones) {
    const cacheKey = `${instanceName}:${phone}`;
    const mem = avatarMemoryCache.get(cacheKey);
    if (mem && mem.expiresAt > now) {
      result[phone] = mem.url;
    } else {
      missing.push(phone);
    }
  }
  if (missing.length === 0) return result;

  // 2. Check Redis cache for remaining phones
  const stillMissing: string[] = [];
  let redisReady = false;
  let redisClient: ReturnType<typeof getRedis> | null = null;
  try {
    redisClient = getRedis();
    redisReady = redisClient.status === "ready";
  } catch {}

  if (redisReady && redisClient) {
    try {
      const keys = missing.map(p => `crm:wa_avatar:${instanceName}:${p}`);
      const values = await redisClient.mget(...keys);
      missing.forEach((phone, idx) => {
        const val = values[idx];
        if (val !== null && val !== undefined) {
          const url = val === "__NONE__" ? null : val;
          result[phone] = url;
          avatarMemoryCache.set(`${instanceName}:${phone}`, {
            url,
            expiresAt: now + (url ? AVATAR_TTL_MS : AVATAR_EMPTY_TTL_MS)
          });
        } else {
          stillMissing.push(phone);
        }
      });
    } catch {
      stillMissing.push(...missing);
    }
  } else {
    stillMissing.push(...missing);
  }

  if (stillMissing.length === 0) return result;

  // 3. Fetch up to 12 missing avatars in parallel with tight timeout so data polling stays super fast
  const batch = stillMissing.slice(0, 12);
  await Promise.allSettled(
    batch.map(async phone => {
      try {
        const res = await fetch(`${evolutionUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
          method: "POST",
          headers: { apikey: evolutionKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: phone.replace(/\D/g, "") || phone }),
          cache: "no-store",
          signal: AbortSignal.timeout(2200)
        });
        let picUrl: string | null = null;
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { profilePictureUrl?: string | null };
          if (typeof data?.profilePictureUrl === "string" && /^https?:\/\//i.test(data.profilePictureUrl)) {
            picUrl = data.profilePictureUrl;
          }
        }
        result[phone] = picUrl;
        avatarMemoryCache.set(`${instanceName}:${phone}`, {
          url: picUrl,
          expiresAt: now + (picUrl ? AVATAR_TTL_MS : AVATAR_EMPTY_TTL_MS)
        });
        if (redisReady && redisClient) {
          const ttlSec = picUrl ? 6 * 3600 : 30 * 60;
          await redisClient.set(`crm:wa_avatar:${instanceName}:${phone}`, picUrl || "__NONE__", "EX", ttlSec).catch(() => {});
        }
      } catch {
        result[phone] = null;
      }
    })
  );

  return result;
}
