import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import {
  syncTenantUsageLimits,
  getMasterPlans,
  checkTrialEligibility,
  recordTrialRegistration,
  convertTrialToPaidPlan,
  TRIAL_PLAN
} from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  return { url, serviceKey };
}

// GET: List all client stores with login email, plan, dueDate, paymentStatus, and block state
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    // 1. Fetch tenants
    const rTenants = await fetch(url + "/rest/v1/crm_tenants?select=*&order=created_at.desc", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = (await rTenants.json()) as Array<{ id: string; name: string; status: string; created_at: string }>;

    // 2. Fetch memberships
    const rMemb = await fetch(url + "/rest/v1/crm_tenant_memberships?select=tenant_id,user_id,role", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const memberships = (await rMemb.json()) as Array<{ tenant_id: string; user_id: string; role: string }>;

    // 3. Fetch all auth users
    const rUsers = await fetch(url + "/auth/v1/admin/users?per_page=100", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const usersData = await rUsers.json();
    const users = (usersData?.users || []) as Array<{ id: string; email: string }>;
    const userMap = new Map(users.map(u => [u.id, u.email]));

    // 4. Fetch tenant settings (where plan & payment due date are stored)
    const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const settings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
    const settingsMap = new Map(settings.map(s => [s.tenant_id, s.business_description]));

    // 5. Fetch channels (to know instance_name)
    const rChannels = await fetch(url + "/rest/v1/crm_channels?select=tenant_id,instance_name,status", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const channels = (await rChannels.json()) as Array<{ tenant_id: string; instance_name: string; status: string }>;
    const channelMap = new Map(channels.map(c => [c.tenant_id, c]));

    const now = new Date();
    const clients = [];

    for (const t of tenants) {
      const memb = memberships.find(m => m.tenant_id === t.id);
      const email = memb ? (userMap.get(memb.user_id) || "—") : "—";
      const ch = channelMap.get(t.id);

      // Default plan template
      let plan = {
        name: "Plano IA Mensal",
        price: "149,00",
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        status: "paid" as "paid" | "pending",
        autoBlock: true,
        isOverdue: false
      };

      const rawDesc = settingsMap.get(t.id) || "";
      try {
        if (rawDesc.startsWith("{")) {
          const parsed = JSON.parse(rawDesc);
          if (parsed.plan) {
            plan = { ...plan, ...parsed.plan };
          }
        }
      } catch {}

      // Trial handling & lifecycle check
      if (plan.isTrial || plan.planId === "crm-trial" || plan.status === "trial") {
        plan.isTrial = true;
        const trialExpires = plan.trialExpiresAt
          ? new Date(plan.trialExpiresAt)
          : new Date(new Date(t.created_at).getTime() + 7 * 86400000);
        plan.trialExpiresAt = trialExpires.toISOString();
        const diffMs = trialExpires.getTime() - now.getTime();
        plan.trialDaysLeft = Math.max(0, Math.ceil(diffMs / 86400000));

        if (now >= trialExpires) {
          plan.trialStatus = "expired";
          if (t.status === "active") {
            t.status = "suspended";
            try {
              await fetch(url + `/rest/v1/crm_tenants?id=eq.${t.id}`, {
                method: "PATCH",
                headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
                body: JSON.stringify({ status: "suspended" })
              });
            } catch {}
          }
        } else if (plan.trialDaysLeft <= 3) {
          plan.trialStatus = "expiring_soon";
        } else {
          plan.trialStatus = "active";
        }
      } else {
        // Check auto-block condition for paid plans
        const due = new Date(plan.dueDate);
        if (plan.autoBlock && plan.status !== "paid" && due < now) {
          plan.isOverdue = true;
          // If not already suspended, automatically suspend
          if (t.status === "active") {
            t.status = "suspended";
            try {
              await fetch(url + `/rest/v1/crm_tenants?id=eq.${t.id}`, {
                method: "PATCH",
                headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
                body: JSON.stringify({ status: "suspended" })
              });
            } catch {}
          }
        }
      }

      clients.push({
        id: t.id,
        name: t.name,
        status: t.status,
        email,
        userId: memb?.user_id ?? null,
        created_at: t.created_at,
        instanceName: ch?.instance_name || null,
        whatsappStatus: ch?.status || "disconnected",
        plan
      });
    }

    return privateJson({ clients });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "clients_unavailable" }, 503);
  }
}

// POST: Create a complete client (Store + Auth User + Membership + Plan + Default Agent)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json();
    const storeName = typeof body.storeName === "string" ? body.storeName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const planName = typeof body.planName === "string" ? body.planName.trim() : "CRM Start";
    const planPrice = typeof body.planPrice === "string" ? body.planPrice.trim() : "149,00";
    const dueDate = typeof body.dueDate === "string" ? body.dueDate : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const paymentStatus = body.paymentStatus === "pending" ? "pending" : "paid";
    const autoBlock = body.autoBlock !== false;

    if (storeName.length < 2 || storeName.length > 160) return privateJson({ error: "invalid_store_name" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return privateJson({ error: "invalid_email" }, 400);
    if (password.length < 6) return privateJson({ error: "password_too_short" }, 400);

    const isTrial = body.isTrial === true || body.planId === "crm-trial";
    if (isTrial) {
      const eligibility = await checkTrialEligibility(storeName, email);
      if (!eligibility.eligible) {
        return privateJson({
          error: "trial_already_used",
          message: eligibility.reason || "Esta empresa ou e-mail já utilizou a avaliação gratuita de 7 dias anteriormente."
        }, 400);
      }
    }

    // 1. Create tenant in crm_tenants
    const rTenant = await fetch(url + "/rest/v1/crm_tenants", {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ name: storeName, status: "active" })
    });
    if (!rTenant.ok) {
      const err = await rTenant.text();
      return privateJson({ error: "tenant_create_failed", detail: err }, 500);
    }
    const tenantData = (await rTenant.json()) as Array<{ id: string }>;
    const tenantId = tenantData[0].id;

    // 2. Create user in Supabase Auth via Admin API
    const rUser = await fetch(url + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { storeName, tenantId, role: "CLIENT" }
      })
    });
    if (!rUser.ok) {
      const errUser = await rUser.text();
      return privateJson({ error: "user_create_failed", detail: errUser }, 500);
    }
    const userData = await rUser.json();
    const userId = userData.id;

    // 3. Create membership in crm_tenant_memberships
    await fetch(url + "/rest/v1/crm_tenant_memberships", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        user_id: userId,
        role: "admin"
      })
    });

    // 4. Save initial Plan settings with stable planId
    let planMeta: Record<string, any>;
    let effectiveLimit: number;

    if (isTrial) {
      const trialStartedAt = new Date().toISOString();
      const trialExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      planMeta = {
        plan: {
          isTrial: true,
          planId: "crm-trial",
          name: "Teste Grátis (7 Dias)",
          price: "0,00",
          quotaLimit: 100,
          trialStartedAt,
          trialExpiresAt,
          dueDate: trialExpiresAt.slice(0, 10),
          status: "trial",
          autoBlock: true,
          customQuotaOverride: null,
          exceptionReason: null
        }
      };
      effectiveLimit = 100;
      await recordTrialRegistration(tenantId, storeName, email);
    } else {
      const masterPlans = await getMasterPlans();
      const planId = typeof body.planId === "string" ? body.planId : "";
      const matchedPlan = masterPlans.find(p => p.id === planId || p.name.toLowerCase() === planName.toLowerCase()) || masterPlans[0];

      const customQuota = typeof body.customQuotaOverride === "number" ? body.customQuotaOverride : null;
      const exceptionReason = typeof body.exceptionReason === "string" ? body.exceptionReason : null;

      planMeta = {
        plan: {
          isTrial: false,
          planId: matchedPlan.id,
          name: matchedPlan.name,
          price: planPrice || matchedPlan.price,
          quotaLimit: matchedPlan.quotaLimit,
          dueDate,
          status: paymentStatus,
          autoBlock,
          customQuotaOverride: customQuota,
          exceptionReason,
          contractedPlan: {
            quotaLimit: matchedPlan.quotaLimit,
            features: matchedPlan.features,
            price: matchedPlan.price,
            version: matchedPlan.version,
            contractedAt: new Date().toISOString()
          }
        }
      };
      effectiveLimit = customQuota !== null ? customQuota : matchedPlan.quotaLimit;
    }

    await fetch(url + "/rest/v1/crm_tenant_settings", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        ai_sending_enabled: true,
        business_description: JSON.stringify(planMeta)
      })
    });
    await syncTenantUsageLimits(tenantId, effectiveLimit, url, serviceKey);

    // 5. Create default agent in crm_agents
    await fetch(url + "/rest/v1/crm_agents", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        label: `Assistente ${storeName}`,
        instructions: `Você é o assistente virtual da loja ${storeName}. Responda em português brasileiro de forma educada, ágil e prestativa. Use as informações de cardápio, produtos e regras da loja.`,
        provider_route: "auto",
        enabled: true
      })
    });

    // 6. Create default evolution channel
    const slug = storeName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24);
    await fetch(url + "/rest/v1/crm_channels", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        provider: "evolution",
        instance_name: `loja_${slug}`,
        status: "disconnected"
      })
    });

    return privateJson({
      created: true,
      tenantId,
      storeName,
      email,
      planName,
      dueDate,
      paymentStatus
    }, 201);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "client_creation_failed" }, 503);
  }
}

// PATCH: Block/Unblock, Mark Paid, Update Plan, Reset Password
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!tenantId) return privateJson({ error: "missing_tenant_id" }, 400);

    // 1. Action: Toggle Block / Unblock status
    if (action === "toggle_block") {
      const suspend = body.suspend === true;
      const newStatus = suspend ? "suspended" : "active";
      await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      return privateJson({ updated: true, newStatus });
    }

    // 2. Action: Mark Paid or Pending
    if (action === "set_payment_status") {
      const newPaymentStatus = body.paymentStatus === "paid" ? "paid" : "pending";
      
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
      });
      const current = (await rGet.json()) as Array<{ business_description: string }>;
      let dataObj: Record<string, unknown> = { plan: {} };
      try {
        if (current[0]?.business_description?.startsWith("{")) {
          dataObj = JSON.parse(current[0].business_description);
        }
      } catch {}

      const planObj = (dataObj.plan as Record<string, unknown>) ?? {};
      planObj.status = newPaymentStatus;
      dataObj.plan = planObj;

      await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ business_description: JSON.stringify(dataObj) })
      });

      // If marked as paid, automatically unblock tenant if it was suspended
      if (newPaymentStatus === "paid") {
        await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" })
        });
      }

      return privateJson({ updated: true, paymentStatus: newPaymentStatus, active: newPaymentStatus === "paid" });
    }

    // 3. Action: Reset Password
    if (action === "reset_password") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!userId || newPassword.length < 6) return privateJson({ error: "invalid_password_data" }, 400);

      const rPwd = await fetch(url + `/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      if (!rPwd.ok) return privateJson({ error: "password_update_failed" }, 503);
      return privateJson({ updated: true, passwordReset: true });
    }

    // 4. Action: Update Plan details
    if (action === "update_plan") {
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
      });
      const current = (await rGet.json()) as Array<{ business_description: string }>;
      let dataObj: Record<string, unknown> = { plan: {} };
      try {
        if (current[0]?.business_description?.startsWith("{")) {
          dataObj = JSON.parse(current[0].business_description);
        }
      } catch {}

      const planObj = (dataObj.plan as Record<string, unknown>) ?? {};
      if (body.planName) planObj.name = body.planName;
      if (body.planPrice) planObj.price = body.planPrice;
      if (body.dueDate) planObj.dueDate = body.dueDate;
      if (body.autoBlock !== undefined) planObj.autoBlock = body.autoBlock;

      dataObj.plan = planObj;

      await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ business_description: JSON.stringify(dataObj) })
      });

      return privateJson({ updated: true, plan: planObj });
    }

    // 5. Action: Convert Trial to Paid Commercial Plan
    if (action === "convert_trial") {
      const targetPlanId = typeof body.planId === "string" ? body.planId : "crm-business";
      const targetDueDate = typeof body.dueDate === "string" ? body.dueDate : undefined;
      const result = await convertTrialToPaidPlan(tenantId, targetPlanId, auth.actor || "master_admin", targetDueDate);
      if (!result.success) {
        return privateJson({ error: "conversion_failed", message: result.error || "Falha ao converter teste para plano pago" }, 500);
      }
      return privateJson({ updated: true, converted: true, plan: result.plan });
    }

    return privateJson({ error: "invalid_action" }, 400);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "patch_failed" }, 503);
  }
}

// DELETE: Delete store / client and its WhatsApp instance
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  const auth = await verifyMasterRequest(request);
  if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

  try {
    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const tenantId = request.nextUrl.searchParams.get("tenantId") || "";
    if (!tenantId) return privateJson({ error: "missing_tenant_id" }, 400);

    // 1. Fetch channel instance_name if any to delete from Evolution API
    try {
      const rCh = await fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=instance_name`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
      });
      const channels = (await rCh.json()) as Array<{ instance_name: string }>;
      const evoUrl = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
      const evoKey = process.env.EVOLUTION_API_KEY ?? "";
      for (const ch of channels) {
        if (ch.instance_name && evoKey) {
          try {
            await fetch(`${evoUrl}/instance/logout/${encodeURIComponent(ch.instance_name)}`, {
              method: "DELETE",
              headers: { apikey: evoKey }
            });
            await fetch(`${evoUrl}/instance/delete/${encodeURIComponent(ch.instance_name)}`, {
              method: "DELETE",
              headers: { apikey: evoKey }
            });
          } catch {}
        }
      }
    } catch {}

    // 2. Delete channels, agents, settings, memberships, tenant
    await fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_tenant_memberships?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });

    return privateJson({ deleted: true, tenantId });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "delete_failed" }, 503);
  }
}
