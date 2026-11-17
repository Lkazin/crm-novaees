export function billingQuote(price: string, cycle: "monthly" | "annual") {
  const cents = Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("invalid_billing_price");
  const monthly = cycle === "annual" ? Math.round(cents * 0.8) : cents;
  return { billingCycle: cycle, billingAmountCents: monthly * (cycle === "annual" ? 12 : 1),
    monthlyEquivalentCents: monthly, price: (monthly / 100).toFixed(2).replace(".", ",") };
}

export function annualPeriodEnd(start: string): string {
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_billing_date");
  const year = date.getUTCFullYear() + 1, month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function paidPeriodUpdate(cycle: unknown, dueDate: string, alreadyPaid: boolean, now = new Date()): { dueDate?: string; paidThrough?: string } {
  if (cycle === "annual") {
    if (alreadyPaid) return {};
    const end = annualPeriodEnd(now.toISOString());
    return { dueDate: end, paidThrough: end };
  }
  return new Date(dueDate) < now
    ? { dueDate: new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10) }
    : {};
}
