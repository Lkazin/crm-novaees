import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes } from "node:crypto";
import { verifyMasterPasswordCandidate } from "./master-auth";

// Testa a verificacao da senha master contra hash. Nao toca Redis nem Supabase:
// so as funcoes puras de hash/verificacao de master-auth.ts.
// Gera um hash no mesmo formato usado em producao ("scrypt:<salt>:<hash>").
function hashFor(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

test("senha correta bate com o hash", () => {
  const stored = hashFor("MinhaSenha123");
  assert.equal(verifyMasterPasswordCandidate("MinhaSenha123", stored), true);
});

test("senha errada nao bate com o hash", () => {
  const stored = hashFor("MinhaSenha123");
  assert.equal(verifyMasterPasswordCandidate("MinhaSenha124", stored), false);
  assert.equal(verifyMasterPasswordCandidate("", stored), false);
});

test("hash quebrado ou vazio nao autentica", () => {
  assert.equal(verifyMasterPasswordCandidate("qualquer", "scrypt:"), false);
  assert.equal(verifyMasterPasswordCandidate("qualquer", "scrypt:semSeparador"), false);
  assert.equal(verifyMasterPasswordCandidate("qualquer", ""), false);
});

test("formato legado (texto puro) continua funcionando na migracao", () => {
  assert.equal(verifyMasterPasswordCandidate("SenhaAntiga123", "SenhaAntiga123"), true);
  assert.equal(verifyMasterPasswordCandidate("senhaantiga123", "SenhaAntiga123"), true);
  assert.equal(verifyMasterPasswordCandidate("SenhaAntiga123", "SenhaAntiga123."), true);
  assert.equal(verifyMasterPasswordCandidate("OutraCoisa", "SenhaAntiga123"), false);
});

test("a mesma senha gera hashes diferentes (salt aleatorio)", () => {
  const a = hashFor("MesmaSenha123");
  const b = hashFor("MesmaSenha123");
  assert.notEqual(a, b);
  assert.equal(verifyMasterPasswordCandidate("MesmaSenha123", a), true);
  assert.equal(verifyMasterPasswordCandidate("MesmaSenha123", b), true);
});
