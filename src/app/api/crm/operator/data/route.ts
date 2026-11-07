import { NextRequest } from "next/server";
import Redis from "ioredis";
import { privateJson, supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
import { detectCustomerEscalation } from "@/lib/agent/escalation";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Membership = { tenant_id: string; role: string };
type Tenant = { id: string; name: string; status: string };
type Contact = { id: string; phone: string; display_name: string | null; created_at: string };
type Conversation = { id: string; contact_id: string; status: string; mode: string; last_message_at: string | null; assigned_to: string | null };
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; body: string; created_at: string };
type HandoffRow = { id: string; conversation_id: string; requested_by: string; status: string; reason: string | null; created_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return { url, serviceKey };
}

async function serviceQuery<T>(url: string, serviceKey: string, pathAndQuery: string, fallbackToken?: string): Promise<T> {
  if (url && serviceKey.length >= 30) {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(7000)
    });
    if (res.ok) return (await res.json()) as T;
  }
  if (fallbackToken) {
    return await supabaseRows<T>(pathAndQuery, fallbackToken);
  }
  return [] as unknown as T;
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyOperator();
    if (!user) return privateJson({ error: "unauthorized" }, 401);

    const { url, serviceKey } = getServiceConfig();

    const memberships = await serviceQuery<Membership[]>(
      url,
      serviceKey,
      "crm_tenant_memberships?select=tenant_id,role&user_id=eq." + encodeURIComponent(user.id),
      user.token
    );
    if (!memberships.length) {
      return privateJson({ tenants: [], selectedTenant: null, contacts: [], conversations: [], messages: [], note: "no_membership" });
    }

    const allowed = memberships.map(m => m.tenant_id).filter(x => UUID.test(x));
    const tenants = await serviceQuery<Tenant[]>(
      url,
      serviceKey,
      "crm_tenants?select=id,name,status&id=in.(" + allowed.join(",") + ")&order=name.asc",
      user.token
    );

    const requestedTenant = request.nextUrl.searchParams.get("tenant");
    const selected = requestedTenant && UUID.test(requestedTenant)
      ? requestedTenant
      : tenants[0]?.id ?? null;

    if (!selected) {
      return privateJson({ tenants, selectedTenant: null, contacts: [], conversations: [], messages: [] });
    }
    if (!UUID.test(selected) || !allowed.includes(selected)) {
      return privateJson({ error: "tenant_forbidden" }, 403);
    }

    // Check effective plan & auto-block for the selected tenant
    let isSuspended = false;
    let suspensionReason = "";
    const effectivePlan = await getEffectiveTenantPlan(selected);
    if (effectivePlan.isSuspended || (effectivePlan.autoBlock && effectivePlan.isOverdue)) {
      isSuspended = true;
      suspensionReason = effectivePlan.suspensionReason || "payment_overdue";
    }

    const selectedTenantObj = tenants.find(t => t.id === selected);
    if (selectedTenantObj?.status === "suspended") {
      isSuspended = true;
      if (!suspensionReason) suspensionReason = "admin_suspended";
    }

    const query = "tenant_id=eq." + encodeURIComponent(selected);
    const [contacts, rawConversations, messages, tags, contactTags, handoffs] = await Promise.all([
      serviceQuery<Contact[]>(url, serviceKey, "crm_contacts?select=id,phone,display_name,created_at&" + query + "&order=created_at.desc&limit=100", user.token).catch(() => []),
      serviceQuery<Conversation[]>(url, serviceKey, "crm_conversations?select=id,contact_id,status,mode,last_message_at,assigned_to&" + query + "&order=last_message_at.desc.nullslast&limit=100", user.token).catch(() => []),
      serviceQuery<Message[]>(url, serviceKey, "crm_messages?select=id,conversation_id,direction,sender_type,body,created_at&" + query + "&order=created_at.desc&limit=300", user.token).catch(() => []),
      serviceQuery<Array<{ id: string; name: string; color: string }>>(url, serviceKey, "crm_tags?select=id,name,color&" + query, user.token).catch(() => []),
      serviceQuery<Array<{ contact_id: string; tag_id: string }>>(url, serviceKey, "crm_contact_tags?select=contact_id,tag_id&" + query, user.token).catch(() => []),
      serviceQuery<HandoffRow[]>(url, serviceKey, "crm_handoffs?select=id,conversation_id,requested_by,status,reason,created_at&" + query + "&order=created_at.desc&limit=100", user.token).catch(() => [])
    ]);

    // Map latest handoff per conversation
    const pendingHandoffMap = new Map<string, HandoffRow>();
    for (const h of handoffs) {
      if (h.status === "pending" && !pendingHandoffMap.has(h.conversation_id)) {
        pendingHandoffMap.set(h.conversation_id, h);
      }
    }

    // Fetch escalation info & quota usage from Redis
    const escalations: Record<string, { category: string; reason: string; text?: string; timestamp?: string; sentiment?: string }> = {};
    let quotaUsed = 0;
    const redisUrl = process.env.CRM_REDIS_URL;
    if (redisUrl) {
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
        await redis.connect();
        const monthKey = new Date().toISOString().slice(0, 7);
        const quotaKey = effectivePlan.isTrial ? `crm:quota:trial:${selected}` : `crm:quota:${selected}:${monthKey}`;
        const quotaUsedRaw = await redis.get(quotaKey);
        quotaUsed = parseInt(quotaUsedRaw || "0", 10);

        for (const c of rawConversations) {
          const raw = await redis.get(`crm:escalation:${c.id}`);
          if (raw) {
            try {
              escalations[c.id] = JSON.parse(raw);
            } catch {}
          }
        }
        redis.disconnect();
      } catch {}
    }

    // Derive logical conversation status & mode from DB (mode: 'ai'|'human'|'paused', status: 'open'|'pending'|'resolved')
    const conversations: Conversation[] = rawConversations.map(c => {
      const convMsgs = messages.filter(m => m.conversation_id === c.id);
      // messages are ordered created_at.desc, so convMsgs[0] is the newest message
      const newestMsg = convMsgs[0];
      const pendingHandoff = pendingHandoffMap.get(c.id);

      // 1. Closed / Resolved
      if (c.status === "resolved" || c.status === "closed" || c.mode === "paused") {
        return { ...c, mode: "paused", status: "closed" };
      }

      // 2. Waiting for human operator (unclaimed human request or pending handoff)
      if ((c.mode === "human" && c.status === "pending" && !c.assigned_to) || (pendingHandoff && !c.assigned_to && c.mode === "human")) {
        if (!escalations[c.id]) {
          const lastInbound = convMsgs.find(m => m.direction === "inbound" || m.sender_type === "customer");
          const esc = lastInbound ? detectCustomerEscalation(lastInbound.body) : { isEscalation: false };
          escalations[c.id] = {
            category: esc.category || "human_request",
            reason: pendingHandoff?.reason || esc.reason || "Solicitação de Atendente Humano",
            text: lastInbound?.body,
            timestamp: pendingHandoff?.created_at || lastInbound?.created_at || c.last_message_at || undefined,
            sentiment: esc.sentiment || "neutral"
          };
        }
        const isSevere = escalations[c.id]?.sentiment === "urgent" || escalations[c.id]?.sentiment === "frustrated";
        return {
          ...c,
          mode: "human",
          status: isSevere ? "urgent" : "waiting_human"
        };
      }

      // 3. In Human Attendance (claimed by operator)
      if (c.mode === "human") {
        const lastWasHumanReply = newestMsg && newestMsg.direction === "outbound" && newestMsg.sender_type === "human";
        if (c.status === "pending" || lastWasHumanReply) {
          return { ...c, mode: "human", status: "waiting_client" };
        }
        return { ...c, mode: "human", status: "human" };
      }

      // 4. AI Mode
      if (convMsgs.length <= 1 && newestMsg?.direction === "inbound") {
        return { ...c, mode: "ai", status: "ai" };
      }
      return { ...c, mode: "ai", status: "ai" };
    });

    const planData = {
      ...effectivePlan,
      quotaUsed,
    };

    return privateJson({
      tenants,
      selectedTenant: selected,
      isSuspended,
      suspensionReason,
      plan: planData,
      allowedFeatures: effectivePlan.allowedFeatures,
      contacts,
      conversations,
      messages,
      escalations,
      tags,
      contactTags
    });
  } catch {
    return privateJson({ error: "crm_data_unavailable" }, 503);
  }
}
