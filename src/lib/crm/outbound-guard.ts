import "server-only";
import type { Incoming } from "@/lib/agent/parse";

export async function outboundAllowed(incoming: Incoming): Promise<boolean> {
  try {
    const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return true;

    // 1. Check if the instance belongs to a suspended tenant
    const rCh = await fetch(`${url}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(incoming.instance)}&select=tenant_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    const channels = (await rCh.json()) as Array<{ tenant_id: string }>;
    const tenantId = channels?.[0]?.tenant_id;
    if (tenantId) {
      const rTenant = await fetch(`${url}/rest/v1/crm_tenants?id=eq.${tenantId}&select=status`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      const tenants = (await rTenant.json()) as Array<{ status: string }>;
      if (tenants?.[0]?.status === "suspended") {
        return false;
      }

      // 2. Check if a human operator specifically claimed this conversation
      const rContact = await fetch(`${url}/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&phone=eq.${incoming.number}&select=id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store"
      });
      const contacts = (await rContact.json()) as Array<{ id: string }>;
      if (contacts?.[0]?.id) {
        const rConv = await fetch(
          `${url}/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&contact_id=eq.${contacts[0].id}&select=mode,assigned_to&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
        );
        const convs = (await rConv.json()) as Array<{ mode: string; assigned_to: string | null }>;
        // Only block AI if actively assigned to a human operator
        if (convs?.[0]?.mode === "human" && convs?.[0]?.assigned_to) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return true;
  }
}
