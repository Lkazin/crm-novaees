import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyClient, computeFinanceMetrics, confirmedPayments, parseBRL, resolvePeriod,
  type FinanceClient
} from "./finance-metrics";

const NOW = new Date(2026, 10, 9, 12, 0, 0); // 09/11/2026
const catalog = [
  { id: "crm-start", name: "CRM Start", price: "59,90" },
  { id: "crm-business", name: "CRM Business", price: "149,90" },
  { id: "crm-premium", name: "CRM Premium", price: "299,90" }
];

function client(over: Partial<FinanceClient> & { id: string; plan?: Partial<FinanceClient["plan"]> }): FinanceClient {
  const { plan, ...rest } = over;
  return {
    name: `Loja ${over.id}`,
    status: "active",
    created_at: "2026-10-01T10:00:00Z",
    paymentHistory: [],
    ...rest,
    plan: { planId: "crm-start", name: "CRM Start", price: "59,90", dueDate: "2026-11-20", status: "paid", ...plan }
  } as FinanceClient;
}

const period = () => resolvePeriod("month", NOW);

test("parseBRL understands Brazilian formats", () => {
  assert.equal(parseBRL("1.234,56"), 1234.56);
  assert.equal(parseBRL("59,90"), 59.9);
  assert.equal(parseBRL(10), 10);
  assert.equal(parseBRL(undefined), 0);
  assert.equal(parseBRL("abc"), 0);
});

test("classification: trial is never paying; canceled is never active; master tenant is excluded", () => {
  const trial = classifyClient(client({ id: "t", plan: { planId: "crm-trial", isTrial: true, price: "0,00" } }), NOW);
  assert.equal(trial.trial, true);
  assert.equal(trial.paying, false);
  assert.equal(trial.active, true);

  const canceled = classifyClient(client({ id: "c", status: "canceled" }), NOW);
  assert.equal(canceled.active, false);
  assert.equal(canceled.paying, false);

  const m = computeFinanceMetrics({
    clients: [client({ id: "m", isMasterOwnTenant: true }), client({ id: "a" })],
    planCatalog: catalog, filters: { ...period() }, now: NOW
  });
  assert.equal(m.totals.companies, 1);
});

test("MRR uses the contracted price, not the current catalog price, and ignores trials/suspended/canceled", () => {
  const clients = [
    client({ id: "a", plan: { planId: "crm-start", price: "59,90", contractedPlan: { price: "39,90" } } }), // negociado
    client({ id: "b", plan: { planId: "crm-business", name: "CRM Business", price: "149,90" } }),
    client({ id: "t", plan: { planId: "crm-trial", isTrial: true, price: "0,00" } }),
    client({ id: "s", status: "suspended", plan: { planId: "crm-premium", price: "299,90" } }),
    client({ id: "x", status: "canceled", plan: { planId: "crm-premium", price: "299,90" } })
  ];
  const m = computeFinanceMetrics({ clients, planCatalog: catalog, filters: period(), now: NOW });
  assert.equal(m.money.mrr, 39.9 + 149.9);
  assert.equal(m.totals.paying, 2);
  assert.equal(m.totals.trial, 1);
  assert.equal(m.totals.suspended, 1);
  assert.equal(m.totals.canceled, 1);
  assert.equal(m.totals.active, 3); // a, b, trial
  assert.equal(m.money.averageTicket, (39.9 + 149.9) / 2);
});

test("received revenue counts only confirmed payments inside the period and dedupes cycles", () => {
  const pay = (id: string, cycle: string, paidAt: string, amount = "59,90", status = "paid") =>
    ({ id, billingCycleKey: cycle, paidAt, amount, status });
  const c = client({
    id: "a",
    paymentHistory: [
      pay("p1", "c1", "2026-09-10T10:00:00Z"),                 // fora do período
      pay("p2", "c2", "2026-11-05T10:00:00Z"),                 // dentro
      pay("p2dup", "c2", "2026-11-05T11:00:00Z"),              // duplicado do ciclo c2
      pay("p3", "c3", "2026-11-06T10:00:00Z", "100,00", "pending") // não confirmado
    ]
  });
  assert.equal(confirmedPayments(c).length, 2);
  const m = computeFinanceMetrics({ clients: [c], planCatalog: catalog, filters: period(), now: NOW });
  assert.equal(m.money.receivedInPeriod, 59.9);
  assert.equal(m.totals.renewedInPeriod, 1);
  assert.equal(m.money.newSubscriptionRevenue, 0); // 1º pagamento foi em setembro
  assert.equal(m.money.recurringRevenue, 59.9);
  assert.equal(m.alerts.duplicatePayments, 1);
});

test("receivable, overdue and next-7-days are separated and exclude trials", () => {
  const clients = [
    client({ id: "late", plan: { dueDate: "2026-11-04", status: "pending", price: "100,00" } }),
    client({ id: "soon", plan: { dueDate: "2026-11-12", status: "pending", price: "50,00" } }),
    client({ id: "later", plan: { dueDate: "2026-12-20", status: "pending", price: "70,00" } }),
    client({ id: "paid", plan: { dueDate: "2026-11-10", status: "paid", price: "80,00" } }),
    client({ id: "trial", plan: { planId: "crm-trial", isTrial: true, price: "0,00", dueDate: "2026-11-01", status: "pending" } })
  ];
  const m = computeFinanceMetrics({ clients, planCatalog: catalog, filters: period(), now: NOW });
  assert.equal(m.totals.overdue, 1);
  assert.equal(m.money.overdueAmount, 100);
  assert.equal(m.money.receivable, 220); // late + soon + later (pagos e testes ficam de fora)
  assert.equal(m.money.dueNext7Days, 50);
  assert.equal(m.money.dueNext7DaysCount, 1);
  assert.equal(m.alerts.overdueClients[0].daysOverdue, 5);
});

test("plan distribution always sums to the total and keeps unknown plans visible", () => {
  const clients = [
    client({ id: "1" }),
    client({ id: "2", plan: { planId: "crm-business", name: "CRM Business", price: "149,90" } }),
    client({ id: "3", plan: { planId: "crm-trial", isTrial: true, price: "0,00" } }),
    client({ id: "4", plan: { planId: "", name: "Plano não definido", price: "0,00" } }),
    client({ id: "5", status: "canceled" })
  ];
  const m = computeFinanceMetrics({ clients, planCatalog: catalog, filters: period(), now: NOW });
  const sum = m.plans.reduce((s, p) => s + p.companies, 0);
  assert.equal(sum, 5);
  assert.equal(m.totals.companies, 5);
  assert.ok(m.plans.some(p => p.name === "Plano não definido" && p.companies === 1));
  const start = m.plans.find(p => p.planId === "crm-start")!;
  assert.equal(start.companies, 2);
  assert.equal(start.canceled, 1);
  assert.equal(start.mrr, 59.9);
  assert.ok(Math.abs(m.plans.reduce((s, p) => s + p.percent, 0) - 100) < 1e-9);
});

test("filters by plan, status and company narrow the snapshot", () => {
  const clients = [
    client({ id: "1" }),
    client({ id: "2", plan: { planId: "crm-business", name: "CRM Business", price: "149,90" } }),
    client({ id: "3", status: "suspended" })
  ];
  const byPlan = computeFinanceMetrics({ clients, planCatalog: catalog, filters: { ...period(), planId: "crm-business" }, now: NOW });
  assert.equal(byPlan.totals.companies, 1);
  assert.equal(byPlan.money.mrr, 149.9);
  const bySusp = computeFinanceMetrics({ clients, planCatalog: catalog, filters: { ...period(), subscriptionStatus: "suspended" }, now: NOW });
  assert.equal(bySusp.totals.companies, 1);
  const byTenant = computeFinanceMetrics({ clients, planCatalog: catalog, filters: { ...period(), tenantId: "1" }, now: NOW });
  assert.equal(byTenant.totals.companies, 1);
});

test("recharges only count confirmed purchases; unavailable indicators are null, never fake", () => {
  const clients = [client({ id: "a" })];
  const m = computeFinanceMetrics({
    clients, planCatalog: catalog, filters: period(), now: NOW,
    recharges: [
      { id: "r1", tenantId: "a", pricePaid: 30, purchasedAt: "2026-11-02T10:00:00Z", status: "paid" },
      { id: "r2", tenantId: "a", pricePaid: 99, purchasedAt: "2026-11-03T10:00:00Z", status: "pending" },
      { id: "r3", tenantId: "a", pricePaid: 50, purchasedAt: "2026-08-03T10:00:00Z", status: "paid" }
    ]
  });
  assert.equal(m.money.rechargeRevenue, 30);
  assert.equal(m.alerts.pendingRecharges, 1);
  assert.equal(m.money.expenses, null);
  assert.equal(m.money.operatingProfit, null);
  assert.equal(m.money.operatingMargin, null);
  assert.equal(m.money.upgradeRevenue, null);
  assert.equal(m.totals.cancellationRequests, null);
});

test("forecast uses contract cycles and is not counted as received", () => {
  const clients = [
    client({ id: "a", plan: { dueDate: "2026-11-15", status: "pending", price: "100,00" } }), // vence nos próx. dias
    client({ id: "b", plan: { dueDate: "2026-11-30", status: "paid", price: "200,00" } })     // paga: próxima em 30/12
  ];
  const m = computeFinanceMetrics({ clients, planCatalog: catalog, filters: period(), now: NOW });
  assert.equal(m.forecast.d30, 100);           // a em 15/11 (b só em 30/12)
  assert.equal(m.forecast.d60, 100 + 100 + 200); // a: 15/11 e 15/12; b: 30/12
  assert.equal(m.money.receivedInPeriod, 0);
});

test("period presets resolve to the expected ranges", () => {
  const prev = resolvePeriod("prev_month", NOW);
  assert.equal(prev.from.getMonth(), 9);
  assert.equal(prev.to.getDate(), 31);
  const seven = resolvePeriod("7d", NOW);
  assert.equal(seven.from.getDate(), 3);
  const custom = resolvePeriod("custom", NOW, { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(custom.from.getMonth(), 0);
  assert.equal(custom.to.getDate(), 31);
});
