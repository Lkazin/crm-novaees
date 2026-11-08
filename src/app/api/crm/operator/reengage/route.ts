import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
import { sendText, type EvolutionSendConfig } from "@/lib/agent/evolution";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET: List inactive contacts and summary stats for campaign preview
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") || "";
  const days = Math.max(0, parseInt(searchParams.get("days") || "30", 10));

  if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

  const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
  if (!access) return privateJson({ error: "not_authorized" }, 403);

  const featureGuard = await requireTenantFeature(tenantId, "human_handoff");
  if (!featureGuard.allowed) {
    return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);
  }

  const { url } = supabaseSettings();
  const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

  // 1. Fetch contacts
  const rContacts = await fetch(
    `${url}/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&select=id,phone,display_name,created_at&order=created_at.desc&limit=500`,
    { headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store" }
  );
  if (!rContacts.ok) return privateJson({ error: "contacts_fetch_failed" }, 500);
  const contacts = (await rContacts.json()) as Array<{ id: string; phone: string; display_name: string | null; created_at: string }>;

  // 2. Fetch conversations to check last interaction
  const rConvs = await fetch(
    `${url}/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&select=id,contact_id,updated_at`,
    { headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store" }
  );
  const convs = rConvs.ok ? ((await rConvs.json()) as Array<{ id: string; contact_id: string; updated_at: string }>) : [];
  const convMap = new Map<string, { id: string; updated_at: string }>();
  for (const c of convs) convMap.set(c.contact_id, c);

  const now = Date.now();
  const cutoffTime = days > 0 ? now - days * 24 * 60 * 60 * 1000 : now;

  const inactiveList: Array<{
    id: string;
    phone: string;
    name: string;
    conversationId?: string;
    daysInactive: number;
  }> = [];

  for (const contact of contacts) {
    const conv = convMap.get(contact.id);
    const lastActive = conv?.updated_at ? new Date(conv.updated_at).getTime() : new Date(contact.created_at).getTime();
    const daysInactive = Math.max(0, Math.floor((now - lastActive) / (1000 * 60 * 60 * 24)));

    if (days === 0 || lastActive <= cutoffTime) {
      inactiveList.push({
        id: contact.id,
        phone: contact.phone,
        name: contact.display_name || "Cliente",
        conversationId: conv?.id,
        daysInactive
      });
    }
  }

  return privateJson({
    ok: true,
    totalContacts: contacts.length,
    eligibleCount: inactiveList.length,
    daysThreshold: days,
    contacts: inactiveList.slice(0, 100)
  });
}

// POST: Execute re-engagement dispatch for inactive contacts
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const messageTemplate = typeof body.messageTemplate === "string" ? body.messageTemplate.trim() : "";
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    const days = Math.max(0, parseInt(body.days || "30", 10));
    const targetContactIds: string[] = Array.isArray(body.targetContactIds) ? body.targetContactIds : [];

    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);
    if (!messageTemplate || messageTemplate.length < 5) {
      return privateJson({ error: "template_too_short", message: "A mensagem deve ter pelo menos 5 caracteres." }, 400);
    }

    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "not_authorized" }, 403);

    const featureGuard = await requireTenantFeature(tenantId, "human_handoff");
    if (!featureGuard.allowed) {
      return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);
    }

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // 1. Fetch tenant name for placeholder
    const rTenant = await fetch(`${url}/rest/v1/crm_tenants?id=eq.${tenantId}&select=name&limit=1`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store"
    });
    const tenantRows = rTenant.ok ? ((await rTenant.json()) as Array<{ name: string }>) : [];
    const storeName = tenantRows[0]?.name || "nossa loja";

    // 2. Fetch connected WhatsApp channel
    const rChannels = await fetch(`${url}/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=id,instance_name,status&order=updated_at.desc&limit=5`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store"
    });
    const channels = rChannels.ok ? ((await rChannels.json()) as Array<{ id: string; instance_name: string; status: string }>) : [];
    const activeChannel = channels.find(c => c.status === "connected" && extractSlotFromInstanceName(c.instance_name) <= featureGuard.effectivePlan.maxWhatsappConnections);

    const targetInstance = activeChannel?.instance_name || process.env.EVOLUTION_INSTANCE || "default";

    // 3. Fetch contacts to dispatch to
    let query = `${url}/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&select=id,phone,display_name&limit=50`;
    if (targetContactIds.length > 0) {
      const idFilter = targetContactIds.slice(0, 50).map(id => `"${id}"`).join(",");
      query += `&id=in.(${idFilter})`;
    }
    const rContacts = await fetch(query, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store"
    });
    const contacts = rContacts.ok ? ((await rContacts.json()) as Array<{ id: string; phone: string; display_name: string | null }>) : [];

    if (!contacts.length) {
      return privateJson({ ok: false, error: "no_contacts_found", message: "Nenhum cliente inativo elegível para envio." }, 404);
    }

    const evolutionUrl = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
    const evolutionKey = process.env.EVOLUTION_API_KEY ?? "";
    const cfg: EvolutionSendConfig = {
      evolutionUrl,
      evolutionKey,
      instance: targetInstance,
      sendFormat: process.env.EVOLUTION_SEND_FORMAT === "legacy" ? "legacy" : "v2"
    };

    let sentSuccess = 0;
    const errors: string[] = [];

    // Send personalized message to each contact
    for (const c of contacts) {
      const firstName = (c.display_name || "Cliente").split(" ")[0];
      const personalized = messageTemplate
        .replace(/\{nome\}/gi, firstName)
        .replace(/\{loja\}/gi, storeName)
        .replace(/\{cupom\}/gi, couponCode || "PROMO");

      try {
        if (evolutionUrl && evolutionKey) {
          await sendText(c.phone, personalized, cfg, targetInstance);
        }
        sentSuccess++;
      } catch (err) {
        errors.push(`Erro ao enviar para ${c.phone}: ${err instanceof Error ? err.message : "falha"}`);
      }
    }

    return privateJson({
      ok: true,
      sentCount: sentSuccess,
      totalTargeted: contacts.length,
      errors: errors.slice(0, 5),
      message: `Campanha executada! ${sentSuccess} de ${contacts.length} mensagens enviadas com sucesso.`
    });
  } catch (err) {
    return privateJson({ error: err instanceof Error ? err.message : "reengage_failed" }, 500);
  }
}

