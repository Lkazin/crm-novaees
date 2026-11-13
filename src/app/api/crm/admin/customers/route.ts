import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { TENANT_UUID } from "@/lib/crm/tenant-access";
import {
  createCustomerRecord,
  loadMasterCustomersCatalog,
  saveMasterCustomersCatalog,
  validateMasterCustomerInput,
  type MasterCustomer,
  type MasterCustomerLinkedStore,
  type MasterCustomerView
} from "@/lib/crm/master-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = (
    process.env.CRM_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL
  )
    ?.trim()
    .replace(/\/$/, "") ?? "";
  const serviceKey = (
    process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY
  )?.trim() ?? "";
  return { url, serviceKey };
}

/**
 * GET /api/crm/admin/customers
 * Lists all commercial responsible customers (Step 1: Clientes), reconciled with linked stores and logins.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);
    const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

    const catalog = await loadMasterCustomersCatalog(url, serviceKey);

    const [rTenants, rSettings, rMemb, rUsers] = await Promise.all([
      fetch(url + "/rest/v1/crm_tenants?select=id,name,status,created_at&order=created_at.desc", {
        headers,
        cache: "no-store"
      }),
      fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
        headers,
        cache: "no-store"
      }),
      fetch(url + "/rest/v1/crm_tenant_memberships?is_active=eq.true&select=tenant_id,user_id,role", {
        headers,
        cache: "no-store"
      }),
      fetch(url + "/auth/v1/admin/users?per_page=500", {
        headers,
        cache: "no-store"
      })
    ]);

    const tenants = rTenants.ok
      ? ((await rTenants.json()) as Array<{ id: string; name: string; status: string; created_at: string }>)
      : [];
    const settingsRows = rSettings.ok
      ? ((await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>)
      : [];
    const memberships = rMemb.ok
      ? ((await rMemb.json()) as Array<{ tenant_id: string; user_id: string; role: string }>)
      : [];
    const usersPayload = rUsers.ok ? await rUsers.json() : { users: [] };
    const authUsers = (usersPayload?.users || []) as Array<{
      id: string;
      email?: string;
      created_at?: string;
      user_metadata?: {
        name?: string;
        whatsapp?: string;
        recoveryWhatsapp?: string;
        document?: string;
        customerId?: string;
      };
    }>;

    const authByEmail = new Map<string, (typeof authUsers)[number]>();
    const authById = new Map<string, (typeof authUsers)[number]>();
    for (const u of authUsers) {
      authById.set(u.id, u);
      if (u.email) authByEmail.set(u.email.toLowerCase(), u);
    }

    const parsedSettingsByTenant = new Map<
      string,
      {
        planName: string;
        customerId: string;
        ownerName: string;
        ownerEmail: string;
        businessWhatsapp: string;
        document: string;
      }
    >();

    for (const row of settingsRows) {
      let planName = "Plano Ativo";
      let customerId = "";
      let ownerName = "";
      let ownerEmail = "";
      let businessWhatsapp = "";
      let document = "";
      try {
        if (row.business_description?.startsWith("{")) {
          const parsed = JSON.parse(row.business_description);
          if (parsed?.plan?.name) planName = String(parsed.plan.name);
          if (parsed?.businessDetails && typeof parsed.businessDetails === "object") {
            customerId = typeof parsed.businessDetails.customerId === "string" ? parsed.businessDetails.customerId : "";
            ownerName = typeof parsed.businessDetails.ownerName === "string" ? parsed.businessDetails.ownerName : "";
            ownerEmail = typeof parsed.businessDetails.ownerEmail === "string" ? parsed.businessDetails.ownerEmail.toLowerCase() : "";
            businessWhatsapp = typeof parsed.businessDetails.businessWhatsapp === "string" ? parsed.businessDetails.businessWhatsapp : "";
            document = typeof parsed.businessDetails.document === "string" ? parsed.businessDetails.document : "";
          }
        }
      } catch {}
      parsedSettingsByTenant.set(row.tenant_id, {
        planName,
        customerId,
        ownerName,
        ownerEmail,
        businessWhatsapp,
        document
      });
    }

    // Build unified map of commercial customers (catalog + legacy synthesized records)
    const customerMap = new Map<string, MasterCustomer>();
    const emailToCustomerId = new Map<string, string>();

    for (const c of catalog) {
      customerMap.set(c.id, c);
      emailToCustomerId.set(c.email.toLowerCase(), c.id);
    }

    // Synthesize any existing Auth users or tenant owners not yet in catalog
    for (const u of authUsers) {
      const email = (u.email || "").toLowerCase();
      if (!email || emailToCustomerId.has(email)) continue;
      const cid = u.user_metadata?.customerId && TENANT_UUID.test(u.user_metadata.customerId)
        ? u.user_metadata.customerId
        : u.id;
      if (customerMap.has(cid)) continue;
      const synthesized: MasterCustomer = {
        id: cid,
        name: u.user_metadata?.name || email.split("@")[0] || "Cliente",
        email,
        whatsapp: u.user_metadata?.whatsapp || u.user_metadata?.recoveryWhatsapp || "",
        document: u.user_metadata?.document || "",
        notes: "",
        createdAt: u.created_at || new Date().toISOString(),
        updatedAt: u.created_at || new Date().toISOString()
      };
      customerMap.set(cid, synthesized);
      emailToCustomerId.set(email, cid);
    }

    const storesByCustomerId = new Map<string, MasterCustomerLinkedStore[]>();

    for (const t of tenants) {
      const meta = parsedSettingsByTenant.get(t.id);
      const tenantMembers = memberships.filter(m => m.tenant_id === t.id);
      const primaryMemb =
        tenantMembers.find(m => m.role === "owner" || m.role === "admin") || tenantMembers[0];
      const linkedAuthUser = primaryMemb ? authById.get(primaryMemb.user_id) : undefined;

      let resolvedCustomerId = meta?.customerId || "";
      if (!resolvedCustomerId || !customerMap.has(resolvedCustomerId)) {
        const candidateEmail = (meta?.ownerEmail || linkedAuthUser?.email || "").toLowerCase();
        if (candidateEmail && emailToCustomerId.has(candidateEmail)) {
          resolvedCustomerId = emailToCustomerId.get(candidateEmail)!;
        } else if (meta?.customerId && TENANT_UUID.test(meta.customerId)) {
          resolvedCustomerId = meta.customerId;
          const fallbackCustomer: MasterCustomer = {
            id: resolvedCustomerId,
            name: meta.ownerName || t.name,
            email: candidateEmail || "",
            whatsapp: meta.businessWhatsapp || "",
            document: meta.document || "",
            notes: "",
            createdAt: t.created_at,
            updatedAt: t.created_at
          };
          customerMap.set(resolvedCustomerId, fallbackCustomer);
          if (candidateEmail) emailToCustomerId.set(candidateEmail, resolvedCustomerId);
        }
      }

      if (resolvedCustomerId && customerMap.has(resolvedCustomerId)) {
        const currentCustomer = customerMap.get(resolvedCustomerId)!;
        if (!currentCustomer.document && meta?.document) {
          currentCustomer.document = meta.document;
        }
        if (!currentCustomer.whatsapp && meta?.businessWhatsapp) {
          currentCustomer.whatsapp = meta.businessWhatsapp;
        }
        const list = storesByCustomerId.get(resolvedCustomerId) || [];
        list.push({
          tenantId: t.id,
          tenantName: t.name,
          status: t.status,
          planName: meta?.planName || "Plano Ativo",
          hasLogin: tenantMembers.length > 0
        });
        storesByCustomerId.set(resolvedCustomerId, list);
      }
    }

    const customers: MasterCustomerView[] = Array.from(customerMap.values()).map(c => {
      const linkedStores = storesByCustomerId.get(c.id) || [];
      const matchingAuth =
        authByEmail.get(c.email.toLowerCase()) ||
        authUsers.find(u => u.user_metadata?.customerId === c.id) ||
        authById.get(c.id);
      return {
        ...c,
        linkedStores,
        hasLogin: Boolean(matchingAuth),
        loginUserId: matchingAuth?.id ?? null
      };
    });

    customers.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return privateJson({ customers });
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/**
 * POST /api/crm/admin/customers
 * Registers a commercial customer responsible (Step 1) WITHOUT creating any login or password in Auth.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json().catch(() => ({}));
    const validation = validateMasterCustomerInput(body);
    if (!validation.ok) {
      return privateJson({ error: validation.error, message: validation.message }, 400);
    }

    const catalog = await loadMasterCustomersCatalog(url, serviceKey);
    const duplicate = catalog.find(
      c => c.email.toLowerCase() === validation.value.email.toLowerCase()
    );
    if (duplicate) {
      return privateJson(
        {
          error: "customer_email_already_exists",
          message:
            "Já existe um cliente responsável cadastrado com este e-mail. Você pode selecioná-lo diretamente ao criar uma nova empresa."
        },
        409
      );
    }

    const created = createCustomerRecord(validation.value);
    const nextCatalog = [created, ...catalog];
    await saveMasterCustomersCatalog(nextCatalog, url, serviceKey);

    const view: MasterCustomerView = {
      ...created,
      linkedStores: [],
      hasLogin: false,
      loginUserId: null
    };

    return privateJson({ success: true, customer: view }, 201);
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/**
 * PATCH /api/crm/admin/customers
 * Updates a commercial customer's contact details (name, email, whatsapp, document, notes).
 */
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json().catch(() => ({}));
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    if (!TENANT_UUID.test(customerId)) {
      return privateJson({ error: "invalid_customer_id", message: "ID do cliente inválido." }, 400);
    }

    const validation = validateMasterCustomerInput(body);
    if (!validation.ok) {
      return privateJson({ error: validation.error, message: validation.message }, 400);
    }

    const catalog = await loadMasterCustomersCatalog(url, serviceKey);
    const duplicate = catalog.find(
      c => c.id !== customerId && c.email.toLowerCase() === validation.value.email.toLowerCase()
    );
    if (duplicate) {
      return privateJson(
        {
          error: "customer_email_already_exists",
          message: "Este e-mail já pertence a outro cliente cadastrado."
        },
        409
      );
    }

    const nowIso = new Date().toISOString();
    const existingIndex = catalog.findIndex(c => c.id === customerId);
    let updatedRecord: MasterCustomer;

    if (existingIndex >= 0) {
      updatedRecord = {
        ...catalog[existingIndex],
        ...validation.value,
        updatedAt: nowIso
      };
      catalog[existingIndex] = updatedRecord;
    } else {
      updatedRecord = createCustomerRecord(validation.value, customerId, nowIso);
      catalog.unshift(updatedRecord);
    }

    await saveMasterCustomersCatalog(catalog, url, serviceKey);

    return privateJson({ success: true, customer: updatedRecord });
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

/**
 * DELETE /api/crm/admin/customers?customerId=...
 * Deletes a commercial customer if they have no linked companies.
 */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);
    const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

    const customerId = request.nextUrl.searchParams.get("customerId")?.trim() || "";
    if (!TENANT_UUID.test(customerId)) {
      return privateJson({ error: "invalid_customer_id" }, 400);
    }

    const catalog = await loadMasterCustomersCatalog(url, serviceKey);
    const target = catalog.find(c => c.id === customerId);

    // Check if any company is linked to this customerId
    const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
      headers,
      cache: "no-store"
    });
    if (rSettings.ok) {
      const rows = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
      for (const row of rows) {
        try {
          if (row.business_description?.startsWith("{")) {
            const parsed = JSON.parse(row.business_description);
            const bd = parsed?.businessDetails;
            if (
              bd &&
              (bd.customerId === customerId ||
                (target?.email &&
                  typeof bd.ownerEmail === "string" &&
                  bd.ownerEmail.toLowerCase() === target.email.toLowerCase()))
            ) {
              return privateJson(
                {
                  error: "customer_has_linked_stores",
                  message:
                    "Este cliente possui empresa(s) vinculada(s). Exclua ou desvincule a empresa primeiro antes de apagar o cadastro do cliente."
                },
                409
              );
            }
          }
        } catch {}
      }
    }

    const nextCatalog = catalog.filter(c => c.id !== customerId);
    await saveMasterCustomersCatalog(nextCatalog, url, serviceKey);

    return privateJson({ success: true, deleted: true, customerId });
  } catch (err) {
    return privateJson(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
