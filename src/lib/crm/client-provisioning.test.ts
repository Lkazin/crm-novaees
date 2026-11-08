import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import { ALL_DEFAULT_PLANS, DEFAULT_PLANS, TRIAL_PLAN, selectPublishedPlan } from "./plans";

const TENANT="11111111-1111-4111-8111-111111111111";
const USER="22222222-2222-4222-8222-222222222222";
function fixture(failPath="") {
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];
  const dependencies:Record<string,unknown>={
    "next/server":{NextRequest},
    "@/lib/crm/supabase-server":{privateJson:(body:unknown,status=200)=>Response.json(body,{status}),isAllowedOrigin:()=>true},
    "@/lib/crm/tenant-access":{TENANT_UUID:/^[0-9a-f-]{36}$/i,patchCrmConfig:async()=>{throw Error("Unexpected patch");}},
    "@/lib/crm/master-auth":{verifyMasterRequest:async()=>({authorized:true,actor:"fixture-master"})},
    "@/lib/crm/plans":{getMasterPlans:async()=>ALL_DEFAULT_PLANS,selectPublishedPlan,DEFAULT_PLANS,TRIAL_PLAN,
      checkTrialEligibility:async()=>({eligible:true}),recordTrialRegistration:async()=>undefined,
      syncTenantUsageLimits:async()=>undefined},
    "@/lib/crm/whatsapp-slots":{},
  };
  const fetchFixture=async(input:string|URL,init?:RequestInit)=>{
    const u=new URL(String(input));assert.equal(u.hostname,"fixture.supabase.co");
    const method=init?.method;assert.ok(method==="POST"||method==="PATCH");const body=JSON.parse(String(init?.body));calls.push({path:u.pathname,body});
    if(method==="PATCH"&&u.pathname==="/rest/v1/crm_tenants")return Response.json([{id:TENANT,status:"active"}]);
    if(u.pathname===failPath)return Response.json({error:"fixture failure"},{status:500});
    if(u.pathname==="/rest/v1/crm_tenants")return Response.json([{id:TENANT}]);
    if(u.pathname==="/auth/v1/admin/users")return Response.json({id:USER});
    if(["/rest/v1/crm_tenant_memberships","/rest/v1/crm_tenant_settings","/rest/v1/crm_agents","/rest/v1/crm_channels"].includes(u.pathname))return new Response(null,{status:201});
    throw Error("Unexpected fetch "+u.pathname);
  };
  const filename=resolve("src/app/api/crm/admin/clients/route.ts");
  const code=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const fixtureModule={exports:{} as Record<string,(req:NextRequest)=>Promise<Response>>};
  const context=vm.createContext({module:fixtureModule,exports:fixtureModule.exports,Response,URL,AbortSignal,console,fetch:fetchFixture,
    process:{env:{CRM_SUPABASE_URL:"https://fixture.supabase.co",CRM_SUPABASE_SERVICE_ROLE_KEY:"fixture-not-a-real-key"}},
    require:(id:string)=>{assert.ok(Object.hasOwn(dependencies,id),"Unexpected module "+id);return dependencies[id];}});
  new vm.Script(code,{filename}).runInContext(context);
  return {calls,post:(extra:Record<string,unknown>)=>fixtureModule.exports.POST(new NextRequest("http://fixture.invalid/api/crm/admin/clients",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeName:"Fixture Store",email:"fixture@example.invalid",password:"fixture-password",...extra})}))};
}

test("invalid client plan ID is rejected before creating a tenant or account",async()=>{
 const f=fixture();const r=await f.post({planId:"crm-plus",planName:"CRM Business"});assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test("Premium client receives exactly the selected published plan snapshot",async()=>{
 const f=fixture();const r=await f.post({planId:"crm-premium"});assert.equal(r.status,201);
 const result=await r.json();assert.equal(result.plan.name,"CRM Premium");assert.equal(result.plan.maxWhatsappConnections,5);
 assert.deepEqual(result.plan.contractedPlan.features,DEFAULT_PLANS.find(p=>p.id==="crm-premium")!.features);
 assert.equal(result.plan.contractedPlan.features.includes("advanced_reports"),true);
 const settings=f.calls.find(c=>c.path==="/rest/v1/crm_tenant_settings")!;assert.equal(settings.body.ai_sending_enabled,false);
});
test("free trial is created as a trial with a real expiry and zero price",async()=>{
 const f=fixture();const r=await f.post({planId:"crm-trial"});assert.equal(r.status,201);
 const result=await r.json();assert.equal(result.plan.price,"0,00");assert.equal(result.plan.isTrial,true);assert.equal(result.plan.quotaLimit,50);
 assert.equal(result.plan.maxWhatsappConnections,3);assert.ok(Date.parse(result.plan.trialExpiresAt)>Date.parse(result.plan.trialStartedAt));
});
for(const path of ["/rest/v1/crm_tenant_memberships","/rest/v1/crm_tenant_settings","/rest/v1/crm_agents","/rest/v1/crm_channels"]){
 test("provisioning failure in "+path+" never reports a working client",async()=>{
  const f=fixture(path);const r=await f.post({planId:"crm-premium"});assert.equal(r.status,503);assert.equal((await r.json()).created,undefined);
  assert.equal(f.calls.at(-1)?.path,path);assert.equal(f.calls[0].body.status,"suspended");
 });
}
