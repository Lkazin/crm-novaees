import "server-only";
import { randomUUID } from "node:crypto";
import { resolveMasterOwnTenant } from "./master-own-tenant";
import { TENANT_UUID } from "./tenant-access";

export type MasterCustomer = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  document: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type MasterCustomerLinkedStore = {
  tenantId: string;
  tenantName: string;
  status: string;
  planName: string;
  hasLogin: boolean;
};

export type MasterCustomerView = MasterCustomer & {
  linkedStores: MasterCustomerLinkedStore[];
  hasLogin: boolean;
  loginUserId: string | null;
};

let inMemoryCustomersCatalog: MasterCustomer[] = [];

export function resetInMemoryCustomersCatalogForTests(): void {
  inMemoryCustomersCatalog = [];
}

function getSupabaseAdminConfig() {
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

export function validateMasterCustomerInput(input: {
  name?: unknown;
  email?: unknown;
  whatsapp?: unknown;
  document?: unknown;
  notes?: unknown;
}):
  | { ok: true; value: Omit<MasterCustomer, "id" | "createdAt" | "updatedAt"> }
  | { ok: false; error: string; message: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const whatsapp = typeof input.whatsapp === "string" ? input.whatsapp.replace(/\D/g, "") : "";
  const document = typeof input.document === "string" ? input.document.trim().slice(0, 32) : "";
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 500) : "";

  if (!name || name.length < 2 || name.length > 160) {
    return {
      ok: false,
      error: "invalid_name",
      message: "Informe o nome completo do cliente responsável (mínimo 2 caracteres)."
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      error: "invalid_email",
      message: "Informe um endereço de e-mail válido para o cliente responsável."
    };
  }
  if (whatsapp.length < 10 || whatsapp.length > 15) {
    return {
      ok: false,
      error: "invalid_whatsapp",
      message: "Informe um número de WhatsApp válido com DDD (10 a 15 dígitos)."
    };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      whatsapp,
      document,
      notes
    }
  };
}

async function resolveOwnerTenantId(url: string, serviceKey: string): Promise<string> {
  const tenant = await resolveMasterOwnTenant<{ id: string }>(async query => {
    const response = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error("master_customers_owner_lookup_failed");
    return await response.json();
  });
  return tenant.id;
}

export async function loadMasterCustomersCatalog(
  url?: string,
  serviceKey?: string
): Promise<MasterCustomer[]> {
  const cfg = url && serviceKey ? { url, serviceKey } : getSupabaseAdminConfig();
  if (!cfg.url || !cfg.serviceKey) {
    return [...inMemoryCustomersCatalog];
  }

  try {
    const ownerId = await resolveOwnerTenantId(cfg.url, cfg.serviceKey);
    const res = await fetch(
      `${cfg.url}/rest/v1/crm_tenant_settings?tenant_id=eq.${ownerId}&select=business_description`,
      {
        headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      }
    );
    if (!res.ok) return [...inMemoryCustomersCatalog];
    const rows = (await res.json()) as Array<{ business_description?: string }>;
    const raw = rows[0]?.business_description;
    if (!raw || !raw.startsWith("{")) return [...inMemoryCustomersCatalog];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.master_customers_catalog)) {
      const normalized = (parsed.master_customers_catalog as MasterCustomer[]).filter(
        c => c && typeof c.id === "string" && TENANT_UUID.test(c.id) && typeof c.name === "string"
      );
      inMemoryCustomersCatalog = normalized;
      return [...normalized];
    }
  } catch {
    // Fallback to in-memory catalog when offline or unconfigured
  }
  return [...inMemoryCustomersCatalog];
}

export async function saveMasterCustomersCatalog(
  customers: MasterCustomer[],
  url?: string,
  serviceKey?: string
): Promise<void> {
  const cfg = url && serviceKey ? { url, serviceKey } : getSupabaseAdminConfig();
  inMemoryCustomersCatalog = [...customers];
  if (!cfg.url || !cfg.serviceKey) return;

  const ownerId = await resolveOwnerTenantId(cfg.url, cfg.serviceKey);
  const res = await fetch(`${cfg.url}/rest/v1/rpc/crm_patch_tenant_config`, {
    method: "POST",
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_tenant: ownerId,
      p_patch: { master_customers_catalog: customers }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error("master_customers_write_failed");
  }
}

export function createCustomerRecord(
  validated: Omit<MasterCustomer, "id" | "createdAt" | "updatedAt">,
  id: string = randomUUID(),
  nowIso: string = new Date().toISOString()
): MasterCustomer {
  return {
    id,
    name: validated.name.trim(),
    email: validated.email.trim().toLowerCase(),
    whatsapp: validated.whatsapp.replace(/\D/g, ""),
    document: validated.document,
    notes: validated.notes,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}
