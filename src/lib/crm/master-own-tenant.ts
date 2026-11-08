import "server-only";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The same unambiguous agency identity owns both its CRM and plan catalog. */
export async function resolveMasterOwnTenant<T extends { id: string }>(readRows: (query: string) => Promise<T[]>): Promise<T> {
  const configuredId = process.env.CRM_MASTER_OWN_TENANT_ID?.trim();
  if (configuredId && !UUID.test(configuredId)) throw new Error("invalid_master_own_tenant");
  const filter = configuredId ? `id=eq.${configuredId}` : "name=ilike.NovaesWeb";
  const tenants = await readRows(`crm_tenants?select=id,name,status&${filter}&limit=2`);
  if (!Array.isArray(tenants) || tenants.length !== 1 || !UUID.test(tenants[0].id)) throw new Error("master_own_tenant_unavailable");
  return tenants[0];
}
