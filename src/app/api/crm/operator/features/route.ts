import { NextRequest } from "next/server";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson, supabaseRows, verifyOperator } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getEffectiveTenantPlan, requireTenantFeature, DEFAULT_PLANS } from "@/lib/crm/plans";
import { DEFAULT_QUICK_REPLIES } from "@/app/api/crm/operator/ai-settings/route";
import { getBrazilMonthKey } from "@/lib/agent/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

async function authorizeTenant(request: NextRequest, tenantId: string): Promise<{ authorized: boolean; operatorId?: string; operatorEmail?: string }> {
  const [masterAuth, operator] = await Promise.all([
    verifyMasterRequest(request),
    verifyOperator()
  ]);
  if (masterAuth.authorized) {
    return { authorized: true, operatorId: operator?.id, operatorEmail: operator?.email };
  }
  if (!operator) return { authorized: false };
  const members = await supabaseRows<Array<{ tenant_id: string; role: string }>>(
    "crm_tenant_memberships?select=tenant_id,role&tenant_id=eq." + tenantId + "&user_id=eq." + operator.id + "&limit=1",
    operator.token
  );
  return {
    authorized: members.length > 0,
    operatorId: operator.id,
    operatorEmail: operator.email
  };
}

async function loadTenantSettingsJson(url: string, serviceKey: string, tenantId: string): Promise<Record<string, any>> {
  const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
    cache: "no-store"
  });
  if (!rGet.ok) return {};
  const rows = (await rGet.json()) as Array<{ business_description: string }>;
  if (rows[0]?.business_description?.startsWith("{")) {
    try {
      return JSON.parse(rows[0].business_description);
    } catch {}
  }
  return {};
}

async function saveTenantSettingsJson(url: string, serviceKey: string, tenantId: string, dataObj: Record<string, any>): Promise<void> {
  await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
    method: "PATCH",
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_description: JSON.stringify(dataObj),
      updated_at: new Date().toISOString()
    })
  });
}

// GET: Retrieve Quick Replies, Team Operators, Priorities, Satisfaction Surveys, Upgrade Requests, and Tiered Reports (Start / Business / Premium)
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant") ?? "";
  if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

  try {
    const auth = await authorizeTenant(request, tenantId);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const { url, serviceKey, redisUrl } = getServiceConfig();
    if (!url || !serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const effectivePlan = await getEffectiveTenantPlan(tenantId);
    const dataObj = await loadTenantSettingsJson(url, serviceKey, tenantId);

    // Optional filters for reports (Premium advanced filters)
    const periodFilter = request.nextUrl.searchParams.get("period") || "30d"; // "7d" | "30d" | "all"
    const channelFilter = request.nextUrl.searchParams.get("channel") || "all";
    const tagFilter = request.nextUrl.searchParams.get("tag") || "all";
    const priorityFilter = request.nextUrl.searchParams.get("priority") || "all";
    const operatorFilter = request.nextUrl.searchParams.get("operator") || "all";

    const [rConvs, rContacts, rChannels, rMemberships, rHandoffs] = await Promise.all([
      fetch(url + `/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&select=id,contact_id,channel_id,assigned_to,mode,status,last_message_at,created_at&order=last_message_at.desc&limit=300`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&select=id,phone,display_name`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=id,instance_name,status`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_tenant_memberships?tenant_id=eq.${tenantId}&select=user_id,role,created_at`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_handoffs?tenant_id=eq.${tenantId}&select=id,conversation_id,status,reason,created_at&limit=200`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      })
    ]);

    const rawConvs = rConvs.ok ? ((await rConvs.json()) as Array<any>) : [];
    const contacts = rContacts.ok ? ((await rContacts.json()) as Array<any>) : [];
    const channels = rChannels.ok ? ((await rChannels.json()) as Array<any>) : [];
    const memberships = rMemberships.ok ? ((await rMemberships.json()) as Array<any>) : [];
    const handoffs = rHandoffs.ok ? ((await rHandoffs.json()) as Array<any>) : [];

    const conversationTags: Record<string, string> = dataObj.conversationTags || {};
    const conversationPriorities: Record<string, "low" | "normal" | "high" | "urgent"> = dataObj.conversationPriorities || {};
    const satisfactionSurveys: Array<Record<string, any>> = Array.isArray(dataObj.satisfactionSurveys) ? dataObj.satisfactionSurveys : [];
    const quickReplies = Array.isArray(dataObj.quickReplies) && dataObj.quickReplies.length > 0 ? dataObj.quickReplies : DEFAULT_QUICK_REPLIES;
    const upgradeRequests = Array.isArray(dataObj.upgradeRequests) ? dataObj.upgradeRequests : [];

    const teamOperators: Array<Record<string, any>> = Array.isArray(dataObj.teamOperators) && dataObj.teamOperators.length > 0
      ? dataObj.teamOperators
      : memberships.map((m: any, idx: number) => ({
          id: m.user_id,
          name: idx === 0 ? "Operador Principal" : `Operador #${idx + 1}`,
          email: auth.operatorEmail || "—",
          role: m.role || "agent",
          status: "active",
          createdAt: m.created_at || new Date().toISOString()
        }));

    // Apply report filters
    const nowMs = Date.now();
    const cutoffMs = periodFilter === "7d"
      ? nowMs - 7 * 86400000
      : periodFilter === "30d"
        ? nowMs - 30 * 86400000
        : 0;

    const filteredConvs = rawConvs.filter(c => {
      if (cutoffMs > 0 && c.last_message_at && new Date(c.last_message_at).getTime() < cutoffMs) {
        return false;
      }
      if (channelFilter !== "all" && c.channel_id !== channelFilter) {
        return false;
      }
      const cTag = conversationTags[c.id] || conversationTags[c.contact_id] || "";
      if (tagFilter !== "all" && cTag !== tagFilter) {
        return false;
      }
      const cPrio = conversationPriorities[c.id] || "normal";
      if (priorityFilter !== "all" && cPrio !== priorityFilter) {
        return false;
      }
      if (operatorFilter !== "all" && c.assigned_to !== operatorFilter) {
        return false;
      }
      return true;
    });

    // 1. BASIC INDICATORS (CRM Start+)
    const monthKey = getBrazilMonthKey();
    let quotaUsed = effectivePlan.quotaUsed || 0;
    try {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1200, maxRetriesPerRequest: 1 });
      await redis.connect();
      const qKey = effectivePlan.isTrial ? `crm:quota:trial:${tenantId}` : `crm:quota:${tenantId}:${monthKey}`;
      const rawQ = await redis.get(qKey);
      redis.disconnect();
      if (rawQ) quotaUsed = Math.max(quotaUsed, parseInt(rawQ, 10) || 0);
    } catch {}

    const aiConversations = filteredConvs.filter(c => c.mode === "ai").length;
    const humanConversations = filteredConvs.filter(c => c.mode !== "ai").length;
    const activeConversations = filteredConvs.filter(c => c.status === "open" || c.status === "pending").length;

    const basicIndicators = {
      quotaUsed,
      quotaLimit: effectivePlan.quotaLimit,
      quotaPercent: Math.min(100, Math.round((quotaUsed / Math.max(1, effectivePlan.quotaLimit)) * 100)),
      totalConversations: filteredConvs.length,
      activeConversations,
      aiConversations,
      humanConversations,
      totalContacts: contacts.length
    };

    // 2. COMMERCIAL INDICATORS (CRM Business+)
    const allowCommercial = effectivePlan.allowedFeatures.includes("commercial_indicators");
    const tagBreakdown: Record<string, number> = {
      "Interessado": 0,
      "Orçamento enviado": 0,
      "Venda confirmada": 0,
      "Cliente perdido": 0,
      "Sem etiqueta": 0
    };
    const priorityBreakdown: Record<string, number> = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0
    };

    for (const c of filteredConvs) {
      const tName = conversationTags[c.id] || conversationTags[c.contact_id] || "Sem etiqueta";
      tagBreakdown[tName] = (tagBreakdown[tName] || 0) + 1;

      const prio = conversationPriorities[c.id] || (c.status === "pending" && c.mode === "human" ? "high" : "normal");
      priorityBreakdown[prio] = (priorityBreakdown[prio] || 0) + 1;
    }

    const totalSurveys = satisfactionSurveys.length;
    const avgSatisfaction = totalSurveys > 0
      ? Number((satisfactionSurveys.reduce((acc, s) => acc + Number(s.rating || 0), 0) / totalSurveys).toFixed(2))
      : 0;
    const handoffRate = filteredConvs.length > 0
      ? Math.round((Math.max(humanConversations, handoffs.length) / filteredConvs.length) * 100)
      : 0;

    const commercialIndicators = allowCommercial ? {
      tagBreakdown,
      priorityBreakdown,
      handoffCount: handoffs.length,
      handoffRate,
      totalSurveys,
      avgSatisfaction
    } : null;

    // 3. ADVANCED REPORTS, SATISFACTION ANALYTICS & OPERATOR INDICATORS (CRM Premium)
    const allowAdvanced = effectivePlan.allowedFeatures.includes("advanced_reports") ||
      effectivePlan.allowedFeatures.includes("satisfaction_analytics") ||
      effectivePlan.allowedFeatures.includes("operator_indicators");

    let premiumAnalytics = null;
    if (allowAdvanced) {
      const starDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let aiRatingSum = 0, aiRatingCount = 0;
      let humanRatingSum = 0, humanRatingCount = 0;

      for (const s of satisfactionSurveys) {
        const r = Math.max(1, Math.min(5, Math.round(Number(s.rating || 5))));
        starDistribution[r] = (starDistribution[r] || 0) + 1;
        if (s.mode === "ai") {
          aiRatingSum += r;
          aiRatingCount++;
        } else {
          humanRatingSum += r;
          humanRatingCount++;
        }
      }

      const positiveSurveys = (starDistribution[4] || 0) + (starDistribution[5] || 0);
      const csatPercent = totalSurveys > 0 ? Math.round((positiveSurveys / totalSurveys) * 100) : 0;
      const detractors = satisfactionSurveys.filter(s => Number(s.rating) <= 2).slice(0, 20);

      // Per-operator performance metrics
      const activeOps = teamOperators.filter(op => op.status !== "revoked");
      const operatorMetrics = activeOps.map((op: any) => {
        const opConvs = filteredConvs.filter(c => c.assigned_to === op.id || (!c.assigned_to && c.mode === "human" && activeOps.length === 1));
        const opSurveys = satisfactionSurveys.filter(s => s.operatorId === op.id || s.operatorName === op.name);
        const opAvgRating = opSurveys.length > 0
          ? Number((opSurveys.reduce((a, b) => a + Number(b.rating || 0), 0) / opSurveys.length).toFixed(2))
          : null;
        return {
          operatorId: op.id,
          name: op.name,
          email: op.email,
          role: op.role,
          conversationsHandled: opConvs.length,
          surveysCount: opSurveys.length,
          avgRating: opAvgRating
        };
      });

      premiumAnalytics = {
        starDistribution,
        csatPercent,
        aiAvgRating: aiRatingCount > 0 ? Number((aiRatingSum / aiRatingCount).toFixed(2)) : null,
        humanAvgRating: humanRatingCount > 0 ? Number((humanRatingSum / humanRatingCount).toFixed(2)) : null,
        detractors,
        operatorMetrics,
        channelsSummary: channels.map(ch => ({
          id: ch.id,
          instanceName: ch.instance_name,
          status: ch.status,
          conversationsCount: filteredConvs.filter(c => c.channel_id === ch.id).length
        }))
      };
    }

    return privateJson({
      quickReplies,
      teamOperators,
      maxOperators: effectivePlan.maxOperators,
      conversationTags,
      conversationPriorities,
      satisfactionSurveys,
      upgradeRequests,
      reports: {
        basicIndicators,
        commercialIndicators,
        premiumAnalytics
      },
      featureStates: effectivePlan.featureStates
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "features_unavailable" }, 503);
  }
}

// POST: Execute actions for Quick Replies, Priorities, Satisfaction Surveys, Team Operators, and Upgrade Requests
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

    const auth = await authorizeTenant(request, tenantId);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const { url, serviceKey, redisUrl } = getServiceConfig();
    if (!url || !serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const dataObj = await loadTenantSettingsJson(url, serviceKey, tenantId);

    // 1. ACTION: Request Plan Upgrade (Always allowed, even when account is suspended or locked!)
    if (action === "request_upgrade") {
      const targetPlanId = typeof body.targetPlanId === "string" ? body.targetPlanId : "crm-business";
      const featureRequested = typeof body.featureRequested === "string" ? body.featureRequested : "";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

      const effectivePlan = await getEffectiveTenantPlan(tenantId);
      const targetPlan = DEFAULT_PLANS.find(p => p.id === targetPlanId) || DEFAULT_PLANS[1];

      const upgradeRequests: Array<Record<string, any>> = Array.isArray(dataObj.upgradeRequests)
        ? dataObj.upgradeRequests
        : [];

      const newReq = {
        id: `upg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        currentPlanId: effectivePlan.planId,
        currentPlanName: effectivePlan.planName,
        targetPlanId: targetPlan.id,
        targetPlanName: targetPlan.name,
        targetPrice: targetPlan.price,
        featureRequested,
        note,
        status: "pending",
        createdAt: new Date().toISOString()
      };

      upgradeRequests.unshift(newReq);
      dataObj.upgradeRequests = upgradeRequests.slice(0, 50);
      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);

      return privateJson({
        requested: true,
        upgradeRequest: newReq,
        upgradeRequests: dataObj.upgradeRequests,
        message: `Solicitação de upgrade para o plano ${targetPlan.name} enviada com sucesso para a central Master!`
      });
    }

    // 2. ACTION: Save or Delete Quick Reply (Requires 'quick_replies' - Start, Business, Premium)
    if (action === "save_quick_reply" || action === "delete_quick_reply") {
      const guard = await requireTenantFeature(tenantId, "quick_replies");
      if (!guard.allowed) {
        return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
      }

      const list: Array<Record<string, any>> = Array.isArray(dataObj.quickReplies) && dataObj.quickReplies.length > 0
        ? [...dataObj.quickReplies]
        : [...DEFAULT_QUICK_REPLIES];

      if (action === "delete_quick_reply") {
        const replyId = String(body.replyId || "");
        dataObj.quickReplies = list.filter(r => r.id !== replyId);
      } else {
        const replyId = typeof body.id === "string" && body.id ? body.id : `qr_${Date.now()}`;
        const rawShortcut = typeof body.shortcut === "string" ? body.shortcut.trim() : "/atalho";
        const shortcut = rawShortcut.startsWith("/") ? rawShortcut : `/${rawShortcut}`;
        const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "Resposta Rápida";
        const replyBody = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
        const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Geral";

        if (!replyBody) return privateJson({ error: "empty_quick_reply_body", message: "Digite o texto da resposta rápida." }, 400);

        const existingIdx = list.findIndex(r => r.id === replyId);
        const item = { id: replyId, shortcut, title, body: replyBody, category, updatedAt: new Date().toISOString() };
        if (existingIdx >= 0) list[existingIdx] = item;
        else list.push(item);

        dataObj.quickReplies = list;
      }

      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);
      return privateJson({ saved: true, quickReplies: dataObj.quickReplies });
    }

    // 3. ACTION: Set Conversation Priority (Requires 'conversation_priority' - Business, Premium)
    if (action === "set_priority") {
      const guard = await requireTenantFeature(tenantId, "conversation_priority");
      if (!guard.allowed) {
        return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
      }

      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const validPriorities = ["low", "normal", "high", "urgent"] as const;
      const priority = validPriorities.includes(body.priority) ? body.priority : "normal";

      if (!conversationId) return privateJson({ error: "missing_conversation_id" }, 400);

      const priorities = dataObj.conversationPriorities && typeof dataObj.conversationPriorities === "object"
        ? dataObj.conversationPriorities
        : {};
      priorities[conversationId] = priority;
      dataObj.conversationPriorities = priorities;
      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);

      // Sync to Redis for real-time queue sorting
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1200, maxRetriesPerRequest: 1 });
        await redis.connect();
        await redis.set(`crm:priority:${tenantId}:${conversationId}`, priority, "EX", 86400 * 30);
        redis.disconnect();
      } catch {}

      return privateJson({ saved: true, conversationId, priority });
    }

    // 4. ACTION: Submit or Send Satisfaction Survey (Requires 'satisfaction_survey' - Business, Premium)
    if (action === "submit_satisfaction") {
      const guard = await requireTenantFeature(tenantId, "satisfaction_survey");
      if (!guard.allowed) {
        return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
      }

      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone : "";
      const contactName = typeof body.contactName === "string" ? body.contactName : contactPhone;
      const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating || 5))));
      const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 600) : "";
      const operatorName = typeof body.operatorName === "string" ? body.operatorName : "Atendimento";
      const operatorId = typeof body.operatorId === "string" ? body.operatorId : auth.operatorId;
      const mode = body.mode === "ai" ? "ai" : "human";
      const dayBucket = new Date().toISOString().slice(0, 10);
      const dedupKey = `${conversationId || contactPhone}:${dayBucket}`;

      const surveys: Array<Record<string, any>> = Array.isArray(dataObj.satisfactionSurveys)
        ? dataObj.satisfactionSurveys
        : [];

      // Prevent duplicate survey for the same conversation on the same day unless explicitly updating
      if (surveys.some(s => s.dedupKey === dedupKey) && !body.allowUpdate) {
        return privateJson({
          error: "duplicate_survey",
          message: "Já existe uma avaliação registrada para este atendimento hoje."
        }, 409);
      }

      const entry = {
        id: `csat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        dedupKey,
        conversationId,
        contactPhone,
        contactName,
        rating,
        comment,
        operatorId,
        operatorName,
        mode,
        createdAt: new Date().toISOString()
      };

      const filtered = surveys.filter(s => s.dedupKey !== dedupKey);
      filtered.unshift(entry);
      dataObj.satisfactionSurveys = filtered.slice(0, 300);
      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);

      return privateJson({
        saved: true,
        survey: entry,
        satisfactionSurveys: dataObj.satisfactionSurveys
      });
    }

    // 5. ACTION: Manage Team Operators (Add, Update Role, Revoke) respecting maxOperators (1, 3, 5)
    if (action === "add_operator" || action === "update_operator" || action === "revoke_operator") {
      const effectivePlan = await getEffectiveTenantPlan(tenantId);
      if (effectivePlan.isSuspended) {
        return privateJson({
          error: "ACCOUNT_SUSPENDED",
          message: effectivePlan.publicSuspensionReason || "Conta suspensa administrativamente."
        }, 403);
      }

      const teamOperators: Array<Record<string, any>> = Array.isArray(dataObj.teamOperators)
        ? [...dataObj.teamOperators]
        : [];

      if (action === "add_operator") {
        const activeOps = teamOperators.filter(op => op.status !== "revoked");
        if (activeOps.length >= effectivePlan.maxOperators) {
          const nextPlan = effectivePlan.maxOperators < 3 ? "CRM Business (até 3 operadores)" : "CRM Premium (até 5 operadores)";
          return privateJson({
            error: "OPERATOR_LIMIT_REACHED",
            maxOperators: effectivePlan.maxOperators,
            message: `Seu plano ${effectivePlan.planName} permite até ${effectivePlan.maxOperators} operador(es) ativo(s). Solicite upgrade para ${nextPlan}.`
          }, 403);
        }

        const name = typeof body.name === "string" ? body.name.trim() : "";
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const role = ["admin", "agent", "viewer"].includes(body.role) ? body.role : "agent";

        if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
          return privateJson({
            error: "invalid_operator_data",
            message: "Informe nome válido, e-mail e senha com no mínimo 6 caracteres."
          }, 400);
        }

        // Create or resolve user in Supabase Auth
        let userId = `op_${Date.now()}`;
        try {
          const rUser = await fetch(url + "/auth/v1/admin/users", {
            method: "POST",
            headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              password,
              email_confirm: true,
              user_metadata: { name, tenantId, role }
            })
          });
          if (rUser.ok) {
            const uData = await rUser.json();
            if (uData?.id) userId = uData.id;
          }
        } catch {}

        if (UUID.test(userId)) {
          await fetch(url + "/rest/v1/crm_tenant_memberships", {
            method: "POST",
            headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
            body: JSON.stringify({ tenant_id: tenantId, user_id: userId, role })
          }).catch(() => {});
        }

        const newOp = {
          id: userId,
          name,
          email,
          role,
          status: "active",
          createdAt: new Date().toISOString()
        };
        teamOperators.push(newOp);
        dataObj.teamOperators = teamOperators;
        await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);

        return privateJson({ saved: true, operator: newOp, teamOperators });
      }

      if (action === "update_operator") {
        const operatorId = String(body.operatorId || "");
        const role = ["admin", "agent", "viewer"].includes(body.role) ? body.role : "agent";
        const idx = teamOperators.findIndex(o => o.id === operatorId);
        if (idx >= 0) {
          teamOperators[idx].role = role;
          if (typeof body.name === "string" && body.name.trim()) {
            teamOperators[idx].name = body.name.trim();
          }
        }
        if (UUID.test(operatorId)) {
          await fetch(url + `/rest/v1/crm_tenant_memberships?tenant_id=eq.${tenantId}&user_id=eq.${operatorId}`, {
            method: "PATCH",
            headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
            body: JSON.stringify({ role })
          }).catch(() => {});
        }
        dataObj.teamOperators = teamOperators;
        await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);
        return privateJson({ saved: true, teamOperators });
      }

      if (action === "revoke_operator") {
        const operatorId = String(body.operatorId || "");
        const activeOps = teamOperators.filter(o => o.status !== "revoked");
        if (activeOps.length <= 1) {
          return privateJson({
            error: "cannot_revoke_last_operator",
            message: "Não é permitido remover o único operador ativo do estabelecimento."
          }, 400);
        }

        const idx = teamOperators.findIndex(o => o.id === operatorId);
        if (idx >= 0) {
          teamOperators[idx].status = "revoked";
          teamOperators[idx].revokedAt = new Date().toISOString();
        }
        if (UUID.test(operatorId)) {
          await fetch(url + `/rest/v1/crm_tenant_memberships?tenant_id=eq.${tenantId}&user_id=eq.${operatorId}`, {
            method: "DELETE",
            headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
          }).catch(() => {});
        }
        dataObj.teamOperators = teamOperators;
        await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj);
        return privateJson({ saved: true, revoked: true, teamOperators });
      }
    }

    return privateJson({ error: "invalid_action" }, 400);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "feature_action_failed" }, 503);
  }
}

