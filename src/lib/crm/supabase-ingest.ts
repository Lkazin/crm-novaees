import "server-only";
import type { Incoming } from "@/lib/agent/parse";

type Channel = { id: string; tenant_id: string; status: string };
type Tenant = { id: string; status: string };
type RecordId = { id: string };
type RequestMethod = "GET" | "POST" | "PATCH";

function settings() {
  const url = process.env.CRM_SUPABASE_URL?.trim() ?? "";
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || key.length < 30)
    throw new Error("crm_supabase_ingest_not_configured");
  return { url: url.replace(/\/$/, ""), key };
}

async function db<T>(table: string, query: string, method: RequestMethod, payload?: unknown): Promise<T> {
  const { url, key } = settings();
  const response = await fetch(url + "/rest/v1/" + table + query, {
    method, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: {
      apikey: key, Authorization: "Bearer " + key,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(method === "POST" ? { Prefer: "return=representation" } :
        method === "PATCH" ? { Prefer: "return=minimal" } : {})
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[supabase-db-error] ${table} ${method} failed:`, response.status, errorText);
    throw new Error("crm_supabase_ingest_failed");
  }
  if (method === "PATCH") return undefined as T;
  return await response.json() as T;
}

export async function persistIncomingInSupabase(incoming: Incoming): Promise<"off" | "created" | "duplicate"> {
  if (process.env.CRM_SUPABASE_INGEST_ENABLED !== "true") return "off";

  try {
    // 1. Find or auto-link channel for this instance
    let channels = await db<Channel[]>("crm_channels",
      "?select=id,tenant_id,status&instance_name=eq." + encodeURIComponent(incoming.instance) + "&limit=1", "GET");

    if (!channels.length) {
      // Find the first active tenant to bind this instance to
      const allTenants = await db<Tenant[]>("crm_tenants", "?select=id,status&order=created_at.asc&limit=1", "GET");
      if (!allTenants.length) return "off";
      const tId = allTenants[0].id;
      await db<Channel[]>("crm_channels", "", "POST", {
        tenant_id: tId,
        provider: "evolution",
        instance_name: incoming.instance,
        status: "connected"
      });
      channels = await db<Channel[]>("crm_channels",
        "?select=id,tenant_id,status&instance_name=eq." + encodeURIComponent(incoming.instance) + "&limit=1", "GET");
    }

    if (!channels.length) return "off";
    const channel = channels[0];
    const t = channel.tenant_id;

    // 2. Find or create contact
    const contactQuery = "?select=id&tenant_id=eq." + t + "&phone=eq." + incoming.number + "&limit=1";
    let contacts = await db<RecordId[]>("crm_contacts", contactQuery, "GET");
    if (!contacts.length) {
      await db<RecordId[]>("crm_contacts", "?on_conflict=tenant_id,phone", "POST", {
        tenant_id: t, phone: incoming.number, display_name: incoming.pushName || incoming.number
      });
      contacts = await db<RecordId[]>("crm_contacts", contactQuery, "GET");
    }
    if (!contacts.length) return "off";
    const contact = contacts[0];

    // 3. Find or create conversation in AI mode
    const conversationQuery = "?select=id&tenant_id=eq." + t +
      "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1";
    let threads = await db<RecordId[]>("crm_conversations", conversationQuery, "GET");
    if (!threads.length) {
      await db<RecordId[]>("crm_conversations", "?on_conflict=tenant_id,contact_id,channel_id", "POST", {
        tenant_id: t, contact_id: contact.id, channel_id: channel.id, mode: "ai", status: "open",
        last_message_at: new Date().toISOString()
      });
      threads = await db<RecordId[]>("crm_conversations", conversationQuery, "GET");
    }
    if (!threads.length) return "off";
    const conversation = threads[0];

    // 4. Save incoming message (idempotent by external_id)
    const existing = await db<RecordId[]>("crm_messages",
      "?select=id&conversation_id=eq." + conversation.id + "&external_id=eq." + encodeURIComponent(incoming.id) + "&limit=1", "GET");
    if (!existing.length) {
      await db<RecordId[]>("crm_messages", "", "POST", {
        tenant_id: t,
        conversation_id: conversation.id,
        external_id: incoming.id,
        direction: "inbound",
        sender_type: "customer",
        body: incoming.text,
        delivery_status: "received"
      });
    }

    // Update conversation last_message_at
    await db("crm_conversations", "?id=eq." + conversation.id, "PATCH", {
      last_message_at: new Date().toISOString()
    });

    return "created";
  } catch (e) {
    console.error("[supabase-ingest] Error:", e);
    return "off";
  }
}

export async function persistOutboundInSupabase(instance: string, phone: string, text: string): Promise<void> {
  if (process.env.CRM_SUPABASE_INGEST_ENABLED !== "true") return;
  try {
    const channels = await db<Channel[]>("crm_channels",
      "?select=id,tenant_id&instance_name=eq." + encodeURIComponent(instance) + "&limit=1", "GET");
    if (!channels.length) return;
    const channel = channels[0];
    const t = channel.tenant_id;

    const contacts = await db<RecordId[]>("crm_contacts",
      "?select=id&tenant_id=eq." + t + "&phone=eq." + phone + "&limit=1", "GET");
    if (!contacts.length) return;
    const contact = contacts[0];

    const threads = await db<RecordId[]>("crm_conversations",
      "?select=id&tenant_id=eq." + t + "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1", "GET");
    if (!threads.length) return;
    const conversation = threads[0];

    await db<RecordId[]>("crm_messages", "", "POST", {
      tenant_id: t,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "agent",
      body: text,
      delivery_status: "sent"
    });

    await db("crm_conversations", "?id=eq." + conversation.id, "PATCH", {
      last_message_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("[supabase-ingest-outbound] Error:", e);
  }
}

export type ConversationContext = {
  conversationId?: string;
  mode: "ai" | "human";
  status?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  isFirstInteraction: boolean;
};

export async function fetchConversationContext(instance: string, phone: string, limit = 10): Promise<ConversationContext> {
  const fallback: ConversationContext = { mode: "ai", history: [], isFirstInteraction: true };
  if (process.env.CRM_SUPABASE_INGEST_ENABLED !== "true") return fallback;

  try {
    const channels = await db<Channel[]>("crm_channels",
      "?select=id,tenant_id&instance_name=eq." + encodeURIComponent(instance) + "&limit=1", "GET");
    if (!channels.length) return fallback;
    const channel = channels[0];
    const t = channel.tenant_id;

    const contacts = await db<RecordId[]>("crm_contacts",
      "?select=id&tenant_id=eq." + t + "&phone=eq." + phone + "&limit=1", "GET");
    if (!contacts.length) return fallback;
    const contact = contacts[0];

    const threads = await db<Array<{ id: string; mode: string; status?: string }>>("crm_conversations",
      "?select=id,mode,status&tenant_id=eq." + t + "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1", "GET");
    if (!threads.length) return fallback;
    const conversation = threads[0];
    const mode = (conversation.mode === "human" ? "human" : "ai") as "ai" | "human";
    const status = conversation.status || "open";

    type DbMsg = { direction: string; sender_type: string; body: string; created_at: string };
    const rawMsgs = await db<DbMsg[]>("crm_messages",
      "?conversation_id=eq." + conversation.id + "&select=direction,sender_type,body,created_at&order=created_at.desc&limit=" + limit, "GET");

    if (!rawMsgs || rawMsgs.length === 0) {
      return { conversationId: conversation.id, mode, status, history: [], isFirstInteraction: true };
    }

    // Sort chronologically (oldest to newest)
    const history = rawMsgs.reverse().map(m => ({
      role: (m.direction === "outbound" || m.sender_type === "agent" ? "assistant" : "user") as "user" | "assistant",
      content: m.body || ""
    }));

    return {
      conversationId: conversation.id,
      mode,
      status,
      history,
      isFirstInteraction: history.length <= 1
    };
  } catch (err) {
    console.error("[supabase-fetch-context] Error:", err);
    return fallback;
  }
}

export async function handoffToHuman(instance: string, phone: string, isUrgent = false): Promise<string | null> {
  if (process.env.CRM_SUPABASE_INGEST_ENABLED !== "true") return null;
  try {
    const channels = await db<Channel[]>("crm_channels",
      "?select=id,tenant_id&instance_name=eq." + encodeURIComponent(instance) + "&limit=1", "GET");
    if (!channels.length) return null;
    const channel = channels[0];
    const t = channel.tenant_id;

    const contacts = await db<RecordId[]>("crm_contacts",
      "?select=id&tenant_id=eq." + t + "&phone=eq." + phone + "&limit=1", "GET");
    if (!contacts.length) return null;
    const contact = contacts[0];

    const threads = await db<RecordId[]>("crm_conversations",
      "?select=id&tenant_id=eq." + t + "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1", "GET");
    if (!threads.length) return null;
    const conv = threads[0];

    await db("crm_conversations", "?id=eq." + conv.id, "PATCH", {
      mode: "human",
      status: isUrgent ? "urgent" : "open",
      last_message_at: new Date().toISOString()
    });
    return conv.id;
  } catch (err) {
    console.error("[supabase-handoff] Error:", err);
    return null;
  }
}
