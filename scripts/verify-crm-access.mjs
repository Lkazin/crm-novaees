// Explicitly opt in to creating two clearly identified test companies.
// Uses the local validation instance; never sends WhatsApp or calls an AI model.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.CRM_VALIDATION_BASE_URL || "http://127.0.0.1:3050";
if (!/^http:\/\/(127\.0\.0\.1|localhost):3050$/.test(base)) throw new Error("validation_instance_required");
const checks = [];
const check = (name, actual, expected) => { assert.equal(actual, expected, name); checks.push({name, result: "passed"}); console.log("PASS " + name); };
async function call(path, {method = "GET", body, cookie = ""} = {}) {
  const response = await fetch(base + path, {
    method, redirect: "manual", headers: {"Content-Type": "application/json", Origin: base, ...(cookie ? {Cookie: cookie} : {})},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  const cookies = response.headers.getSetCookie().filter(c => !c.includes("Max-Age=0")).map(c => c.split(";")[0]).join("; ");
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return {status: response.status, json, cookie: cookies, location: response.headers.get("location")};
}
const login = await call("/api/crm/auth/session", {method: "POST", body: {scope: "master", password: process.env.CRM_MASTER_PASSWORD}});
check("Master login", login.status, 200);
check("Master destination", login.json.redirectTo, "/admin");
const master = login.cookie;
check("Master session is not a client session", (await call("/api/crm/auth/session?scope=client", {cookie: master})).json.authenticated, false);
const catalogResult = await call("/api/crm/admin/plans", {cookie: master});
check("Published catalog", catalogResult.status, 200);
const plans = catalogResult.json.plans;
assert.ok(Array.isArray(plans), "missing catalog");
for (const [id, limit] of [["crm-trial",1],["crm-start",1],["crm-business",3],["crm-premium",5]]) {
  const plan = plans.find(p => p.id === id);
  assert.ok(plan, "missing " + id);
  check(id + " WhatsApp limit", plan.maxWhatsappConnections, limit);
  check(id + " operator limit", plan.maxOperators, limit);
}
check("Trial is free", plans.find(p => p.id === "crm-trial").price, "0,00");
const clients = await call("/api/crm/admin/clients", {cookie: master});
check("Master client list", clients.status, 200);
// Only output the diagnosis relevant to the reported company, no emails or contacts.
const affected = clients.json.clients.filter(c => /bilac|bella/i.test(c.name)).map(c => ({name: c.name, plan: c.plan?.name, planId: c.plan?.planId, maxWhatsappConnections: c.plan?.maxWhatsappConnections, suspended: c.plan?.isSuspended}));
console.log("Reported-company diagnosis " + JSON.stringify(affected));

const fixtures = [];
if (process.argv.includes("--create-fixtures")) {
  const run = Date.now().toString(36);
  for (const [label, planId] of [["start", "crm-start"], ["trial", "crm-trial"]]) {
    const storeName = `TESTE CODEX ${label} ${run}`;
    const email = `codex.${label}.${run}@example.invalid`;
    const password = randomBytes(24).toString("base64url");
    const created = await call("/api/crm/admin/clients", {method: "POST", cookie: master, body: {storeName, email, password, planId, paymentStatus: "paid", autoBlock: false}});
    check("Create " + label + " company", created.status, 201);
    const tenantId = created.json.tenantId;
    assert.ok(tenantId, "missing tenant id");
    // Keep only fixture identifiers in the report, never passwords/session tokens.
    fixtures.push({id: tenantId, name: storeName, label});
    const signed = await call("/api/crm/auth/session", {method: "POST", body: {email, password, scope: "client"}});
    check(label + " client login", signed.status, 200);
    check(label + " client destination", signed.json.redirectTo, "/cliente");
    const cookie = signed.cookie;
    check(label + " cannot become Master", (await call("/api/crm/auth/session?scope=master", {cookie})).json.authenticated, false);
    check(label + " cannot read Master clients", (await call("/api/crm/admin/clients", {cookie})).status, 401);
    const load = () => call("/api/crm/operator/data?tenant=" + tenantId, {cookie});
    const data = await load();
    check(label + " client workspace data", data.status, 200);
    check(label + " correct plan", data.json.plan.planId, planId);
    check(label + " catalog available", Array.isArray(data.json.commercialPlans), true);
    const foreign = clients.json.clients.find(c => c.id !== tenantId);
    check(label + " cannot read another tenant", (await call("/api/crm/operator/data?tenant=" + foreign.id, {cookie})).status, 403);
    check(label + " advanced reports locked", data.json.featureStates.advanced_reports.state, "locked_by_plan");
    if (label === "trial") {
      check("Trial limit is 100", data.json.plan.quotaLimit, 100);
      check("Trial report period", data.json.plan.quotaPeriod, "trial");
      continue;
    }
    const business = plans.find(p => p.id === "crm-business");
    const requestUpgrade = targetPlanId => call("/api/crm/operator/features", {method: "POST", cookie, body: {tenantId, action: "request_upgrade", targetPlanId}});
    const request = await requestUpgrade(business.id);
    check("Request upgrade", request.status, 200);
    check("Request does not change Start", (await load()).json.plan.planId, "crm-start");
    const repeated = await requestUpgrade(business.id);
    check("Duplicate request is same pending request", repeated.json.upgradeRequest.id, request.json.upgradeRequest.id);
    const reject = await call("/api/crm/admin/clients", {method: "PATCH", cookie: master, body: {tenantId, action: "resolve_upgrade_request", requestId: request.json.upgradeRequest.id, decision: "rejected"}});
    check("Master rejects upgrade", reject.status, 200);
    check("Rejected stays Start", (await load()).json.plan.planId, "crm-start");
    const request2 = await requestUpgrade(business.id);
    const approve = await call("/api/crm/admin/clients", {method: "PATCH", cookie: master, body: {tenantId, action: "resolve_upgrade_request", requestId: request2.json.upgradeRequest.id, decision: "approved"}});
    check("Master approves upgrade", approve.status, 200);
    const businessData = await load();
    check("Approved becomes Business", businessData.json.plan.planId, "crm-business");
    check("Business limit is three", businessData.json.plan.maxWhatsappConnections, 3);
    check("Business premium reports stay locked", businessData.json.featureStates.advanced_reports.state, "locked_by_plan");
    const premiumRequest = await requestUpgrade("crm-premium");
    check("Request Premium", premiumRequest.status, 200);
    check("Premium still locked before approval", (await load()).json.featureStates.advanced_reports.state, "locked_by_plan");
    const premiumApproved = await call("/api/crm/admin/clients", {method: "PATCH", cookie: master, body: {tenantId, action: "resolve_upgrade_request", requestId: premiumRequest.json.upgradeRequest.id, decision: "approved"}});
    check("Master approves Premium", premiumApproved.status, 200);
    const premiumData = await load();
    check("Premium limit is five", premiumData.json.plan.maxWhatsappConnections, 5);
    check("Premium reports unlocked", premiumData.json.featureStates.advanced_reports.state, "allowed");
    const downgrade = await call("/api/crm/admin/clients", {method: "PATCH", cookie: master, body: {tenantId, action: "update_plan", planId: "crm-start"}});
    check("Master returns fixture to Start", downgrade.status, 200);
    check("Downgrade locks premium reports", (await load()).json.featureStates.advanced_reports.state, "locked_by_plan");
  }
}
await mkdir("test-results", {recursive: true});
await writeFile("test-results/crm-live-access.json", JSON.stringify({base, checkedAt: new Date().toISOString(), checks, affected, fixtures}, null, 2));
console.log(`${checks.length} checks passed. ${fixtures.length} test companies retained; no WhatsApp sent.`);
