import assert from "node:assert/strict";
import test from "node:test";
import { billingQuote, annualPeriodEnd } from "./billing";
test("annual quotes use exact cents and keep monthly quota separate",()=>{
  for (const [price,monthly,total] of [["79,80",6384,76608],["139,90",11192,134304],["298,00",23840,286080]] as const) {
    const q=billingQuote(price,"annual");
    assert.equal(q.monthlyEquivalentCents,monthly);assert.equal(q.billingAmountCents,total);
  }
  assert.equal(billingQuote("79,80","monthly").billingAmountCents,7980);
  assert.throws(()=>billingQuote("invalid","annual"),/invalid_billing_price/);
});
test("annual expiry clamps leap days and advances by twelve calendar months",()=>{
  assert.equal(annualPeriodEnd("2028-02-29T12:00:00Z"),"2029-02-28");
  assert.equal(annualPeriodEnd("2026-11-16T12:00:00Z"),"2027-11-16");
});

 test("payment confirmation grants a year, preserves repeats and renews expired periods", async () => {
 const {paidPeriodUpdate}=await import("./billing");
 const now=new Date("2026-11-17T15:00:00Z");
 assert.deepEqual(paidPeriodUpdate("annual","2026-11-17",false,now),{dueDate:"2027-11-17",paidThrough:"2027-11-17"});
 assert.deepEqual(paidPeriodUpdate("annual","2027-11-17",true,now),{});
 assert.deepEqual(paidPeriodUpdate("annual","2025-11-17",false,now),{dueDate:"2027-11-17",paidThrough:"2027-11-17"});
 assert.deepEqual(paidPeriodUpdate("monthly","2026-11-17",false,now),{dueDate:"2026-12-17"});
 assert.deepEqual(paidPeriodUpdate("monthly","2026-12-17",false,now),{});
 });
