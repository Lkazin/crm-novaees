import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as limits from "./knowledge-limits";

const TENANT = "11111111-1111-4111-8111-111111111111";
function fixture(kind: "knowledge" | "ai-settings", failSave = false) {
  const calls: string[] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": {NextRequest},
    "@/lib/crm/knowledge-limits": limits,
    "@/lib/crm/supabase-server": {
      isAllowedOrigin: () => true, privateJson: (value: unknown, status = 200) => Response.json(value,{status}),
      supabaseSettings: () => ({url:"https://fixture.supabase.co",key:"fixture-public"}),
    },
    "@/lib/crm/tenant-access": {
      authorizeCrmTenant: async () => ({operatorId:TENANT,token:"fixture",isMaster:true}),
      crmServiceConfig: () => ({url:"https://fixture.supabase.co",key:"fixture-service"}),
      crmFeatureAllowed: () => true, patchCrmConfig: async () => undefined,
    },
    "@/lib/crm/plans": {
      requireTenantFeature: async () => ({allowed:true,effectivePlan:{isSuspended:false}}),
      getEffectiveTenantPlan: async () => ({isSuspended:false}),
    },
    "@/lib/crm/whatsapp-slots": {},
    "@/lib/agent/processor": {getBrazilMonthKey: () => "2026-11"},
    ioredis: class {},
  };
  const fixtureModule = {exports:{} as {POST:(request:NextRequest)=>Promise<Response>}};
  const output = ts.transpileModule(readFileSync(`src/app/api/crm/operator/${kind}/route.ts`,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  vm.runInNewContext(output,{
    module:fixtureModule,exports:fixtureModule.exports,
    require:(id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},
    process:{env:{CRM_SUPABASE_URL:"https://fixture.supabase.co",CRM_SUPABASE_SERVICE_ROLE_KEY:"fixture-service"}},
    Response,URL,AbortSignal,console,
    fetch:async (input:string,init?:RequestInit)=>{
      const path=new URL(input).pathname;calls.push(`${init?.method||"GET"} ${path}`);
      if(init?.method==="POST"||init?.method==="PATCH")return failSave?Response.json({},{status:500}):Response.json([{id:TENANT}],{status:201});
      if(path.endsWith("crm_knowledge_articles"))return Response.json([]);
      throw Error("Unexpected fixture request");
    },
  });
  return {calls,post:(value:object)=>{
    const body=JSON.stringify({tenantId:TENANT,...value});
    return fixtureModule.exports.POST(new NextRequest(`http://localhost/api/crm/operator/${kind}`,{
      method:"POST",headers:{"Content-Type":"application/json","Content-Length":String(Buffer.byteLength(body))},body,
    }));
  }};
}

test("knowledge accepts 20,000 accented characters despite their UTF-8 byte length",async()=>{
  const f=fixture("knowledge");
  const response=await f.post({title:"Produtos",body:"é".repeat(20_000)});
  assert.equal(response.status,201);
  assert.equal(f.calls.length,1);
});

test("both knowledge entry points reject oversized content before writes",async()=>{
  for(const kind of ["knowledge","ai-settings"] as const){
    const f=fixture(kind);
    const text="a".repeat(20_001);
    const response=await f.post(kind==="knowledge"?{title:"Produtos",body:text}:{storeInfo:text});
    assert.equal(response.status,400);
    assert.equal(f.calls.length,0);
  }
});

test("the main configuration never reports saved when knowledge persistence fails",async()=>{
  const f=fixture("ai-settings",true);
  const response=await f.post({storeInfo:"Informações reais do negócio"});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,"knowledge_save_failed");
});
