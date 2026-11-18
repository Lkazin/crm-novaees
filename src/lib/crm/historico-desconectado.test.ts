import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAllowedTabsForTenant, DEFAULT_OPERATOR_TABS } from "./tenant-access";

// Item 5: o historico precisa continuar acessivel com o WhatsApp desconectado.
// A permissao de abas depende apenas do vinculo do operador, nunca do status
// da conexao -- se alguem voltar a filtrar por conexao, estes testes quebram.

const operatorAccess = {
  isMaster: false,
  memberships: [
    {
      tenant_id: "11111111-1111-4111-8111-111111111111",
      role: "operator",
      allowed_tabs: ["atendimentos", "contatos"],
    },
  ],
} as never;

test("operador mantem as abas mesmo com o WhatsApp desconectado", () => {
  const tabs = getAllowedTabsForTenant(operatorAccess, "11111111-1111-4111-8111-111111111111");
  assert.ok(Array.isArray(tabs), "esperava lista de abas");
  assert.ok(tabs!.includes("atendimentos"), "historico precisa continuar acessivel");
  assert.ok(tabs!.includes("contatos"), "contatos precisam continuar acessiveis");
});

test("operador sem allowed_tabs cai no padrao, que inclui atendimentos", () => {
  const access = {
    isMaster: false,
    memberships: [{ tenant_id: "t1", role: "operator" }],
  } as never;
  const tabs = getAllowedTabsForTenant(access, "t1");
  assert.deepEqual(tabs, DEFAULT_OPERATOR_TABS);
  assert.ok(DEFAULT_OPERATOR_TABS.includes("atendimentos"));
});

test("dono e master nao sao limitados por lista de abas", () => {
  const owner = { isMaster: false, memberships: [{ tenant_id: "t1", role: "owner" }] } as never;
  assert.equal(getAllowedTabsForTenant(owner, "t1"), null);
  const master = { isMaster: true, memberships: [] } as never;
  assert.equal(getAllowedTabsForTenant(master, "t1"), null);
});

test("o painel nao filtra abas pelo status da conexao", () => {
  // Guarda contra a regressao: canAccessTab ja teve hasConnectedWhatsapp nas
  // dependencias sem usar, com um comentario dizendo que escondia as abas.
  const src = readFileSync(
    new URL("../../components/crm/ClientWorkspace.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(
    !/canAccessTab[\s\S]{0,400}hasConnectedWhatsapp/.test(src),
    "canAccessTab nao pode depender de hasConnectedWhatsapp"
  );
  assert.ok(
    !/escondid|saem completamente do painel/i.test(src),
    "comentario antigo que prometia esconder as abas deve ter sido removido"
  );
});
