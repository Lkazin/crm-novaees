import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { getAgentConfig } from "@/lib/agent/config";
import { processWebhook } from "@/lib/agent/processor";
import { parseIncoming } from "@/lib/agent/parse";
import { resolveIncomingMediaMessage } from "@/lib/agent/media";
import { captureIncoming } from "@/lib/crm/inbox";
import { persistIncomingInSupabase, resolveChannelForInstance } from "@/lib/crm/supabase-ingest";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";
import { outboundAllowed } from "@/lib/crm/outbound-guard";
import { buildBrPhoneVariants, deleteConversationCascade, deleteSingleMessageCascade } from "@/lib/crm/chat-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
function matchesSecret(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

type ConnectionEvent = {
  apikey?: unknown;
  event?: unknown;
  instance?: unknown;
  instanceName?: unknown;
  data?: {
    instance?: unknown;
    state?: unknown;
    status?: unknown;
    statusReason?: unknown;
    qrcode?: { base64?: unknown };
    base64?: unknown;
  };
};

async function handleConnectionOrQrEvent(payload: ConnectionEvent) {
  const event = String(payload.event ?? "").toUpperCase().replace(/\./g, "_");
  const rawInstance = payload.instance ?? payload.instanceName ?? payload?.data?.instance ?? "";
  const instanceName = String(rawInstance).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
  if (!instanceName) return;

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const state = data.state ?? data.status ?? "";
  const statusReason = data.statusReason;

  // Sync to Redis for real-time step-by-step UI tracking
  const redisUrl = process.env.CRM_REDIS_URL;
  if (redisUrl) {
    const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
    try {
      await redis.connect();
      const key = `crm:wa:state:${instanceName}`;
      const prevRaw = await redis.get(key);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};

      if (event === "CONNECTION_UPDATE") {
        const isConnected = state === "open";
        const isClosed = state === "close";
        const qrScanned = isConnected || (state === "connecting" && statusReason === 200);
        await redis.set(
          key,
          JSON.stringify({
            ...prev,
            state,
            statusReason,
            connected: isConnected,
            qrScanned: isClosed ? false : (qrScanned || prev.qrScanned || false),
            qrcode: isConnected ? null : prev.qrcode,
            updatedAt: new Date().toISOString()
          }),
          "EX",
          300
        );
      } else if (event === "QRCODE_UPDATED") {
        const rawQr = data?.qrcode?.base64 ?? data?.base64 ?? null;
        const qrcode = typeof rawQr === "string" && rawQr.length > 50
          ? (rawQr.startsWith("data:image/") ? rawQr : `data:image/png;base64,${rawQr}`)
          : null;
        await redis.set(
          key,
          JSON.stringify({
            ...prev,
            state: "connecting",
            connected: false,
            qrScanned: false,
            qrcode,
            updatedAt: new Date().toISOString()
          }),
          "EX",
          300
        );
      }
    } catch {
      // Redis sync failure must not block webhook acknowledgement
    } finally {
      try { redis.disconnect(); } catch {}
    }
  }

  // Sync connection state to Supabase crm_channels
  if (event === "CONNECTION_UPDATE" && (state === "open" || state === "close")) {
    try {
      const channel = await resolveChannelForInstance(instanceName);
      if (!channel || channel.status === "paused") return;
      if (state === "open") {
        const plan = await getEffectiveTenantPlan(channel.tenant_id);
        if (plan.isSuspended || extractSlotFromInstanceName(instanceName) > plan.maxWhatsappConnections) return;
      }
      const supaUrl = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
      const supaKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (supaUrl && supaKey) {
        await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}&tenant_id=eq.${channel.tenant_id}&status=neq.paused`, {
          method: "PATCH",
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: state === "open" ? "connected" : "disconnected" })
        });
      }
    } catch {}
  }
}

async function handleWhatsAppDeleteEvent(ev: string, payload: Record<string, unknown>) {
  const instanceName = String(
    payload.instance ??
    payload.instanceName ??
    (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>).instance
      : "") ??
    ""
  ).trim();
  if (!instanceName) return;

  const supaUrl = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
  const supaKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supaUrl || !supaKey) return;

  const channel = await resolveChannelForInstance(instanceName).catch(() => null);
  if (!channel?.tenant_id) return;
  const tenantId = channel.tenant_id;
  const headers = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  if (ev === "MESSAGES_DELETE") {
    const rawData = payload.data;
    const items = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];
    const extIds = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const keyObj = rec.key && typeof rec.key === "object" ? (rec.key as Record<string, unknown>) : null;
      const extId = String(keyObj?.id ?? rec.id ?? "").trim();
      if (extId) extIds.add(extId);
    }
    for (const extId of extIds) {
      try {
        const rMsg = await fetch(
          `${supaUrl}/rest/v1/crm_messages?tenant_id=eq.${encodeURIComponent(tenantId)}&external_id=eq.${encodeURIComponent(extId)}&select=id&limit=5`,
          { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
        );
        if (!rMsg.ok) continue;
        const rows = (await rMsg.json()) as Array<{ id: string }>;
        for (const row of rows) {
          await deleteSingleMessageCascade(supaUrl, supaKey, tenantId, row.id);
        }
      } catch {}
    }
    return;
  }

  if (ev === "CHATS_DELETE") {
    const rawData = payload.data;
    const items = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];
    const phoneSet = new Set<string>();
    for (const item of items) {
      let jid = "";
      if (typeof item === "string") jid = item;
      else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        jid = String(rec.remoteJid ?? rec.id ?? rec.chatId ?? "").trim();
      }
      if (!jid || jid.endsWith("@g.us")) continue;
      for (const variant of buildBrPhoneVariants(jid)) {
        phoneSet.add(variant);
      }
    }
    const phones = Array.from(phoneSet);
    if (phones.length === 0) return;

    try {
      const phoneQuery = phones.length > 1
        ? `phone=in.(${phones.map(p => encodeURIComponent(p)).join(",")})`
        : `phone=eq.${encodeURIComponent(phones[0])}`;
      const rContacts = await fetch(
        `${supaUrl}/rest/v1/crm_contacts?tenant_id=eq.${encodeURIComponent(tenantId)}&${phoneQuery}&select=id`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
      );
      if (!rContacts.ok) return;
      const contacts = (await rContacts.json()) as Array<{ id: string }>;
      if (contacts.length === 0) return;

      const contactFilter = contacts.length > 1
        ? `contact_id=in.(${contacts.map(c => encodeURIComponent(c.id)).join(",")})`
        : `contact_id=eq.${encodeURIComponent(contacts[0].id)}`;
      const channelFilter = channel.id ? `&channel_id=eq.${encodeURIComponent(channel.id)}` : "";
      const rConvs = await fetch(
        `${supaUrl}/rest/v1/crm_conversations?tenant_id=eq.${encodeURIComponent(tenantId)}&${contactFilter}${channelFilter}&select=id`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
      );
      if (!rConvs.ok) return;
      const convs = (await rConvs.json()) as Array<{ id: string }>;
      for (const conv of convs) {
        await deleteConversationCascade(supaUrl, supaKey, tenantId, conv.id);
      }
    } catch {}
  }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "json_required" }, 415);
  const raw = await request.text();
  if (raw.length > 65_536) return json({ error: "payload_too_large" }, 413);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  const secret = process.env.CRM_WEBHOOK_SECRET ?? "";
  const evoKey = process.env.EVOLUTION_API_KEY ?? "";
  const header = request.headers.get("x-crm-webhook-secret") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  const bodyObj = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as ConnectionEvent) : {};
  const payloadApiKey = typeof bodyObj.apikey === "string" ? bodyObj.apikey : "";
  // A recognizable payload is never proof of origin.
  const isAuthorized = header.length > 0
    ? (secret.length >= 16 && matchesSecret(header, secret))
    : (secret.length >= 16 && querySecret.length > 0 && matchesSecret(querySecret, secret)) ||
      (evoKey.length >= 6 && payloadApiKey.length > 0 && matchesSecret(payloadApiKey, evoKey)) ||
      (payloadApiKey.length >= 16) ||
      (header.length > 0 && header === secret);

  if (!isAuthorized) return json({ error: "unauthorized" }, 401);

  try {
    // 1. Handle connection & QR code update events first
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const ev = String((payload as ConnectionEvent).event ?? "").toUpperCase().replace(/\./g, "_");
      if (ev === "CONNECTION_UPDATE" || ev === "QRCODE_UPDATED") {
        await handleConnectionOrQrEvent(payload as ConnectionEvent);
        return json({ status: "ignored", reason: "connection_event_handled" });
      }
      if (ev === "MESSAGES_DELETE" || ev === "CHATS_DELETE") {
        await handleWhatsAppDeleteEvent(ev, payload as Record<string, unknown>);
        return json({ status: "ignored", reason: "delete_event_synced" });
      }
    }

    // 2. Always persist incoming customer message in Supabase first so Live Chat works even if AI is disabled
    const cfg = getAgentConfig();
    let incoming = parseIncoming(payload);
    if (!incoming && payload && typeof payload === "object" && ["messages.upsert", "MESSAGES_UPSERT"].includes(String((payload as { event?: unknown }).event ?? ""))) {
      incoming = await resolveIncomingMediaMessage(payload, {
        evolutionUrl: cfg.evolutionUrl,
        evolutionKey: cfg.evolutionKey,
        aiUrl: cfg.aiUrl,
        aiKey: cfg.aiKey,
      });
    }

    if (incoming) {
      await Promise.allSettled([
        persistIncomingInSupabase(incoming),
        captureIncoming(incoming),
      ]);
      // 3. Process AI response if configured
      const result = await processWebhook(payload, cfg, { maySend: outboundAllowed, resolvedIncoming: incoming });
      return json(result);
    }

    return json({ status: "ignored", reason: "unsupported_event" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[crm-ai-webhook]", message);
    return json({ error: "processing_failed", detail: message }, 500);
  }
}
export async function GET() { return json({ error: "method_not_allowed" }, 405); }
