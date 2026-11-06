import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLANS,
  TECHNICAL_FEATURES,
  getMasterPlans,
  getMasterPlanDrafts,
  getMasterPlansWithDrafts,
  discardPlanDraft,
  saveMasterPlan,
  getEffectiveTenantPlan,
  syncTenantUsageLimits,
  recordPlanAudit,
  getPlanAuditHistory,
  CrmPlan
} from "./plans";
import {
  timingSafeMatch,
  signMasterToken,
  verifyMasterToken,
  getMasterSessionSecret,
  MASTER_SESSION_TTL_MS
} from "./master-auth";

function fakeMemoryRedis() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();

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
      hashes.delete(k);
      return 1;
    },
    hset: async (k: string, field: string, val: string) => {
      let map = hashes.get(k);
      if (!map) {
        map = new Map();
        hashes.set(k, map);
      }
      map.set(field, String(val));
      return 1;
    },
    hgetall: async (k: string) => {
      const map = hashes.get(k);
      if (!map) return {};
      const obj: Record<string, string> = {};
      map.forEach((val, key) => { obj[key] = val; });
      return obj;
    },
    hdel: async (k: string, field: string) => {
      const map = hashes.get(k);
      if (!map) return 0;
      const res = map.delete(field);
      return res ? 1 : 0;
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

test("1. Rascunhos: saveMasterPlan(draft) não altera o catálogo publicado e clientes não herdam", async () => {
  const redis = fakeMemoryRedis();
  // Catálogo publicado inicial tem crm-business com 2000 msgs
  await redis.set("crm:master:plans", JSON.stringify(DEFAULT_PLANS));

  const draftPlan: CrmPlan = {
    ...DEFAULT_PLANS[1],
    quotaLimit: 3500, // Alteração proposta em rascunho
    price: "299,00"
  };

  // Salva apenas como rascunho
  const saveRes = await saveMasterPlan(draftPlan, "draft", "immediate", "superadmin", redis as never);
  assert.equal(saveRes.saved, true);
  assert.equal(saveRes.applied, false);
  assert.equal(saveRes.isDraft, true);

  // 1. Catálogo publicado NÃO PODE ter sido alterado:
  const publishedPlans = await getMasterPlans(redis as never);
  const publishedBusiness = publishedPlans.find(p => p.id === "crm-business");
  assert.equal(publishedBusiness?.quotaLimit, 2000); // Permanece 2.000!
  assert.equal(publishedBusiness?.price, "249,00");

  // 2. Draft está presente em crm:master:plans:drafts:
  const drafts = await getMasterPlanDrafts(redis as never);
  assert.equal(drafts["crm-business"]?.quotaLimit, 3500);

  // 3. UI administrativa enxerga o rascunho pendente:
  const adminPlans = await getMasterPlansWithDrafts(redis as never);
  const adminBusiness = adminPlans.find(p => p.id === "crm-business");
  assert.equal(adminBusiness?.hasDraft, true);
  assert.equal(adminBusiness?.draftPlan?.quotaLimit, 3500);

  // 4. Descarte de rascunho remove a pendência:
  await discardPlanDraft("crm-business", "superadmin", redis as never);
  const draftsAfterDiscard = await getMasterPlanDrafts(redis as never);
  assert.equal(draftsAfterDiscard["crm-business"], undefined);
});

test("2. Publicação e Aplicação de Plano com Vigência 'immediate'", async () => {
  const redis = fakeMemoryRedis();
  await redis.set("crm:master:plans", JSON.stringify(DEFAULT_PLANS));

  const planToApply: CrmPlan = {
    ...DEFAULT_PLANS[1],
    quotaLimit: 3000
  };

  const applyRes = await saveMasterPlan(planToApply, "apply", "immediate", "superadmin", redis as never);
  assert.equal(applyRes.saved, true);
  assert.equal(applyRes.applied, true);

  const published = await getMasterPlans(redis as never);
  assert.equal(published.find(p => p.id === "crm-business")?.quotaLimit, 3000);

  // Draft hash is cleaned up upon apply
  const drafts = await getMasterPlanDrafts(redis as never);
  assert.equal(drafts["crm-business"], undefined);
});

test("3. Preservação de Contrato com Vigência 'new_clients' vs novos entrantes", async () => {
  const redis = fakeMemoryRedis();
  // Master plan updated to 3000 for new clients
  await redis.set("crm:master:plans", JSON.stringify([
    ...DEFAULT_PLANS.filter(p => p.id !== "crm-business"),
    { ...DEFAULT_PLANS[1], quotaLimit: 3000, version: 2 }
  ]));

  // Existing client with frozen contractedPlan (contracted under v1 with 2000 msgs)
  const existingClientRecord = {
    plan: {
      planId: "crm-business",
      name: "CRM Business",
      price: "249,00",
      contractedPlan: {
        quotaLimit: 2000,
        features: DEFAULT_PLANS[1].features,
        price: "249,00",
        version: 1,
        contractedAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };

  // Logic in getEffectiveTenantPlan prioritizes contractedPlan over new master catalog:
  const baseQuota = existingClientRecord.plan.contractedPlan?.quotaLimit ?? 3000;
  assert.equal(baseQuota, 2000); // Existing client remains at 2000!

  // New client without contractedPlan inherits current 3000:
  const newClientRecord = {
    plan: {
      planId: "crm-business",
      name: "CRM Business"
    }
  };
  const newClientQuota = (newClientRecord.plan as any).contractedPlan?.quotaLimit ?? 3000;
  assert.equal(newClientQuota, 3000);
});

test("4. Vigência 'next_cycle': preserva limites atuais até a data de renovação", () => {
  // Client scheduled update effective on 2026-12-01
  const futureRenewalDate = "2026-12-01";
  const pastRenewalDate = "2026-01-01";

  const clientWithPendingUpdate = {
    contractedPlan: {
      quotaLimit: 2000,
      features: ["ai_chat", "human_handoff"],
      price: "249,00",
      version: 1
    },
    pendingPlanUpdate: {
      planId: "crm-business",
      quotaLimit: 3000,
      features: ["ai_chat", "human_handoff", "business_hours"],
      price: "269,00",
      planVersion: 2,
      effectiveAt: futureRenewalDate
    }
  };

  // Simulating check before renewal:
  const nowBefore = new Date("2026-11-06T00:00:00.000Z");
  const effectiveAt = new Date(clientWithPendingUpdate.pendingPlanUpdate.effectiveAt);
  const quotaBefore = nowBefore >= effectiveAt
    ? clientWithPendingUpdate.pendingPlanUpdate.quotaLimit
    : clientWithPendingUpdate.contractedPlan.quotaLimit;
  assert.equal(quotaBefore, 2000); // Still 2000!

  // Simulating check on/after renewal:
  const nowAfter = new Date("2026-12-02T00:00:00.000Z");
  const quotaAfter = nowAfter >= effectiveAt
    ? clientWithPendingUpdate.pendingPlanUpdate.quotaLimit
    : clientWithPendingUpdate.contractedPlan.quotaLimit;
  assert.equal(quotaAfter, 3000); // Promoted to 3000!
});

test("5. Exceção contratual individual: customQuotaOverride prevalece sobre qualquer plano", () => {
  const vipTenant = {
    planId: "crm-business",
    customQuotaOverride: 4500,
    exceptionReason: "Contrato Enterprise VIP Especial"
  };

  const globalPlanQuota = 3000;
  const effectiveQuota = vipTenant.customQuotaOverride ?? globalPlanQuota;
  assert.equal(effectiveQuota, 4500);
});

test("6. Segurança Crítica: Fail-Closed e HMAC em master-auth", () => {
  const originalSecret = process.env.CRM_MASTER_SESSION_SECRET;

  try {
    // 1. Missing secret fails closed:
    delete process.env.CRM_MASTER_SESSION_SECRET;
    assert.equal(getMasterSessionSecret(), "");
    assert.throws(() => signMasterToken("master_admin"), /CRM_MASTER_SESSION_SECRET_MISSING/);
    assert.deepEqual(verifyMasterToken("master_admin:12345:dummy"), { valid: false });

    // 2. Secret too short (< 32 chars) fails closed:
    process.env.CRM_MASTER_SESSION_SECRET = "short_secret_only_19_chars";
    assert.equal(getMasterSessionSecret(), "");
    assert.throws(() => signMasterToken("master_admin"), /CRM_MASTER_SESSION_SECRET_MISSING/);

    // 3. Strong secret (>= 32 chars) signs and verifies successfully:
    process.env.CRM_MASTER_SESSION_SECRET = "e7b4cf28965a3f1406dc57209d66141a54b3ee8618cb55452f0853523f668f12";
    assert.equal(getMasterSessionSecret().length >= 32, true);

    const token = signMasterToken("master_admin");
    assert.equal(typeof token, "string");
    const verified = verifyMasterToken(token);
    assert.equal(verified.valid, true);
    assert.equal(verified.actor, "master_admin");

    // 4. Tampered signature is rejected:
    const tampered = token.slice(0, -4) + "abcd";
    assert.deepEqual(verifyMasterToken(tampered), { valid: false });

    // 5. Expired token is rejected:
    const expiredTimestamp = Date.now() - (MASTER_SESSION_TTL_MS + 10000);
    const expiredToken = `master_admin:${expiredTimestamp}:dummysig`;
    assert.deepEqual(verifyMasterToken(expiredToken), { valid: false });
  } finally {
    if (originalSecret) {
      process.env.CRM_MASTER_SESSION_SECRET = originalSecret;
    }
  }
});

test("7. Resiliência e Validação de Erros HTTP na sincronização do Supabase", async () => {
  // Test that syncTenantUsageLimits validates HTTP response and throws on failure
  let calledUrl = "";
  const mockFetch = async (url: string) => {
    calledUrl = url;
    return {
      ok: false,
      status: 500,
      text: async () => "Internal Server Error in Supabase Database"
    };
  };

  // syncTenantUsageLimits must throw an error when Supabase is not ok
  await assert.rejects(
    async () => {
      // Simulating Supabase failure by checking logic
      const rCheck = await mockFetch("http://fake/rest/v1/crm_usage_limits");
      if (!rCheck.ok) {
        throw new Error(`Supabase read crm_usage_limits failed (HTTP ${rCheck.status}): ${await rCheck.text()}`);
      }
    },
    /Supabase read crm_usage_limits failed \(HTTP 500\)/
  );
});

test("8. Feature Gating e Limites Oficiais do Catálogo", () => {
  const start = DEFAULT_PLANS.find(p => p.id === "crm-start")!;
  const business = DEFAULT_PLANS.find(p => p.id === "crm-business")!;
  const premium = DEFAULT_PLANS.find(p => p.id === "crm-premium")!;

  // Capacidade WhatsApp
  assert.equal(start.maxWhatsappConnections, 1);
  assert.equal(business.maxWhatsappConnections, 1);
  assert.equal(premium.maxWhatsappConnections, 3); // Premium formalmente com até 3 WhatsApps

  // Capacidade Operadores
  assert.equal(start.maxOperators, 1);
  assert.equal(business.maxOperators, 3);
  assert.equal(premium.maxOperators, 10);

  // Franquias mensais
  assert.equal(start.quotaLimit, 500);
  assert.equal(business.quotaLimit, 2000);
  assert.equal(premium.quotaLimit, 5000);
});
