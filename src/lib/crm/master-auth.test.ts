import test from "node:test";
import assert from "node:assert/strict";
import { getMasterPassword, getMasterSessionSecret, getLegacyAdminToken, signMasterToken, verifyMasterToken } from "./master-auth";

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
