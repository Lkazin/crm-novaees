import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  getMasterPassword,
  getMasterSessionSecret,
  getLegacyAdminToken,
  signMasterToken,
  verifyMasterToken,
  revokeMasterToken,
  isMasterTokenRevoked,
  getDynamicMasterPassword,
  saveMasterPassword,
  dispatchMasterRecoveryOtp,
  recordFailedLoginAttempt,
  isLoginBlocked,
  validateAndConsumeMasterOtp,
  resetLoginAttempts,
  resetMasterDynamicPasswordForTesting
} from "./master-auth";
import { disconnectRedis } from "./plans";

process.env.SKIP_WHATSAPP_DISPATCH = "true";

after(async () => {
  await resetMasterDynamicPasswordForTesting();
  await disconnectRedis();
});

test("Master sessions require configured secrets and reject malformed or tampered cookies", () => {
  const names = ["CRM_MASTER_SESSION_SECRET", "CRM_MASTER_PASSWORD", "CRM_LAB_ADMIN_TOKEN"];
  const previous = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.equal(getMasterSessionSecret(), "");
    assert.equal(getMasterPassword(), "");
    assert.equal(getLegacyAdminToken(), "");
    assert.throws(() => signMasterToken(), /MISSING/);
    assert.equal(verifyMasterToken("forged").valid, false);
    process.env.CRM_MASTER_SESSION_SECRET = "fixture-session-secret-".repeat(3);
    assert.equal(verifyMasterToken("%malformed").valid, false);
    const token = signMasterToken("fixture_master");
    assert.deepEqual(verifyMasterToken(token), {valid: true, actor: "fixture_master"});
    assert.equal(verifyMasterToken(token.replace("fixture_master", "other")).valid, false);
    assert.equal(verifyMasterToken(signMasterToken("fixture_master", true)).valid, true);
  } finally {
    names.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]);
  }
});

test("Master token revocation invalidates the token signature immediately", async () => {
  process.env.CRM_MASTER_SESSION_SECRET = "fixture-session-secret-".repeat(3);
  const token = signMasterToken("fixture_admin");
  assert.equal(await isMasterTokenRevoked(token), false);
  await revokeMasterToken(token);
  assert.equal(await isMasterTokenRevoked(token), true);
});

test("Master dynamic password and WhatsApp OTP dispatch work securely", async () => {
  await resetMasterDynamicPasswordForTesting();
  process.env.CRM_MASTER_PASSWORD = "initial-secure-pass-123";
  const current = await getDynamicMasterPassword();
  assert.equal(current, "initial-secure-pass-123");

  const otp = await dispatchMasterRecoveryOtp("127.0.0.1");
  assert.equal(otp.length, 6);
  assert.match(otp, /^\d{6}$/);

  const saved = await saveMasterPassword("new-secure-custom-pass-999");
  assert.equal(typeof saved, "boolean");
});

test("Master Rate Limiting bloqueia na 5ª tentativa, dispara OTP e desbloqueia com código correto", async () => {
  const testIp = "192.168.1.100";
  await resetLoginAttempts(testIp, true);

  // Tentativas 1 a 4 não bloqueiam
  for (let i = 1; i <= 4; i++) {
    const res = await recordFailedLoginAttempt(testIp, true);
    assert.equal(res.attempts, i);
    assert.equal(res.blocked, false);
    const check = await isLoginBlocked(testIp, true);
    assert.equal(check.blocked, false);
  }

  // Tentativa 5 DEVE bloquear e disparar OTP
  const res5 = await recordFailedLoginAttempt(testIp, true);
  assert.equal(res5.attempts, 5);
  assert.equal(res5.blocked, true);
  assert.equal(res5.otpDispatched, true);
  assert.ok(res5.otpCode);
  assert.match(res5.otpCode, /^\d{6}$/);

  // Status de bloqueio deve ser true
  const checkBlocked = await isLoginBlocked(testIp, true);
  assert.equal(checkBlocked.blocked, true);

  // Tentativa de código errado falha
  const wrongValid = await validateAndConsumeMasterOtp("000000", testIp);
  assert.equal(wrongValid, false);
  assert.equal((await isLoginBlocked(testIp, true)).blocked, true);

  // Código correto consome OTP e desbloqueia o IP
  const rightValid = await validateAndConsumeMasterOtp(res5.otpCode, testIp);
  assert.equal(rightValid, true);

  // Após consumo do código, o IP não está mais bloqueado
  const checkUnblocked = await isLoginBlocked(testIp, true);
  assert.equal(checkUnblocked.blocked, false);
});
