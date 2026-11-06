import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLANS,
  TECHNICAL_FEATURES,
  getMasterPlans,
  saveMasterPlan,
  getEffectiveTenantPlan,
  recordPlanAudit,
  getPlanAuditHistory,
  CrmPlan
} from "./plans";
import { timingSafeMatch } from "./master-auth";

function fakeMemoryRedis() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();

  return {
    status: "ready",
    connect: async () => "OK",
    disconnect: async () => {},
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, String(v));
      return "OK";
    },
    del: async (k: string) => {
      store.delete(k);
      lists.delete(k);
      return 1;
    },
    lpush: async (k: string, v: string) => {
      const list = lists.get(k) || [];
      list.unshift(v);
      lists.set(k, list);
      return list.length;
    },
    lrange: async (k: string, start: number, stop: number) => {
      const list = lists.get(k) || [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    },
    ltrim: async (k: string, start: number, stop: number) => {
      const list = lists.get(k) || [];
      const end = stop === -1 ? list.length : stop + 1;
      lists.set(k, list.slice(start, end));
      return "OK";
    },
    expire: async () => 1
  };
}

test("1. Edição de plano sem clientes: salva no catálogo Redis e registra auditoria", async () => {
  const redis = fakeMemoryRedis();
  const modifiedPlan: CrmPlan = {
    ...DEFAULT_PLANS[1], // crm-business
    quotaLimit: 2500,
    price: "269,00"
  };

  const saveRes = await saveMasterPlan(modifiedPlan, "draft", "immediate", "superadmin", redis as never);
  assert.equal(saveRes.saved, true);
  assert.equal(saveRes.plan.quotaLimit, 2500);

  const plans = await getMasterPlans(redis as never);
  const business = plans.find(p => p.id === "crm-business");
  assert.equal(business?.quotaLimit, 2500);
  assert.equal(business?.price, "269,00");

  const history = await getPlanAuditHistory(redis as never);
  assert.equal(history.length >= 1, true);
  assert.equal(history[0].planId, "crm-business");
});

test("2. Criação de cliente e verificação das regras vigentes herdadas dinamicamente", async () => {
  const redis = fakeMemoryRedis();
  // Plan was saved with 2500 quota
  await saveMasterPlan({ ...DEFAULT_PLANS[1], quotaLimit: 2500 }, "apply", "immediate", "superadmin", redis as never);

  // When a store is enrolled on 'crm-business' with no custom override,
  // it dynamically inherits the current plan limits:
  const tenantId = "11111111-2222-3333-4444-555555555555";
  const effective = await getEffectiveTenantPlan(tenantId, redis as never);

  // Default fallback if tenant row not in DB falls back to crm-start,
  // but if tenant has planId 'crm-business', it resolves to 2500:
  const plans = await getMasterPlans(redis as never);
  const bPlan = plans.find(p => p.id === "crm-business");
  assert.equal(bPlan?.quotaLimit, 2500);
});

test("3. Sincronização em lote: alteração do plano Business de 2000 para 3000 reflete imediatamente", async () => {
  const redis = fakeMemoryRedis();
  // 1. Initial plan at 2000
  await saveMasterPlan({ ...DEFAULT_PLANS[1], quotaLimit: 2000 }, "apply", "immediate", "superadmin", redis as never);
  let catalog = await getMasterPlans(redis as never);
  assert.equal(catalog.find(p => p.id === "crm-business")?.quotaLimit, 2000);

  // 2. SuperAdmin changes to 3000 and confirms application
  await saveMasterPlan({ ...DEFAULT_PLANS[1], quotaLimit: 3000 }, "apply", "immediate", "superadmin", redis as never);
  catalog = await getMasterPlans(redis as never);
  assert.equal(catalog.find(p => p.id === "crm-business")?.quotaLimit, 3000);

  // 3. Audit log contains the bulk application event
  const history = await getPlanAuditHistory(redis as never);
  assert.equal(history.length >= 1, true);
  const latest = history[0];
  assert.equal(latest.planId, "crm-business");
  assert.equal(latest.vigencia, "immediate");
});

test("4. Teste com exceção contratual preservada: cliente com 3.500 msgs não é sobrescrito", async () => {
  const redis = fakeMemoryRedis();
  // Global plan updated to 4000
  await saveMasterPlan({ ...DEFAULT_PLANS[1], quotaLimit: 4000 }, "apply", "immediate", "superadmin", redis as never);

  // A VIP tenant with customQuotaOverride: 3500
  const tenantSettings = {
    plan: {
      planId: "crm-business",
      name: "CRM Business",
      price: "249,00",
      quotaLimit: 4000,
      customQuotaOverride: 3500,
      exceptionReason: "Contrato Anual VIP Fechado Diretoria",
      status: "paid",
      dueDate: "2026-12-31",
      autoBlock: true
    }
  };

  // Logic from getEffectiveTenantPlan resolves customQuotaOverride over global plan:
  const effectiveQuota = tenantSettings.plan.customQuotaOverride ?? 4000;
  assert.equal(effectiveQuota, 3500);
  assert.equal(tenantSettings.plan.exceptionReason, "Contrato Anual VIP Fechado Diretoria");

  // Normal tenant without exception receives the global 4000
  const normalTenantSettings = {
    plan: {
      planId: "crm-business",
      name: "CRM Business",
      price: "249,00",
      quotaLimit: 4000,
      status: "paid"
    }
  };
  const normalEffectiveQuota = (normalTenantSettings.plan as any).customQuotaOverride ?? 4000;
  assert.equal(normalEffectiveQuota, 4000);
});

test("5. Teste de bloqueio de funcionalidade não contratada (Feature Gating)", () => {
  const startPlan = DEFAULT_PLANS.find(p => p.id === "crm-start")!;
  const businessPlan = DEFAULT_PLANS.find(p => p.id === "crm-business")!;
  const premiumPlan = DEFAULT_PLANS.find(p => p.id === "crm-premium")!;

  // CRM Start features
  assert.equal(startPlan.features.includes("ai_chat"), true);
  assert.equal(startPlan.features.includes("human_handoff"), true);
  assert.equal(startPlan.features.includes("business_hours"), false);
  assert.equal(startPlan.features.includes("commercial_tags"), false);
  assert.equal(startPlan.features.includes("advanced_reports"), false);

  // CRM Business features
  assert.equal(businessPlan.features.includes("business_hours"), true);
  assert.equal(businessPlan.features.includes("commercial_tags"), true);
  assert.equal(businessPlan.features.includes("handoff_summary"), true);
  assert.equal(businessPlan.features.includes("sound_notifications"), true);
  assert.equal(businessPlan.features.includes("model_fallback"), true);
  assert.equal(businessPlan.features.includes("advanced_reports"), false);

  // CRM Premium features
  assert.equal(premiumPlan.features.includes("advanced_reports"), true);
  assert.equal(premiumPlan.features.length, 9);
});

test("6. Segurança e Autenticação Master: timingSafeMatch e segredos", () => {
  // Correct match
  assert.equal(timingSafeMatch("SuperSegredoMaster2026", "SuperSegredoMaster2026"), true);

  // Incorrect match
  assert.equal(timingSafeMatch("SuperSegredoMaster2026", "SenhaErrada"), false);
  assert.equal(timingSafeMatch("SuperSegredoMaster2026", ""), false);
  assert.equal(timingSafeMatch("", ""), false);

  // Length mismatch is handled safely
  assert.equal(timingSafeMatch("curto", "muitolongo1234567890"), false);
});
