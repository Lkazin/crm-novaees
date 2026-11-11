/**
 * Fonte única dos indicadores financeiros do Painel Master.
 *
 * Funções puras: recebem os dados reais já persistidos no Supabase (lista de
 * lojas com plano/histórico de pagamentos e recargas) e devolvem os indicadores.
 * Nada aqui inventa valores: quando o dado não existe, o indicador é `null`
 * (indisponível) em vez de zero ou número fictício.
 *
 * Definições (mantidas em um lugar só para evitar divergência entre cards):
 *  - Cancelada:   tenant.status = canceled/cancelled.
 *  - Suspensa:    tenant.status != active (e não cancelada) OU suspensão administrativa.
 *  - Teste grátis: plano de teste e ainda não convertido.
 *  - Ativa:       não cancelada, não suspensa (inclui testes grátis).
 *  - Pagante:     ativa, plano pago (mensalidade contratada > 0), não é teste.
 *  - Inadimplente: pagante/ativa de plano pago, cobrança não paga e vencida.
 *  - MRR:         soma da mensalidade CONTRATADA das lojas pagantes (não é caixa).
 *  - Receita recebida: soma de pagamentos CONFIRMADOS (status paid) no período.
 *  A loja própria da NovaesWeb (master) é sempre excluída dos indicadores.
 */

export type FinancePayment = {
  id?: string;
  billingCycleKey?: string;
  planId?: string;
  planName?: string;
  amount?: string | number;
  dueDate?: string;
  paidAt?: string;
  status?: string;
  kind?: string;
};

export type FinanceClient = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  isMasterOwnTenant?: boolean;
  suspension?: { isSuspended?: boolean };
  paymentHistory?: FinancePayment[];
  plan: {
    planId?: string;
    name?: string;
    price?: string | number;
    dueDate?: string;
    status?: string;
    isOverdue?: boolean;
    isTrial?: boolean;
    trialStatus?: string;
    isSuspended?: boolean;
    contractedPlan?: { price?: string | number } | null;
  };
};

export type FinanceExpense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  paymentDate?: string | null;
  status: "paid" | "pending";
};

export type FinanceRecharge = {
  id: string;
  tenantId: string;
  pricePaid: number;
  purchasedAt: string;
  approvedAt?: string;
  status: "paid" | "pending" | "rejected";
};

export type FinancePlanCatalogItem = { id: string; name: string; price: string };

export type FinanceSubscriptionStatus =
  | "all" | "active" | "paying" | "trial" | "overdue" | "suspended" | "canceled";

export type FinanceFilters = {
  from: Date;
  to: Date;
  planId?: string;
  subscriptionStatus?: FinanceSubscriptionStatus;
  tenantId?: string;
};

export type ClientClass = {
  canceled: boolean;
  suspended: boolean;
  trial: boolean;
  active: boolean;
  paying: boolean;
  overdue: boolean;
  /** Mensalidade contratada (R$). 0 quando não há plano pago. */
  monthly: number;
  /** Cobrança em aberto (plano pago, não paga). */
  open: boolean;
  dueDate: string;
  daysOverdue: number;
};

export const TRIAL_PLAN_ID = "crm-trial";
const DAY = 86400000;

/** "1.234,56" | "59,90" | 59.9 -> number */
export function parseBRL(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  // "YYYY-MM-DD" é tratado como data local (evita deslocamento de fuso)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inRange(d: Date | null, from: Date, to: Date): boolean {
  return !!d && d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
}

export function classifyClient(c: FinanceClient, now: Date): ClientClass {
  const status = (c.status || "").toLowerCase();
  const canceled = status === "canceled" || status === "cancelled";
  const suspended = !canceled && (status !== "active" || !!c.suspension?.isSuspended || !!c.plan?.isSuspended);
  const trial = (c.plan?.isTrial === true || c.plan?.planId === TRIAL_PLAN_ID) && c.plan?.trialStatus !== "converted";
  const monthly = trial ? 0 : parseBRL(c.plan?.contractedPlan?.price ?? c.plan?.price);
  const active = !canceled && !suspended;
  const paying = active && !trial && monthly > 0;
  const dueDate = c.plan?.dueDate || "";
  const due = parseDate(dueDate);
  const today = startOfDay(now);
  const unpaid = c.plan?.status !== "paid";
  const open = !canceled && !trial && monthly > 0 && unpaid;
  const pastDue = !!due && due.getTime() < today.getTime();
  const overdue = open && (pastDue || c.plan?.isOverdue === true);
  const daysOverdue = overdue && due ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / DAY)) : 0;
  return { canceled, suspended, trial, active, paying, overdue, monthly, open, dueDate, daysOverdue };
}

/** Pagamentos confirmados e deduplicados (por id e por ciclo de cobrança). */
export function confirmedPayments(c: FinanceClient): Array<FinancePayment & { amountNum: number; paidDate: Date }> {
  const seenId = new Set<string>();
  const seenCycle = new Set<string>();
  const out: Array<FinancePayment & { amountNum: number; paidDate: Date }> = [];
  for (const p of c.paymentHistory ?? []) {
    if (p.status !== "paid") continue;
    const paidDate = parseDate(p.paidAt);
    if (!paidDate) continue;
    if (p.id) { if (seenId.has(p.id)) continue; seenId.add(p.id); }
    if (p.billingCycleKey) { if (seenCycle.has(p.billingCycleKey)) continue; seenCycle.add(p.billingCycleKey); }
    out.push({ ...p, amountNum: parseBRL(p.amount), paidDate });
  }
  return out.sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime());
}

/** Pagamentos "paid" repetidos para o mesmo ciclo (possível duplicidade). */
export function countDuplicatePayments(c: FinanceClient): number {
  const seen = new Map<string, number>();
  for (const p of c.paymentHistory ?? []) {
    if (p.status !== "paid" || !p.billingCycleKey) continue;
    seen.set(p.billingCycleKey, (seen.get(p.billingCycleKey) || 0) + 1);
  }
  let dup = 0;
  for (const n of seen.values()) if (n > 1) dup += n - 1;
  return dup;
}

export type PeriodPreset =
  | "today" | "7d" | "month" | "prev_month" | "3m" | "6m" | "12m" | "custom";

export function resolvePeriod(preset: PeriodPreset, now: Date, custom?: { from?: string; to?: string }): { from: Date; to: Date } {
  const today = startOfDay(now);
  const endOfToday = new Date(today.getTime() + DAY - 1);
  switch (preset) {
    case "today": return { from: today, to: endOfToday };
    case "7d": return { from: new Date(today.getTime() - 6 * DAY), to: endOfToday };
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfToday };
    case "prev_month": return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    };
    case "3m": return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: endOfToday };
    case "6m": return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: endOfToday };
    case "12m": return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to: endOfToday };
    case "custom": {
      const f = parseDate(custom?.from) ?? new Date(now.getFullYear(), now.getMonth(), 1);
      const t = parseDate(custom?.to) ?? today;
      return { from: f, to: new Date(startOfDay(t).getTime() + DAY - 1) };
    }
  }
}

function matchesStatus(cls: ClientClass, s: FinanceSubscriptionStatus | undefined): boolean {
  switch (s) {
    case "active": return cls.active;
    case "paying": return cls.paying;
    case "trial": return cls.trial && !cls.canceled;
    case "overdue": return cls.overdue;
    case "suspended": return cls.suspended;
    case "canceled": return cls.canceled;
    default: return true;
  }
}

export type PlanRow = {
  planId: string;
  name: string;
  catalogPrice: string | null;
  companies: number;
  active: number;
  paying: number;
  suspended: number;
  canceled: number;
  /** Receita recorrente CONTRATADA (soma dos contratos, não preço de catálogo × qtd). */
  mrr: number;
  percent: number;
  newInPeriod: number;
};

export type ExpectedCharge = { tenantId: string; name: string; dueDate: string; amount: number };

export type FinanceMetrics = {
  generatedAt: string;
  totals: {
    companies: number;
    active: number;
    paying: number;
    trial: number;
    overdue: number;
    suspended: number;
    canceled: number;
    newInPeriod: number;
    renewedInPeriod: number;
    /** Não há registro de pedidos de cancelamento no sistema atual. */
    cancellationRequests: number | null;
  };
  money: {
    receivedInPeriod: number;
    mrr: number;
    receivable: number;
    overdueAmount: number;
    dueNext7Days: number;
    dueNext7DaysCount: number;
    /** 1º pagamento confirmado da empresa dentro do período. */
    newSubscriptionRevenue: number;
    recurringRevenue: number;
    /** Sem tipo de pagamento "upgrade" registrado hoje. */
    upgradeRevenue: number | null;
    extrasRevenue: number | null;
    rechargeRevenue: number;
    averageTicket: number | null;
    /** Despesas ainda não cadastradas (Fase 3). */
    expenses: number | null;
    operatingProfit: number | null;
    operatingMargin: number | null;
    /** Custo de inferencia de IA no periodo (BRL). null = ainda sem medicao. */
    aiCost: number | null;
    /** Receita realizada menos despesas E custo de IA. */
    netProfit: number | null;
    netMargin: number | null;
    /** Custo de IA por loja no periodo, do maior para o menor. */
    aiCostByTenant: Array<{ tenantId: string; name: string; costBrl: number; responses: number; revenue: number; margin: number | null }>;
  };
  forecast: { d30: number; d60: number; d90: number };
  plans: PlanRow[];
  alerts: {
    duplicatePayments: number;
    pendingRecharges: number;
    trialsEndingSoon: number;
    overdueClients: Array<{ id: string; name: string; amount: number; daysOverdue: number }>;
    dueSoon: ExpectedCharge[];
  };
};

function addMonthsKeepingDay(d: Date, months: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

/** Custo real de inferencia de IA por loja, somado a partir de crm_ai_usage_events. */
export type FinanceAiCost = { tenantId: string; costBrl: number; responses: number };

export function computeFinanceMetrics(input: {
  clients: FinanceClient[];
  recharges?: FinanceRecharge[];
  expenses?: FinanceExpense[];
  planCatalog: FinancePlanCatalogItem[];
  filters: FinanceFilters;
  /** Custo de IA medido no periodo. Quando ausente, a margem fica nula (nao chutamos). */
  aiCosts?: FinanceAiCost[];
  /** Cotacao usada para converter o custo (que nasce em USD) para BRL. */
  usdBrlRate?: number;
  now?: Date;
}): FinanceMetrics {
  const now = input.now ?? new Date();
  const today = startOfDay(now);
  const { from, to } = input.filters;
  const base = input.clients.filter(c => !c.isMasterOwnTenant);

  const classified = base.map(c => ({ c, cls: classifyClient(c, now) }));
  const scoped = classified.filter(({ c, cls }) => {
    if (input.filters.tenantId && c.id !== input.filters.tenantId) return false;
    if (input.filters.planId && (c.plan?.planId || "") !== input.filters.planId) return false;
    return matchesStatus(cls, input.filters.subscriptionStatus);
  });

  const totals = {
    companies: scoped.length,
    active: scoped.filter(x => x.cls.active).length,
    paying: scoped.filter(x => x.cls.paying).length,
    trial: scoped.filter(x => x.cls.trial && !x.cls.canceled).length,
    overdue: scoped.filter(x => x.cls.overdue).length,
    suspended: scoped.filter(x => x.cls.suspended).length,
    canceled: scoped.filter(x => x.cls.canceled).length,
    newInPeriod: scoped.filter(x => inRange(parseDate(x.c.created_at), from, to)).length,
    renewedInPeriod: 0,
    cancellationRequests: null as number | null
  };

  let receivedInPeriod = 0;
  let newSubscriptionRevenue = 0;
  let recurringRevenue = 0;
  for (const { c } of scoped) {
    const pays = confirmedPayments(c);
    pays.forEach((p, idx) => {
      if (!inRange(p.paidDate, from, to)) return;
      receivedInPeriod += p.amountNum;
      if (idx === 0) newSubscriptionRevenue += p.amountNum;
      else { recurringRevenue += p.amountNum; }
    });
    // Renovou = teve pagamento confirmado no período e já tinha pago antes dele
    if (pays.some((p, idx) => idx > 0 && inRange(p.paidDate, from, to))) totals.renewedInPeriod += 1;
  }

  const scopedIds = new Set(scoped.map(x => x.c.id));
  const recharges = (input.recharges ?? []).filter(r => r.status === "paid" && scopedIds.has(r.tenantId));
  const rechargeRevenue = recharges
    .filter(r => inRange(parseDate(r.approvedAt || r.purchasedAt), from, to))
    .reduce((s, r) => s + (Number(r.pricePaid) || 0), 0);

  const payingRows = scoped.filter(x => x.cls.paying);
  const mrr = payingRows.reduce((s, x) => s + x.cls.monthly, 0);
  const openRows = scoped.filter(x => x.cls.open && !x.cls.suspended);
  const receivable = openRows.reduce((s, x) => s + x.cls.monthly, 0);
  const overdueRows = scoped.filter(x => x.cls.overdue);
  const overdueAmount = overdueRows.reduce((s, x) => s + x.cls.monthly, 0);

  const in7 = new Date(today.getTime() + 7 * DAY);
  const dueSoonRows = openRows.filter(x => {
    const d = parseDate(x.cls.dueDate);
    return !!d && d.getTime() >= today.getTime() && d.getTime() <= in7.getTime() + DAY - 1;
  });
  const dueSoon: ExpectedCharge[] = dueSoonRows
    .map(x => ({ tenantId: x.c.id, name: x.c.name, dueDate: x.cls.dueDate, amount: x.cls.monthly }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Previsão: cobranças esperadas pelos contratos (ciclo mensal a partir do vencimento).
  // Atrasadas entram no primeiro intervalo. Não é dinheiro garantido.
  const horizon = (days: number) => {
    const end = new Date(today.getTime() + days * DAY);
    let total = 0;
    for (const x of payingRows) {
      const due = parseDate(x.cls.dueDate);
      if (!due) continue;
      let cursor = due;
      // Cobrança já paga neste ciclo: a próxima vem um mês depois
      if (!x.cls.open) cursor = addMonthsKeepingDay(cursor, 1);
      let guard = 0;
      while (cursor.getTime() <= end.getTime() && guard++ < 36) {
        total += x.cls.monthly;
        cursor = addMonthsKeepingDay(cursor, 1);
      }
    }
    return total;
  };
  const forecast = { d30: horizon(30), d60: horizon(60), d90: horizon(90) };

  // Distribuição por plano (todas as lojas do filtro de empresa; plano/status não reduzem a linha)
  const planScope = classified.filter(({ c }) => !input.filters.tenantId || c.id === input.filters.tenantId);
  const catalog = [...input.planCatalog];
  if (!catalog.some(p => p.id === TRIAL_PLAN_ID)) catalog.unshift({ id: TRIAL_PLAN_ID, name: "Teste Grátis", price: "0,00" });
  const rowsById = new Map<string, PlanRow>();
  const ensureRow = (planId: string, name: string, price: string | null) => {
    if (!rowsById.has(planId)) {
      rowsById.set(planId, { planId, name, catalogPrice: price, companies: 0, active: 0, paying: 0, suspended: 0, canceled: 0, mrr: 0, percent: 0, newInPeriod: 0 });
    }
    return rowsById.get(planId)!;
  };
  for (const p of catalog) ensureRow(p.id, p.name, p.price);
  for (const { c, cls } of planScope) {
    const key = c.plan?.planId || "__undefined__";
    const row = ensureRow(key, key === "__undefined__" ? "Plano não definido" : (c.plan?.name || key), null);
    row.companies += 1;
    if (cls.active) row.active += 1;
    if (cls.paying) { row.paying += 1; row.mrr += cls.monthly; }
    if (cls.suspended) row.suspended += 1;
    if (cls.canceled) row.canceled += 1;
    if (inRange(parseDate(c.created_at), from, to)) row.newInPeriod += 1;
  }
  const planTotal = planScope.length;
  const plans = Array.from(rowsById.values())
    .filter(r => r.planId !== "__undefined__" || r.companies > 0)
    .map(r => ({ ...r, percent: planTotal ? (r.companies / planTotal) * 100 : 0 }));

  const trialsEndingSoon = scoped.filter(x => x.cls.trial && !x.cls.canceled &&
    (x.c.plan?.trialStatus === "expiring_soon")).length;

  // Despesas registradas e pagas no período
  const paidExpensesInPeriod = (input.expenses ?? []).filter(e => {
    if (e.status !== "paid") return false;
    const pDate = parseDate(e.paymentDate || e.dueDate);
    return inRange(pDate, from, to);
  });
  const totalExpenses = input.expenses !== undefined
    ? paidExpensesInPeriod.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    : null;

  const totalRealizedRevenue = receivedInPeriod + rechargeRevenue;
  const operatingProfit = totalExpenses !== null ? totalRealizedRevenue - totalExpenses : null;
  const operatingMargin = totalExpenses !== null && totalRealizedRevenue > 0
    ? (operatingProfit! / totalRealizedRevenue) * 100
    : null;

  // Custo real de IA: entra no lucro. Sem medicao, a margem liquida fica nula
  // em vez de um numero otimista.
  const aiCostRows = (input.aiCosts ?? []).filter(r => scopedIds.has(r.tenantId));
  const aiCost = input.aiCosts !== undefined
    ? aiCostRows.reduce((sum, r) => sum + (Number(r.costBrl) || 0), 0)
    : null;
  const netProfit = aiCost !== null && operatingProfit !== null ? operatingProfit - aiCost : null;
  const netMargin = netProfit !== null && totalRealizedRevenue > 0
    ? (netProfit / totalRealizedRevenue) * 100
    : null;

  const revenueByTenant = new Map<string, number>();
  for (const { c } of scoped) {
    const paid = confirmedPayments(c).filter(p => inRange(p.paidDate, from, to));
    revenueByTenant.set(c.id, paid.reduce((sum, p) => sum + p.amountNum, 0));
  }
  for (const r of recharges) {
    if (!inRange(parseDate(r.approvedAt || r.purchasedAt), from, to)) continue;
    revenueByTenant.set(r.tenantId, (revenueByTenant.get(r.tenantId) ?? 0) + (Number(r.pricePaid) || 0));
  }
  const aiCostByTenant = aiCostRows
    .map(r => {
      const revenue = revenueByTenant.get(r.tenantId) ?? 0;
      return {
        tenantId: r.tenantId,
        name: scoped.find(x => x.c.id === r.tenantId)?.c.name ?? r.tenantId,
        costBrl: Number(r.costBrl) || 0,
        responses: r.responses,
        revenue,
        margin: revenue > 0 ? revenue - (Number(r.costBrl) || 0) : null
      };
    })
    .sort((a, b) => b.costBrl - a.costBrl);

  return {
    generatedAt: now.toISOString(),
    totals,
    money: {
      receivedInPeriod,
      mrr,
      receivable,
      overdueAmount,
      dueNext7Days: dueSoon.reduce((s, x) => s + x.amount, 0),
      dueNext7DaysCount: dueSoon.length,
      newSubscriptionRevenue,
      recurringRevenue,
      upgradeRevenue: null,
      extrasRevenue: null,
      rechargeRevenue,
      averageTicket: payingRows.length ? mrr / payingRows.length : null,
      expenses: totalExpenses,
      operatingProfit,
      operatingMargin,
      aiCost,
      netProfit,
      netMargin,
      aiCostByTenant
    },
    forecast,
    plans,
    alerts: {
      duplicatePayments: scoped.reduce((s, x) => s + countDuplicatePayments(x.c), 0),
      pendingRecharges: (input.recharges ?? []).filter(r => r.status === "pending" && scopedIds.has(r.tenantId)).length,
      trialsEndingSoon,
      overdueClients: overdueRows
        .map(x => ({ id: x.c.id, name: x.c.name, amount: x.cls.monthly, daysOverdue: x.cls.daysOverdue }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue),
      dueSoon
    }
  };
}
