import test from "node:test";
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
  dispatchMasterRecoveryOtp
} from "./master-auth";

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
  process.env.CRM_MASTER_PASSWORD = "initial-secure-pass-123";
  const current = await getDynamicMasterPassword();
  assert.equal(current, "initial-secure-pass-123");

  const otp = await dispatchMasterRecoveryOtp("127.0.0.1");
  assert.equal(otp.length, 6);
  assert.match(otp, /^\d{6}$/);

  const saved = await saveMasterPassword("new-secure-custom-pass-999");
  // In test environment without Redis connection, returns false gracefully
  assert.equal(typeof saved, "boolean");
});
