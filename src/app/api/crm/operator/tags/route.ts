import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson, supabaseRows, supabaseSettings, verifyOperator } from "@/lib/crm/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_TAGS = [
  { name: "Interessado", color: "#3b82f6" },
  { name: "Orçamento enviado", color: "#a855f7" },
  { name: "Venda confirmada", color: "#10b981" },
  { name: "Cliente perdido", color: "#6b7280" }
];

export async function GET(request: NextRequest) {
  try {
    const operator = await verifyOperator();
    if (!operator) return privateJson({ error: "unauthorized" }, 401);

    const tenantId = request.nextUrl.searchParams.get("tenant");
    if (!tenantId || !UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

    const member = await supabaseRows<Array<{ role: string }>>(
      "crm_tenant_memberships?select=role&tenant_id=eq." + tenantId + "&user_id=eq." + operator.id + "&limit=1",
      operator.token
    );
    if (!member.length) return privateJson({ error: "not_authorized" }, 403);

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // 1. Fetch tags for this tenant
    const rTags = await fetch(url + `/rest/v1/crm_tags?tenant_id=eq.${tenantId}&select=id,name,color`, {
      headers: { apikey: secret, Authorization: "Bearer " + secret },
      cache: "no-store"
    });
    let tags = (await rTags.json()) as Array<{ id: string; name: string; color: string }>;

    // Seed default tags if none exist
    if (!tags.length) {
      for (const dt of DEFAULT_TAGS) {
        await fetch(url + "/rest/v1/crm_tags", {
          method: "POST",
          headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, name: dt.name, color: dt.color })
        });
      }
      const rNewTags = await fetch(url + `/rest/v1/crm_tags?tenant_id=eq.${tenantId}&select=id,name,color`, {
        headers: { apikey: secret, Authorization: "Bearer " + secret },
        cache: "no-store"
      });
      tags = (await rNewTags.json()) as Array<{ id: string; name: string; color: string }>;
    }

    // 2. Fetch all contact tags for this tenant
    const rContactTags = await fetch(url + `/rest/v1/crm_contact_tags?tenant_id=eq.${tenantId}&select=contact_id,tag_id`, {
      headers: { apikey: secret, Authorization: "Bearer " + secret },
      cache: "no-store"
    });
    const contactTags = (await rContactTags.json()) as Array<{ contact_id: string; tag_id: string }>;

    return privateJson({ tags, contactTags });
  } catch (err) {
    return privateJson({ error: "tags_unavailable" }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {
    const operator = await verifyOperator();
    if (!operator) return privateJson({ error: "unauthorized" }, 401);

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const tagId = typeof body.tagId === "string" ? body.tagId : "";
    const action = body.action === "remove" ? "remove" : "set";

    if (!UUID.test(tenantId) || !UUID.test(contactId) || !UUID.test(tagId)) {
      return privateJson({ error: "invalid_params" }, 400);
    }

    const member = await supabaseRows<Array<{ role: string }>>(
      "crm_tenant_memberships?select=role&tenant_id=eq." + tenantId + "&user_id=eq." + operator.id + "&limit=1",
      operator.token
    );
    if (!member.length) return privateJson({ error: "not_authorized" }, 403);

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    if (action === "remove") {
      await fetch(url + `/rest/v1/crm_contact_tags?tenant_id=eq.${tenantId}&contact_id=eq.${contactId}&tag_id=eq.${tagId}`, {
        method: "DELETE",
        headers: { apikey: secret, Authorization: "Bearer " + secret }
      });
      return privateJson({ success: true, action: "removed" });
    } else {
      // Remove any existing commercial tag on this contact to ensure clean single-stage commercial state
      await fetch(url + `/rest/v1/crm_contact_tags?tenant_id=eq.${tenantId}&contact_id=eq.${contactId}`, {
        method: "DELETE",
        headers: { apikey: secret, Authorization: "Bearer " + secret }
      });

      // Insert new tag
      await fetch(url + "/rest/v1/crm_contact_tags", {
        method: "POST",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, contact_id: contactId, tag_id: tagId })
      });
      return privateJson({ success: true, action: "set", tagId });
    }
  } catch (err) {
    return privateJson({ error: "failed_to_update_tags" }, 500);
  }
}
