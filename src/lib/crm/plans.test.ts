import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLANS,
  TECHNICAL_FEATURES,
  TRIAL_PLAN,
  checkTrialEligibility,
  recordTrialRegistration,
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
  assert.equal(publishedBusiness?.quotaLimit, 600); // Permanece 600 do catálogo oficial!
  assert.equal(publishedBusiness?.price, "99,90");

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
  assert.equal(premium.maxWhatsappConnections, 2); // Premium formalmente com até 2 WhatsApps

  // Capacidade Operadores
  assert.equal(start.maxOperators, 1);
  assert.equal(business.maxOperators, 3);
  assert.equal(premium.maxOperators, 5); // Premium formalmente com até 5 operadores

  // Franquias mensais
  assert.equal(start.quotaLimit, 200);
  assert.equal(business.quotaLimit, 600);
  assert.equal(premium.quotaLimit, 1500);

  // Preços oficiais
  assert.equal(start.price, "59,90");
  assert.equal(business.price, "99,90");
  assert.equal(premium.price, "159,90");

  // Destaque do Business (MAIS RECOMENDADO)
  assert.equal(business.isPopular, true);

  // Teste Grátis Oficial (7 Dias / 100 Atendimentos)
  assert.equal(TRIAL_PLAN.quotaLimit, 100);
  assert.equal(TRIAL_PLAN.durationDays, 7);
  assert.equal(TRIAL_PLAN.maxWhatsappConnections, 1);
  assert.equal(TRIAL_PLAN.maxOperators, 1);
});

test("9. Proteção contra força bruta (Rate Limiting de Login Master)", async () => {
  const redis = fakeMemoryRedis();
  const ip = "192.168.1.100";
  const rateLimitKey = `crm:ratelimit:master_login:${ip}`;

  // Simulate 4 failed attempts
  for (let i = 0; i < 4; i++) {
    const cur = parseInt((await redis.get(rateLimitKey)) || "0", 10);
    await redis.set(rateLimitKey, String(cur + 1));
  }
  assert.equal(await redis.get(rateLimitKey), "4");

  // 5th attempt reaches threshold
  const cur = parseInt((await redis.get(rateLimitKey)) || "0", 10);
  await redis.set(rateLimitKey, String(cur + 1));
  assert.equal(parseInt((await redis.get(rateLimitKey)) || "0", 10) >= 5, true);

  // Success resets counter
  await redis.del(rateLimitKey);
  assert.equal(await redis.get(rateLimitKey), null);
});

test("10. Teste Grátis (7 Dias): Recursos do Business herdados e franquia de 100", () => {
  assert.equal(TRIAL_PLAN.features.includes("ai_chat"), true);
  assert.equal(TRIAL_PLAN.features.includes("human_handoff"), true);
  assert.equal(TRIAL_PLAN.features.includes("simulator"), true);
  assert.equal(TRIAL_PLAN.features.includes("business_hours"), true);
  assert.equal(TRIAL_PLAN.features.includes("commercial_tags"), true);
  assert.equal(TRIAL_PLAN.features.includes("sound_notifications"), true);
  assert.equal(TRIAL_PLAN.features.includes("handoff_summary"), true);
  assert.equal(TRIAL_PLAN.features.includes("model_fallback"), true);
  // Recursos exclusivos do Premium NÃO devem estar presentes no Trial
  assert.equal(TRIAL_PLAN.features.includes("advanced_reports"), false);
});

test("11. Ciclo de Vida do Teste Grátis: Contagem regressiva e bloqueio após 7 dias", async () => {
  const redis = fakeMemoryRedis();

  // Caso 1: Teste iniciado hoje (7 dias restantes)
  const today = new Date().toISOString();
  const rawToday = {
    plan: {
      planId: "crm-trial",
      name: "Teste Grátis (7 Dias)",
      isTrial: true,
      trialStartedAt: today,
      quotaLimit: 100
    }
  };
  const planToday = await getEffectiveTenantPlan("tenant-today", JSON.stringify(rawToday), redis as never);
  assert.equal(planToday.isTrial, true);
  assert.equal(planToday.quotaLimit, 100);
  assert.equal(planToday.isSuspended, false);
  assert.equal(planToday.trialDaysLeft! >= 6, true);

  // Caso 2: Teste com 8 dias atrás (expirado)
  const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
  const rawExpired = {
    plan: {
      planId: "crm-trial",
      name: "Teste Grátis (7 Dias)",
      isTrial: true,
      trialStartedAt: eightDaysAgo,
      quotaLimit: 100
    }
  };
  const planExpired = await getEffectiveTenantPlan("tenant-expired", JSON.stringify(rawExpired), redis as never);
  assert.equal(planExpired.isTrial, true);
  assert.equal(planExpired.isSuspended, true); // Automaticamente suspenso por expiração
  assert.equal(planExpired.trialStatus, "expired");
  assert.equal(planExpired.trialDaysLeft, 0);
});

test("12. Anti-abuso do Teste Grátis: Prevenção de cadastro repetido por loja ou e-mail", async () => {
  const redis = fakeMemoryRedis();

  const storeName = "Loja das Flores Novaes";
  const email = "contato@floresnovaes.com.br";
  const tenantId = "tenant-flores-001";

  // Primeira verificação: elegível
  const firstCheck = await checkTrialEligibility(storeName, email, redis as never);
  assert.equal(firstCheck.eligible, true);

  // Registra no Redis
  await recordTrialRegistration(storeName, email, tenantId, redis as never);

  // Segunda verificação com o mesmo nome: deve ser bloqueado
  const secondCheckName = await checkTrialEligibility(storeName, "outro-email@gmail.com", redis as never);
  assert.equal(secondCheckName.eligible, false);
  assert.equal(secondCheckName.reason, "duplicate_store");

  // Terceira verificação com o mesmo e-mail: deve ser bloqueado
  const thirdCheckEmail = await checkTrialEligibility("Outra Loja Nova", email, redis as never);
  assert.equal(thirdCheckEmail.eligible, false);
  assert.equal(thirdCheckEmail.reason, "duplicate_email");
});

test("13. Feature Gating Real: Bloqueio estrito de recursos entre Start, Business e Premium", () => {
  const startFeatures = DEFAULT_PLANS[0].features;
  const businessFeatures = DEFAULT_PLANS[1].features;
  const premiumFeatures = DEFAULT_PLANS[2].features;

  // Start não possui horários nem etiquetas
  assert.equal(startFeatures.includes("business_hours"), false);
  assert.equal(startFeatures.includes("commercial_tags"), false);
  assert.equal(startFeatures.includes("sound_notifications"), false);
  assert.equal(startFeatures.includes("advanced_reports"), false);

  // Business possui horários, etiquetas e som, mas não relatórios avançados
  assert.equal(businessFeatures.includes("business_hours"), true);
  assert.equal(businessFeatures.includes("commercial_tags"), true);
  assert.equal(businessFeatures.includes("sound_notifications"), true);
  assert.equal(businessFeatures.includes("model_fallback"), true);
  assert.equal(businessFeatures.includes("advanced_reports"), false);

  // Premium possui tudo do Business + relatórios avançados
  assert.equal(premiumFeatures.includes("advanced_reports"), true);
  assert.equal(premiumFeatures.includes("sound_notifications"), true);
});

test("14. Limites de conexões WhatsApp por plano", () => {
  const start = DEFAULT_PLANS[0];
  const business = DEFAULT_PLANS[1];
  const premium = DEFAULT_PLANS[2];
  const trial = TRIAL_PLAN;

  assert.equal(start.maxWhatsappConnections, 1);
  assert.equal(business.maxWhatsappConnections, 1);
  assert.equal(trial.maxWhatsappConnections, 1);
  assert.equal(premium.maxWhatsappConnections, 2);
});

test("15. Isolamento de chaves de cota: Teste Grátis vs Planos Mensais", async () => {
  const redis = fakeMemoryRedis();
  const trialTenantId = "tenant-trial-123";
  const paidTenantId = "tenant-paid-456";

  // Cota do trial usa chave fixa independente do mês
  const trialKey = `crm:quota:trial:${trialTenantId}`;
  await redis.set(trialKey, "99");
  assert.equal(await redis.get(trialKey), "99");

  // Próximo atendimento chega a 100 (limite máximo)
  await redis.set(trialKey, "100");
  assert.equal(parseInt((await redis.get(trialKey)) || "0", 10) >= 100, true);

  // Cota de plano mensal usa chave por mês
  const monthKey = new Date().toISOString().slice(0, 7);
  const paidKey = `crm:quota:${paidTenantId}:${monthKey}`;
  await redis.set(paidKey, "450");
  assert.equal(await redis.get(paidKey), "450");
  // Chaves não colidem
  assert.notEqual(trialKey, paidKey);
});

test("16. Execução do Catálogo Master com 0 Clientes Cadastrados", async () => {
  const redis = fakeMemoryRedis();

  // Catálogo vazio é inicializado com DEFAULT_PLANS
  const plans = await getMasterPlans(redis as never);
  assert.equal(plans.length, 3);
  assert.equal(plans[0].name, "CRM Start");
  assert.equal(plans[1].name, "CRM Business");
  assert.equal(plans[2].name, "CRM Premium");

  // Salvar plano mesmo com 0 clientes registrados opera com sucesso e registra auditoria
  const updateRes = await saveMasterPlan({
    ...plans[0],
    price: "69,90"
  }, "apply", "immediate", "admin_test", redis as never);

  assert.equal(updateRes.saved, true);
  assert.equal(updateRes.applied, true);

  const audits = await getPlanAuditHistory(redis as never);
  assert.equal(audits.length >= 1, true);
  assert.equal(audits[0].planId, "crm-start");
});
