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

// Track recently sent AI/CRM outbound message IDs so fromMe webhooks never mistake bot replies for manual phone replies
const recentOutboundEchoes = new Map<string, number>();

export async function markOutboundEcho(externalId?: string | null): Promise<void> {
  const id = (externalId || "").trim();
  if (!id) return;
  const now = Date.now();
  recentOutboundEchoes.set(id, now + 90_000);
  // Prune expired entries occasionally
  if (recentOutboundEchoes.size > 500) {
    for (const [k, exp] of recentOutboundEchoes.entries()) {
      if (exp < now) recentOutboundEchoes.delete(k);
    }
  }
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      await redis.set(`crm:outbound_echo:${id}`, "1", "EX", 90);
    }
  } catch {}
}

async function isOutboundEcho(externalId: string): Promise<boolean> {
  const exp = recentOutboundEchoes.get(externalId);
  if (exp && exp > Date.now()) return true;
  try {
    const redis = getRedis();
    if (redis.status === "ready") {
      const exists = await redis.exists(`crm:outbound_echo:${externalId}`);
      if (exists === 1) return true;
    }
  } catch {}
  return false;
}

const DELIVERY_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3
};

export function mapEvolutionAckToDeliveryStatus(rawStatus: unknown): "sent" | "delivered" | "read" | null {
  if (typeof rawStatus === "number") {
    if (rawStatus >= 4) return "read";
    if (rawStatus === 3) return "delivered";
    if (rawStatus === 2) return "sent";
    return null;
  }
  const s = String(rawStatus ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s === "READ" || s === "PLAYED" || s === "4" || s === "5") return "read";
  if (s === "DELIVERY_ACK" || s === "DELIVERED" || s === "3") return "delivered";
  if (s === "SERVER_ACK" || s === "SENT" || s === "2") return "sent";
  return null;
}

export async function handleWhatsAppMessageUpdate(
  supaUrl: string,
  supaKey: string,
  tenantId: string,
  payload: Record<string, unknown>
): Promise<number> {
  const rawData = payload.data;
  const items = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];
  if (items.length === 0) return 0;

  const headers = {
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    "Content-Type": "application/json"
  };
  let updated = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const keyObj = rec.key && typeof rec.key === "object" ? (rec.key as Record<string, unknown>) : null;
    const updateObj = rec.update && typeof rec.update === "object" ? (rec.update as Record<string, unknown>) : null;
    const extId = String(rec.keyId ?? keyObj?.id ?? rec.id ?? "").trim();
    const nextStatus = mapEvolutionAckToDeliveryStatus(rec.status ?? updateObj?.status);
    if (!extId || !nextStatus) continue;

    try {
      const rCheck = await fetch(
        `${supaUrl}/rest/v1/crm_messages?tenant_id=eq.${encodeURIComponent(tenantId)}&external_id=eq.${encodeURIComponent(extId)}&select=id,delivery_status&limit=2`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(4000) }
      );
      if (!rCheck.ok) continue;
      const rows = (await rCheck.json()) as Array<{ id: string; delivery_status?: string | null }>;
      for (const row of rows) {
        const curRank = DELIVERY_RANK[String(row.delivery_status || "sent").toLowerCase()] ?? 1;
        const nextRank = DELIVERY_RANK[nextStatus] ?? 1;
        if (nextRank <= curRank) continue;
        const rPatch = await fetch(
          `${supaUrl}/rest/v1/crm_messages?id=eq.${encodeURIComponent(row.id)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ delivery_status: nextStatus }),
            cache: "no-store",
            signal: AbortSignal.timeout(4000)
          }
        );
        if (rPatch.ok) updated += 1;
      }
    } catch {}
  }

  return updated;
}

function extractFromMeText(msg: Record<string, unknown> | null): string {
  if (!msg) return "";
  if (typeof msg.conversation === "string" && msg.conversation.trim()) return msg.conversation.trim();
  const ext = msg.extendedTextMessage as Record<string, unknown> | undefined;
  if (typeof ext?.text === "string" && ext.text.trim()) return ext.text.trim();
  const img = msg.imageMessage as Record<string, unknown> | undefined;
  if (img) return typeof img.caption === "string" && img.caption.trim() ? `[Imagem] ${img.caption.trim()}` : "[Imagem enviada pelo celular]";
  const aud = msg.audioMessage as Record<string, unknown> | undefined;
  if (aud) return "[Áudio enviado pelo celular]";
  const vid = msg.videoMessage as Record<string, unknown> | undefined;
  if (vid) return typeof vid.caption === "string" && vid.caption.trim() ? `[Vídeo] ${vid.caption.trim()}` : "[Vídeo enviado pelo celular]";
  const doc = msg.documentMessage as Record<string, unknown> | undefined;
  if (doc) return `[Documento: ${String(doc.fileName || "arquivo")}]`;
  const stk = msg.stickerMessage as Record<string, unknown> | undefined;
  if (stk) return "[Figurinha]";
  return "";
}

export async function handleWhatsAppFromMeMessage(
  supaUrl: string,
  supaKey: string,
  tenantId: string,
  channelId: string,
  payload: Record<string, unknown>
): Promise<"ignored" | "echo" | "mirrored_and_paused"> {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : null;
  if (!data) return "ignored";
  const keyObj = data.key && typeof data.key === "object" ? (data.key as Record<string, unknown>) : null;
  if (keyObj?.fromMe !== true) return "ignored";

  const remoteJid = String(keyObj.remoteJid ?? "").trim();
  const externalId = String(keyObj.id ?? "").trim();
  if (!remoteJid || !externalId || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
    return "ignored";
  }

  // Ignore protocol/reaction/delete control packets
  const msgObj = data.message && typeof data.message === "object" ? (data.message as Record<string, unknown>) : null;
  if (!msgObj || msgObj.protocolMessage || msgObj.reactionMessage) return "ignored";

  // 1. Check fast echo cache so AI/CRM replies are NEVER mistaken for manual phone replies
  if (await isOutboundEcho(externalId)) {
    return "echo";
  }

  const headers = {
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };

  // 2. Also verify against Supabase crm_messages (in case Redis missed or container restarted)
  try {
    const rExists = await fetch(
      `${supaUrl}/rest/v1/crm_messages?tenant_id=eq.${encodeURIComponent(tenantId)}&external_id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(4000) }
    );
    if (rExists.ok) {
      const existing = (await rExists.json()) as Array<{ id: string }>;
      if (existing.length > 0) return "echo";
    }
  } catch {}

  const bodyText = extractFromMeText(msgObj);
  if (!bodyText) return "ignored";

  // 3. Resolve phone (supporting BR 9th-digit variants)
  const phoneClean = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
  if (phoneClean.length < 8) return "ignored";
  const variants = buildBrPhoneVariants(phoneClean);
  const phoneQuery = variants.length > 1
    ? `phone=in.(${variants.map(v => encodeURIComponent(v)).join(",")})`
    : `phone=eq.${encodeURIComponent(phoneClean)}`;

  let contactId = "";
  try {
    const rContact = await fetch(
      `${supaUrl}/rest/v1/crm_contacts?tenant_id=eq.${encodeURIComponent(tenantId)}&${phoneQuery}&select=id&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    const contacts = rContact.ok ? ((await rContact.json()) as Array<{ id: string }>) : [];
    if (contacts[0]?.id) {
      contactId = contacts[0].id;
    } else {
      const rNewContact = await fetch(
        `${supaUrl}/rest/v1/crm_contacts?on_conflict=tenant_id,phone`,
        {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation,resolution=merge-duplicates" },
          body: JSON.stringify({ tenant_id: tenantId, phone: phoneClean, display_name: phoneClean }),
          cache: "no-store",
          signal: AbortSignal.timeout(5000)
        }
      );
      if (rNewContact.ok) {
        const created = (await rNewContact.json()) as Array<{ id: string }>;
        contactId = created[0]?.id || "";
      }
    }
  } catch {}

  if (!contactId) return "ignored";

  // 4. Find or create conversation in HUMAN mode immediately
  let conversationId = "";
  const nowIso = new Date().toISOString();
  try {
    const rConv = await fetch(
      `${supaUrl}/rest/v1/crm_conversations?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(contactId)}&channel_id=eq.${encodeURIComponent(channelId)}&select=id&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    const convs = rConv.ok ? ((await rConv.json()) as Array<{ id: string }>) : [];
    if (convs[0]?.id) {
      conversationId = convs[0].id;
    } else {
      const rNewConv = await fetch(
        `${supaUrl}/rest/v1/crm_conversations?on_conflict=tenant_id,contact_id,channel_id`,
        {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation,resolution=merge-duplicates" },
          body: JSON.stringify({
            tenant_id: tenantId,
            contact_id: contactId,
            channel_id: channelId,
            mode: "human",
            status: "pending",
            last_message_at: nowIso
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(5000)
        }
      );
      if (rNewConv.ok) {
        const created = (await rNewConv.json()) as Array<{ id: string }>;
        conversationId = created[0]?.id || "";
      }
    }
  } catch {}

  if (!conversationId) return "ignored";

  // 5. Mirror manual phone message into crm_messages + pause AI permanently for this contact
  await Promise.allSettled([
    fetch(`${supaUrl}/rest/v1/crm_messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tenant_id: tenantId,
        conversation_id: conversationId,
        external_id: externalId,
        direction: "outbound",
        sender_type: "human",
        body: bodyText,
        delivery_status: "sent"
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    }),
    fetch(
      `${supaUrl}/rest/v1/crm_conversations?tenant_id=eq.${encodeURIComponent(tenantId)}&contact_id=eq.${encodeURIComponent(contactId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          mode: "human",
          status: "pending",
          last_message_at: nowIso,
          updated_at: nowIso
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      }
    ),
    (async () => {
      try {
        const redis = getRedis();
        if (redis.status === "ready") {
          await redis.set(`crm:human_lock:${tenantId}:${contactId}`, "1");
        }
      } catch {}
    })()
  ]);

  return "mirrored_and_paused";
}
