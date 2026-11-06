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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return { url, serviceKey };
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyOperator();
    if (!user) return privateJson({ error: "unauthorized" }, 401);

    const memberships = await supabaseRows<Membership[]>(
      "crm_tenant_memberships?select=tenant_id,role&user_id=eq." + encodeURIComponent(user.id),
      user.token
    );
    if (!memberships.length) {
      return privateJson({ tenants: [], selectedTenant: null, contacts: [], conversations: [], messages: [], note: "no_membership" });
    }

    const allowed = memberships.map(m => m.tenant_id).filter(x => UUID.test(x));
    const tenants = await supabaseRows<Tenant[]>(
      "crm_tenants?select=id,name,status&id=in.(" + allowed.join(",") + ")&order=name.asc",
      user.token
    );

    const selected = request.nextUrl.searchParams.get("tenant");
    if (!selected) {
      return privateJson({ tenants, selectedTenant: null, contacts: [], conversations: [], messages: [] });
    }
    if (!UUID.test(selected) || !allowed.includes(selected)) {
      return privateJson({ error: "tenant_forbidden" }, 403);
    }

    const { url, serviceKey } = getServiceConfig();

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
    const [contacts, conversations, messages, tags, contactTags] = await Promise.all([
      supabaseRows<Contact[]>("crm_contacts?select=id,phone,display_name,created_at&" + query + "&order=created_at.desc&limit=100", user.token),
      supabaseRows<Conversation[]>("crm_conversations?select=id,contact_id,status,mode,last_message_at,assigned_to&" + query + "&order=last_message_at.desc.nullslast&limit=100", user.token),
      supabaseRows<Message[]>("crm_messages?select=id,conversation_id,direction,sender_type,body,created_at&" + query + "&order=created_at.desc&limit=300", user.token),
      supabaseRows<Array<{ id: string; name: string; color: string }>>("crm_tags?select=id,name,color&" + query, user.token).catch(() => []),
      supabaseRows<Array<{ contact_id: string; tag_id: string }>>("crm_contact_tags?select=contact_id,tag_id&" + query, user.token).catch(() => [])
    ]);

    // Fetch escalation info & quota usage from Redis
    const escalations: Record<string, { category: string; reason: string; text?: string; timestamp?: string }> = {};
    let quotaUsed = 0;
    const redisUrl = process.env.CRM_REDIS_URL;
    if (redisUrl) {
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
        await redis.connect();
        const monthKey = new Date().toISOString().slice(0, 7);
        const quotaUsedRaw = await redis.get(`crm:quota:${selected}:${monthKey}`);
        quotaUsed = parseInt(quotaUsedRaw || "0", 10);

        const urgentConvs = conversations.filter(c => c.status === "urgent");
        for (const c of urgentConvs) {
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

    // Infer escalation info for any urgent conversation not found in Redis
    for (const c of conversations) {
      if (c.status === "urgent" && !escalations[c.id]) {
        const lastInbound = messages.find(m => m.conversation_id === c.id && (m.direction === "inbound" || m.sender_type === "customer"));
        if (lastInbound) {
          const esc = detectCustomerEscalation(lastInbound.body);
          if (esc.isEscalation) {
            escalations[c.id] = {
              category: esc.category || "complaint",
              reason: esc.reason || "Reclamação ou Frustração do Cliente",
              text: lastInbound.body,
              timestamp: lastInbound.created_at
            };
          } else {
            escalations[c.id] = {
              category: "complaint",
              reason: "Encaminhamento com Prioridade",
              text: lastInbound.body,
              timestamp: lastInbound.created_at
            };
          }
        }
      }
    }

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
