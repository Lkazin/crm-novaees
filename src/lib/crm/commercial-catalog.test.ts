import assert from "node:assert/strict";
import test from "node:test";
import type Redis from "ioredis";
import {
  ALL_DEFAULT_PLANS, LEGACY_CONTRACT_PLANS, getMasterPlans,
  getEffectiveTenantPlan, selectPublishedPlan, buildFeatureGovernanceMap,
  saveMasterPlan
} from "./plans";
import { buildTenantWhatsappSlots } from "./whatsapp-slots";

function cache(plans = [...ALL_DEFAULT_PLANS, ...LEGACY_CONTRACT_PLANS]) {
  const values = new Map([["crm:master:plans", JSON.stringify(plans)]]);
  return { status:"ready", get:async(key:string)=>values.get(key) ?? null,
    set:async(key:string,value:string)=>{ values.set(key,value); return "OK"; },
    connect:async()=>{},disconnect:()=>{} } as unknown as Redis;
}

test("published catalog replaces all old offers without changing customer contracts", async () => {
  const redis = cache();
  const catalog = await getMasterPlans(redis);
  assert.deepEqual(catalog.map(p=>[p.id,p.price,p.quotaLimit,p.maxWhatsappConnections,p.maxOperators]), [
    ["crm-trial","0,00",50,1,1], ["crm-essential","79,80",300,1,2],
    ["crm-professional","139,90",1000,3,10], ["crm-enterprise","298,00",1400,5,20]
  ]);
  assert.equal(selectPublishedPlan(catalog,"crm-premium"),undefined);
  assert.equal(selectPublishedPlan(catalog,"crm-start"),undefined);
  assert.equal(selectPublishedPlan(catalog,"crm-business"),undefined);
  for (const old of LEGACY_CONTRACT_PLANS) {
    const settings = JSON.stringify({ plan: { planId:old.id, name:old.name,
      dueDate:"2099-12-01", status:"paid", autoBlock:false } });
    const plan = await getEffectiveTenantPlan(`old-${old.id}`,settings,redis);
    assert.equal(plan.planId,old.id);
    assert.equal(plan.price,old.price);
    assert.equal(plan.quotaLimit,old.quotaLimit);
    assert.equal(plan.maxOperators,old.maxOperators);
  }
});

test("new contracts enforce the advertised access, channel and resource limits", async () => {
  for (const offer of ALL_DEFAULT_PLANS.filter(p=>p.id!=="crm-trial")) {
    const settings = JSON.stringify({plan:{planId:offer.id,status:"paid",dueDate:"2099-12-01",autoBlock:false}});
    const plan = await getEffectiveTenantPlan(`new-${offer.id}`,settings,cache());
    assert.equal(plan.maxOperators,offer.maxOperators);
    assert.equal(plan.quotaLimit,offer.quotaLimit);
    assert.equal(buildTenantWhatsappSlots("Example",[],plan).filter(s=>s.unlocked).length,offer.maxWhatsappConnections);
    assert.equal(plan.allowedFeatures.includes("human_handoff"),true);
    assert.equal(plan.allowedFeatures.includes("commercial_tags"),offer.id!=="crm-essential");
    assert.equal(plan.allowedFeatures.includes("advanced_reports"),offer.id!=="crm-essential");
  }
  const states = buildFeatureGovernanceMap([],false);
  assert.equal(states.commercial_tags.minPlanName,"Profissional");
});

test("free trial uses a single access, one WhatsApp and a total quota of 50", async () => {
  const now = new Date().toISOString();
  const plan = await getEffectiveTenantPlan("new-trial",JSON.stringify({plan:{planId:"crm-trial",isTrial:true,trialStartedAt:now}}),cache());
  assert.equal(plan.maxOperators,1);
  assert.equal(plan.maxWhatsappConnections,1);
  assert.equal(plan.quotaLimit,50);
});

test("operator cap validation supports 20 and rejects 21", async () => {
  await assert.rejects(()=>saveMasterPlan({id:"custom",name:"Custom",maxOperators:21},"draft","new_clients","test",cache()),/invalid_plan_limits/);
});
