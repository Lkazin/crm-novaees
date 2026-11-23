import "server-only";
import type { Incoming } from "@/lib/agent/parse";
import { getEffectiveTenantPlan } from "./plans";
import { extractSlotFromInstanceName } from "./whatsapp-slots";
import { resolveChannelForInstance } from "./supabase-ingest";

function buildPhoneVariants(rawPhone: string): string[] {
  const clean = (rawPhone || "").trim();
  const variants = new Set<string>();
  if (clean) variants.add(clean);
  const digits = clean.replace(/\D/g, "");
  if (digits) {
    variants.add(digits);
    const brWith9 = digits.match(/^55(\d{2})9(\d{8})$/);
    if (brWith9) {
      variants.add(`55${brWith9[1]}${brWith9[2]}`);
    }
    const brWithout9 = digits.match(/^55(\d{2})(\d{8})$/);
    if (brWithout9) {
      variants.add(`55${brWithout9[1]}9${brWithout9[2]}`);
    }
  }
  return Array.from(variants);
}

export async function outboundAllowed(incoming: Incoming): Promise<boolean> {
  try {
    const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return false;

    // 1. Resolve channel & tenant for this instance
    const channel = await resolveChannelForInstance(incoming.instance).catch(() => null);
    const tenantId = channel?.tenant_id;
    if (!tenantId || channel?.status === "paused") return false;
    const plan = await getEffectiveTenantPlan(tenantId);
    if (plan.isSuspended || plan.featureStates?.ai_chat?.state !== "allowed" || extractSlotFromInstanceName(incoming.instance) > plan.maxWhatsappConnections) return false;
    if (tenantId) {
      const rTenant = await fetch(`${url}/rest/v1/crm_tenants?id=eq.${tenantId}&select=status`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      if (!rTenant.ok) return false;
      const tenants = (await rTenant.json()) as Array<{ status: string }>;
      if (tenants?.[0]?.status !== "active") {
        return false;
      }

      // 2. Block AI if this WhatsApp number (including BR 9th-digit variants) is in human mode, waiting for human, or closed
      const phoneVariants = buildPhoneVariants(incoming.number);
      const phoneQuery = phoneVariants.length > 1
        ? `phone=in.(${phoneVariants.map(p => encodeURIComponent(p)).join(",")})`
        : `phone=eq.${encodeURIComponent(incoming.number)}`;
      const rContact = await fetch(`${url}/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&${phoneQuery}&select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      if (!rContact.ok) return false;
      const contacts = (await rContact.json()) as Array<{ id: string }>;
      if (contacts.length > 0) {
        const contactFilter = contacts.length > 1
          ? `contact_id=in.(${contacts.map(c => encodeURIComponent(c.id)).join(",")})`
          : `contact_id=eq.${encodeURIComponent(contacts[0].id)}`;
        const rConv = await fetch(
          `${url}/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&${contactFilter}&select=mode,status,assigned_to,channel_id&order=last_message_at.desc&limit=10`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
        );
        if (!rConv.ok) return false;
        const convs = (await rConv.json()) as Array<{ mode: string; status: string; assigned_to: string | null; channel_id?: string | null }>;
        // If ANY conversation for this WhatsApp number in this tenant is in human mode, block AI immediately
        if (convs.some(c => c.mode === "human")) {
          return false;
        }
        const channelConv = channel?.id
          ? convs.find(c => c.channel_id === channel.id) ?? convs[0]
          : convs[0];
        if (channelConv) {
          if (channelConv.mode !== "ai" || channelConv.status === "pending" || channelConv.status === "resolved") {
            return false;
          }
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}
