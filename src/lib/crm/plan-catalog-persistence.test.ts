import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { isDeepStrictEqual } from "node:util";
import ts from "typescript";
import { DEFAULT_PLANS } from "./plans";
const OWNER="11111111-1111-4111-8111-111111111111";
function fixture(failedWrite=false,unconfirmed=false){
 const values=new Map([["crm:master:plans",JSON.stringify(DEFAULT_PLANS)]]);
 const draftWrites:string[]=[];const calls:Array<{path:string;body:Record<string,unknown>}>=[];
 const dependencies:Record<string,unknown>={"server-only":{},"node:util":{isDeepStrictEqual},
  "./master-own-tenant":{resolveMasterOwnTenant:async()=>({id:OWNER})},
  "./whatsapp-slots":{},
  ioredis:class{status="ready";on(){}disconnect(){}get=async(k:string)=>values.get(k)||null;set=async(k:string,v:string)=>{values.set(k,v);};hset=async(k:string)=>{draftWrites.push(k);};hdel=async()=>1;lpush=async()=>1;ltrim=async()=>"OK";},
 };
 const fetchFixture=async(input:string|URL,init?:RequestInit)=>{
  const u=new URL(String(input));assert.equal(u.hostname,"fixture.supabase.co");
  const body=init?.body?JSON.parse(String(init.body)):{};calls.push({path:u.pathname,body});
  if(u.pathname.endsWith("/crm_tenant_settings"))return Response.json([{business_description:JSON.stringify({plan:{planId:"crm-premium"},usageCounters:{trialUsed:7}})}]);
  if(u.pathname.endsWith("/rpc/crm_patch_tenant_config"))return failedWrite?Response.json({},{status:500}):Response.json(unconfirmed?{}:body.p_patch);
  if(u.pathname.endsWith("/crm_audit_events"))return new Response(null,{status:201});
  throw Error("Unexpected fetch "+u.pathname);
 };
 const filename=resolve("src/lib/crm/plans.ts");
 const code=ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const fixtureModule={exports:{} as {saveMasterPlan:(...args:unknown[])=>Promise<unknown>}};
 const context=vm.createContext({module:fixtureModule,exports:fixtureModule.exports,Response,URL,AbortSignal,Date,Intl,console,fetch:fetchFixture,
  process:{env:{CRM_SUPABASE_URL:"https://fixture.supabase.co",CRM_SUPABASE_SERVICE_ROLE_KEY:"fixture-no-real-secret"}},
  require:(id:string)=>{assert.ok(Object.hasOwn(dependencies,id),"Unexpected dependency "+id);return dependencies[id];}});
 new vm.Script(code,{filename}).runInContext(context);
 return {calls,draftWrites,save:()=>fixtureModule.exports.saveMasterPlan(DEFAULT_PLANS[0],"draft","new_clients","fixture-master")};
}
test("catalog draft persistence failure cannot publish a cache-only success",async()=>{
 const f=fixture(true);await assert.rejects(f.save(),/plan_catalog_write_failed/);assert.equal(f.draftWrites.length,0);
});
test("catalog draft writes only its owned fields using the locked config RPC",async()=>{
 const f=fixture();await f.save();const rpc=f.calls.find(c=>c.path.endsWith("/rpc/crm_patch_tenant_config"))!;
 assert.equal(rpc.body.p_tenant,OWNER);assert.deepEqual(Object.keys(rpc.body.p_patch as object),["master_plans_drafts"]);assert.equal(f.draftWrites.length,1);
});
test("an unconfirmed catalog write does not update the cache",async()=>{
 const f=fixture(false,true);await assert.rejects(f.save(),/plan_catalog_write_unconfirmed/);assert.equal(f.draftWrites.length,0);
});
