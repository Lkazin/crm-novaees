import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentConfig } from "./config";
import { processWebhook } from "./processor";

const cfg: AgentConfig = {
 evolutionUrl:"http://localhost:8080",evolutionKey:"dummy",instance:"crmtest",
 webhookSecret:"x".repeat(40), redisUrl:"redis://localhost:6379",
 aiUrl:"http://localhost:3001/v1",aiKey:"dummy",aiModel:"demo",
 systemPrompt:"Horário de testes: 9h às 17h.", allowedNumber:"5511999998888",
 sendEnabled: true,sendFormat:"v2",
};
const payload = { event:"messages.upsert",instance:"crmtest",
 data:{ key:{id:"unique1",remoteJid:"5511999998888@s.whatsapp.net",fromMe:false},message:{conversation:"Qual horário?"} },
};
function fakeRedis() {
 const keys = new Set<string>();
 const lists = new Map<string, string[]>();
 return {
  exists: async (k:string) => Number(keys.has(k)),
  set: async (k:string, _val?: string, _ex?: string, _ttl?: number, mode?: string) => {
    if (mode === "NX" && keys.has(k)) return null;
    keys.add(k);
    return "OK";
  },
  del: async (k:string) => { keys.delete(k); lists.delete(k); return 1; },
  rpush: async (k: string, v: string) => {
    const l = lists.get(k) || [];
    l.push(v);
    lists.set(k, l);
    return l.length;
  },
  lrange: async (k: string) => {
    return lists.get(k) || [];
  },
  expire: async () => 1,
 };
}

test("disabled switch never connects or sends",async()=>{
 assert.equal((await processWebhook(payload,{...cfg,sendEnabled:false})).status,"disabled");
});
test("number not allowed rejected before Redis",async()=>{
 assert.equal((await processWebhook({...payload,data:{...payload.data,key:{...payload.data.key,remoteJid:"5511888887777@s.whatsapp.net"}}},cfg)).reason,"number_not_allowed");
});
test("single allowed message generates and sends exactly once",async()=>{
 const db=fakeRedis();let sends=0;
 const deps={redis:db as never,generate:async()=>"Atendemos das 9h às 17h.",send:async()=>{sends++;}};
 assert.equal((await processWebhook(payload,cfg,deps)).status,"sent");
 assert.equal((await processWebhook(payload,cfg,deps)).status,"duplicate");
 assert.equal(sends,1);
});
test("failed send releases lock and allows retry",async()=>{
 const db=fakeRedis();let calls=0;
 const deps={redis:db as never,generate:async()=>"Oi",send:async()=>{calls++; if(calls===1)throw new Error("network");}};
 await assert.rejects(processWebhook(payload,cfg,deps));
 assert.equal((await processWebhook(payload,cfg,deps)).status,"sent");
 assert.equal(calls,2);
});

test("human takeover blocks sending before calling AI",async()=>{
 const db=fakeRedis();let generated=0;let sent=0;
 const result=await processWebhook(payload,cfg,{
  redis:db as never,maySend:async()=>false,
  generate:async()=>{generated++;return "Não deveria responder";},
  send:async()=>{sent++;}
 });
 assert.equal(result.status,"disabled");
 assert.equal(result.reason,"tenant_or_conversation_blocked");
 assert.equal(generated,0);
 assert.equal(sent,0);
});
test("handoff during AI generation blocks outbound message",async()=>{
 const db=fakeRedis();let permissionChecks=0;let sent=0;
 const result=await processWebhook(payload,cfg,{
  redis:db as never,maySend:async()=>++permissionChecks===1,
  generate:async()=> "Resposta descartada depois do atendimento humano",
  send:async()=>{sent++;}
 });
 assert.equal(result.status,"disabled");
 assert.equal(permissionChecks,2);
 assert.equal(sent,0);
});
