import { NextRequest } from "next/server";
import { privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import {
  getMasterPixConfig,
  saveMasterPixConfig,
  invalidateEffectivePlanCache,
  getRedis,
  type MessageRechargeItem,
  type MasterPixConfig
} from "@/lib/crm/plans";
import { patchCrmConfig } from "@/lib/crm/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  return { url, serviceKey };
}

export type AdminRechargeItem = MessageRechargeItem & {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
};

// GET: Retrieve all recharges from all stores, Master PIX config, and summary metrics
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!url || !serviceKey) {
      return privateJson({ error: "backend_not_configured" }, 503);
    }

    // 1. Fetch tenants
    const rTenants = await fetch(url + "/rest/v1/crm_tenants?select=id,name,status,created_at&order=created_at.desc", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = (await rTenants.json()) as Array<{ id: string; name: string; status: string; created_at: string }>;

    // 2. Fetch primary member emails
    const rMemb = await fetch(url + "/rest/v1/crm_tenant_memberships?is_active=eq.true&select=tenant_id,user_id,role", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const memberships = (await rMemb.json()) as Array<{ tenant_id: string; user_id: string; role: string }>;

    const rUsers = await fetch(url + "/auth/v1/admin/users?per_page=200", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const usersData = await rUsers.json();
    const users = (usersData?.users || []) as Array<{ id: string; email: string }>;
    const userMap = new Map(users.map(u => [u.id, u]));

    // 3. Fetch all tenant settings
    const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const settingsList = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
    const settingsMap = new Map(settingsList.map(s => [s.tenant_id, s.business_description]));

    // 4. Aggregate all recharges
    const allRecharges: AdminRechargeItem[] = [];

    for (const t of tenants) {
      const tenantMemberships = memberships.filter(m => m.tenant_id === t.id);
      const primaryMemb = tenantMemberships.find(m => m.role === "owner" || m.role === "admin") || tenantMemberships[0];
      const primaryUser = primaryMemb ? userMap.get(primaryMemb.user_id) : undefined;
      const email = primaryUser?.email || "—";

      const rawDesc = settingsMap.get(t.id) || "";
      if (rawDesc.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawDesc);
          if (Array.isArray(parsed.recharges)) {
            for (const r of parsed.recharges) {
              allRecharges.push({
                ...r,
                tenantId: t.id,
                tenantName: t.name,
                tenantEmail: email
              });
            }
          }
        } catch {}
      }
    }

    // Sort: "pending" first, then newest purchasedAt
    allRecharges.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return String(b.purchasedAt || "").localeCompare(String(a.purchasedAt || ""));
    });

    const pixConfig = await getMasterPixConfig();

    const pendingCount = allRecharges.filter(r => r.status === "pending").length;
    const paidRecharges = allRecharges.filter(r => r.status === "paid");
    const totalPaidAmount = paidRecharges.reduce((sum, r) => sum + (Number(r.pricePaid) || 0), 0);
    const totalApprovedMessages = paidRecharges.reduce((sum, r) => sum + (Number(r.messagesAdded) || 0), 0);

    return privateJson({
      ok: true,
      recharges: allRecharges,
      pixConfig,
      stats: {
        pendingCount,
        paidCount: paidRecharges.length,
        rejectedCount: allRecharges.filter(r => r.status === "rejected").length,
        totalPaidAmount,
        totalApprovedMessages
      }
    });
  } catch (err) {
    return privateJson({ error: err instanceof Error ? err.message : "recharges_unavailable" }, 500);
  }
}

// POST: Actions approve_recharge, reject_recharge, update_pix_config
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!url || !serviceKey) {
      return privateJson({ error: "backend_not_configured" }, 503);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    // ACTION 1: UPDATE MASTER PIX CONFIG
    if (action === "update_pix_config") {
      const pixUpdate = body.pixConfig as Partial<MasterPixConfig>;
      if (!pixUpdate || typeof pixUpdate !== "object") {
        return privateJson({ error: "invalid_payload", message: "Configuração de PIX inválida." }, 400);
      }

      const updated = await saveMasterPixConfig(pixUpdate);
      return privateJson({
        ok: true,
        pixConfig: updated,
        message: "Chave PIX atualizada com sucesso!"
      });
    }

    // ACTION 2: APPROVE RECHARGE
    if (action === "approve_recharge") {
      const tenantId = String(body.tenantId || "").trim();
      const rechargeId = String(body.rechargeId || "").trim();

      if (!tenantId || !rechargeId) {
        return privateJson({ error: "missing_parameters", message: "Identificador da loja e da recarga são obrigatórios." }, 400);
      }

      const redis = getRedis();
      let redisConnected = false;
      let lockAcquired = false;
      const lockKey = `crm:lock:recharge_mutation:${tenantId}`;

      try {
        if (redis.status !== "ready" && redis.status !== "connecting") {
          await redis.connect();
          redisConnected = true;
        }
        if (redis.status === "ready" || redis.status === "connecting") {
          const acquired = await redis.set(lockKey, "1", "EX", 15, "NX");
          if (!acquired) {
            return privateJson({
              error: "concurrent_modification",
              message: "Operação concorrente em andamento para esta loja. Aguarde alguns instantes."
            }, 409);
          }
          lockAcquired = true;
        }

        const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        });
        if (!rGet.ok) return privateJson({ error: "tenant_settings_not_found" }, 404);
        const rows = (await rGet.json()) as Array<{ business_description: string }>;
        const dataObj = rows[0]?.business_description ? JSON.parse(rows[0].business_description) : {};
        const recharges: MessageRechargeItem[] = Array.isArray(dataObj.recharges) ? dataObj.recharges : [];

        const target = recharges.find(r => r.id === rechargeId);
        if (!target) {
          return privateJson({ error: "recharge_not_found", message: "Solicitação de recarga não encontrada." }, 404);
        }
        if (target.status === "paid") {
          return privateJson({ error: "already_approved", message: "Esta recarga já foi aprovada anteriormente." }, 409);
        }
        if (target.status === "rejected") {
          return privateJson({ error: "already_rejected", message: "Esta recarga já foi rejeitada anteriormente e não pode ser re-aprovada." }, 409);
        }

        target.status = "paid";
        target.approvedAt = new Date().toISOString();
        target.approvedBy = auth.actor || "Master";

        await patchCrmConfig(tenantId, { recharges });
        await invalidateEffectivePlanCache(tenantId);

        return privateJson({
          ok: true,
          recharge: target,
          message: `Recarga de ${target.messagesAdded} mensagens aprovada com sucesso! Créditos liberados para o lojista.`
        });
      } finally {
        if (lockAcquired) {
          try { await redis.del(lockKey); } catch {}
        }
        if (redisConnected) {
          try { redis.disconnect(); } catch {}
        }
      }
    }

    // ACTION 3: REJECT RECHARGE
    if (action === "reject_recharge") {
      const tenantId = String(body.tenantId || "").trim();
      const rechargeId = String(body.rechargeId || "").trim();
      const reason = String(body.reason || "Pagamento PIX não identificado").trim().slice(0, 300);

      if (!tenantId || !rechargeId) {
        return privateJson({ error: "missing_parameters", message: "Identificador da loja e da recarga são obrigatórios." }, 400);
      }

      const redis = getRedis();
      let redisConnected = false;
      let lockAcquired = false;
      const lockKey = `crm:lock:recharge_mutation:${tenantId}`;

      try {
        if (redis.status !== "ready" && redis.status !== "connecting") {
          await redis.connect();
          redisConnected = true;
        }
        if (redis.status === "ready" || redis.status === "connecting") {
          const acquired = await redis.set(lockKey, "1", "EX", 15, "NX");
          if (!acquired) {
            return privateJson({
              error: "concurrent_modification",
              message: "Operação concorrente em andamento para esta loja. Aguarde alguns instantes."
            }, 409);
          }
          lockAcquired = true;
        }

        const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        });
        if (!rGet.ok) return privateJson({ error: "tenant_settings_not_found" }, 404);
        const rows = (await rGet.json()) as Array<{ business_description: string }>;
        const dataObj = rows[0]?.business_description ? JSON.parse(rows[0].business_description) : {};
        const recharges: MessageRechargeItem[] = Array.isArray(dataObj.recharges) ? dataObj.recharges : [];

        const target = recharges.find(r => r.id === rechargeId);
        if (!target) {
          return privateJson({ error: "recharge_not_found", message: "Solicitação de recarga não encontrada." }, 404);
        }
        if (target.status === "paid") {
          return privateJson({ error: "already_approved", message: "Esta recarga já foi aprovada anteriormente e não pode ser rejeitada." }, 409);
        }
        if (target.status === "rejected") {
          return privateJson({ error: "already_rejected", message: "Esta recarga já foi rejeitada anteriormente." }, 409);
        }

        target.status = "rejected";
        target.rejectionReason = reason;
        target.approvedAt = undefined;
        target.approvedBy = auth.actor || "Master";

        await patchCrmConfig(tenantId, { recharges });
        await invalidateEffectivePlanCache(tenantId);

        return privateJson({
          ok: true,
          recharge: target,
          message: "Solicitação de recarga recusada."
        });
      } finally {
        if (lockAcquired) {
          try { await redis.del(lockKey); } catch {}
        }
        if (redisConnected) {
          try { redis.disconnect(); } catch {}
        }
      }
    }

    return privateJson({ error: "unknown_action", message: "Ação não reconhecida." }, 400);
  } catch (err) {
    return privateJson({ error: err instanceof Error ? err.message : "operation_failed" }, 500);
  }
}
