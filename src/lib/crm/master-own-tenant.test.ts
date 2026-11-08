import assert from "node:assert/strict";
import test from "node:test";
import { resolveMasterOwnTenant } from "./master-own-tenant";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";

test("agency identity uses the configured UUID and rejects ambiguity without guessing",async()=>{
 const previous=process.env.CRM_MASTER_OWN_TENANT_ID;
 try{
  process.env.CRM_MASTER_OWN_TENANT_ID=A;
  const own=await resolveMasterOwnTenant(async query=>{assert.ok(query.includes("id=eq."+A));return[{id:A}];});assert.equal(own.id,A);
  delete process.env.CRM_MASTER_OWN_TENANT_ID;
  await assert.rejects(resolveMasterOwnTenant(async query=>{assert.ok(query.includes("name=ilike.NovaesWeb"));return[{id:A},{id:B}];}),/master_own_tenant_unavailable/);
  await assert.rejects(resolveMasterOwnTenant(async()=>[]),/master_own_tenant_unavailable/);
  process.env.CRM_MASTER_OWN_TENANT_ID="invalid";
  await assert.rejects(resolveMasterOwnTenant(async()=>{throw Error("must not query");}),/invalid_master_own_tenant/);
 }finally{if(previous===undefined)delete process.env.CRM_MASTER_OWN_TENANT_ID;else process.env.CRM_MASTER_OWN_TENANT_ID=previous;}
});
