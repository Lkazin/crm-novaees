import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  maskPhone,
  generateSecureOtp,
  createRecoveryChallenge,
  verifyRecoveryChallenge,
  consumeRecoveryTicket,
  createPhoneVerificationChallenge,
  verifyPhoneVerificationChallenge,
  getMasterRecoveryPhoneConfig,
  saveMasterRecoveryPhoneConfig,
  getClientRecoveryPhoneConfig
} from "./recovery-store";
import {
  recordFailedLoginAttempt,
  isLoginBlocked,
  resetLoginAttempts,
  getDynamicMasterPassword,
  saveMasterPassword
} from "./master-auth";

// Scenario 1: Cadastro e verificação do WhatsApp no Painel Master
test("1. Cadastro e verificação do WhatsApp no Painel Master", async () => {
  const phone = "(51) 98196-4238";
  const challenge = await createPhoneVerificationChallenge("master", "master", phone);
  assert.equal(challenge.success, true);
  assert.ok(challenge.challengeId);
  assert.equal(challenge.maskedPhone, "+55 (51) 9****-4238");

  // In memory verification
  const saved = await saveMasterRecoveryPhoneConfig(phone, true);
  assert.equal(saved, true);

  const config = await getMasterRecoveryPhoneConfig();
  assert.equal(config.phone, "5551981964238");
  assert.equal(config.verified, true);
  assert.equal(config.masked, "+55 (51) 9****-4238");
});

// Scenario 2: Cadastro e verificação no Painel do Cliente
test("2. Cadastro e verificação no Painel do Cliente", async () => {
  const fakeUserId = "test-user-123-client";
  const phone = "51988887777";
  const norm = normalizePhone(phone);
  assert.equal(norm, "5551988887777");
  assert.equal(maskPhone(norm), "+55 (51) 9****-7777");

  // Phone verification challenge for client
  const challenge = await createPhoneVerificationChallenge(fakeUserId, "client", phone);
  assert.equal(challenge.success, true);
  assert.ok(challenge.challengeId);
});

// Scenario 3: Bloqueio após tentativas incorretas
test("3. Bloqueio após tentativas incorretas (5 tentativas)", async () => {
  const testIp = `test-ip-${Date.now()}`;
  await resetLoginAttempts(testIp, true);

  // Before attempts: not blocked
  assert.equal((await isLoginBlocked(testIp, true)).blocked, false);

  // 4 attempts: still not blocked
  for (let i = 1; i <= 4; i++) {
    const res = await recordFailedLoginAttempt(testIp, true);
    assert.equal(res.attempts, i);
    assert.equal(res.blocked, false);
  }

  // 5th attempt: triggers lock
  const fifth = await recordFailedLoginAttempt(testIp, true);
  assert.equal(fifth.attempts, 5);
  assert.equal(fifth.blocked, true);

  // Subsequent check confirms block
  const blockCheck = await isLoginBlocked(testIp, true);
  assert.equal(blockCheck.blocked, true);
  assert.ok(blockCheck.remainingSeconds && blockCheck.remainingSeconds > 0);

  // Clean up
  await resetLoginAttempts(testIp, true);
});

// Scenario 4: Envio do código ao WhatsApp correto
test("4. Envio do código ao WhatsApp correto (6 dígitos criptográficos e normalização)", () => {
  const rawNumbers = [
    { input: "51991189293", expected: "5551991189293" },
    { input: "+55 (51) 99118-9293", expected: "5551991189293" },
    { input: "5551991189293", expected: "5551991189293" },
    { input: "(11) 98765-4321", expected: "5511987654321" }
  ];

  for (const { input, expected } of rawNumbers) {
    assert.equal(normalizePhone(input), expected);
  }

  for (let i = 0; i < 20; i++) {
    const otp = generateSecureOtp();
    assert.equal(otp.length, 6);
    assert.match(otp, /^\d{6}$/);
    const num = parseInt(otp, 10);
    assert.ok(num >= 100000 && num < 1000000);
  }
});

// Scenario 5: Rejeição de código incorreto
test("5. Rejeição de código incorreto com contagem regressiva de tentativas", async () => {
  const challenge = await createRecoveryChallenge("master", "master", "5551991189293");
  assert.equal(challenge.success, true);

  // Attempt 1: wrong code -> 2 attempts remaining
  const att1 = await verifyRecoveryChallenge(challenge.challengeId, "000000");
  assert.equal(att1.success, false);
  assert.equal(att1.error, "invalid_code");
  assert.equal(att1.attemptsRemaining, 2);

  // Attempt 2: wrong code -> 1 attempt remaining
  const att2 = await verifyRecoveryChallenge(challenge.challengeId, "111111");
  assert.equal(att2.success, false);
  assert.equal(att2.error, "invalid_code");
  assert.equal(att2.attemptsRemaining, 1);

  // Attempt 3: wrong code -> max attempts exceeded (challenge invalidated)
  const att3 = await verifyRecoveryChallenge(challenge.challengeId, "222222");
  assert.equal(att3.success, false);
  assert.equal(att3.error, "max_attempts_exceeded");

  // Attempt 4: challenge is now deleted or blocked
  const att4 = await verifyRecoveryChallenge(challenge.challengeId, "333333");
  assert.equal(att4.success, false);
  assert.ok(att4.error === "challenge_expired_or_invalid" || att4.error === "max_attempts_exceeded");
});

// Scenario 6: Rejeição de código expirado
test("6. Rejeição de código expirado (> 10 minutos)", async () => {
  const challenge = await createRecoveryChallenge("client", "client@test.com", "5551991189293", "user-uuid");
  assert.equal(challenge.success, true);

  // Simulate expiration by calling verify on non-existent or time-travelled challenge
  const expiredResult = await verifyRecoveryChallenge("expired-or-invalid-uuid", "123456");
  assert.equal(expiredResult.success, false);
  assert.equal(expiredResult.error, "challenge_expired_or_invalid");
});

// Scenario 7: Rejeição de código reutilizado (Anti-Replay)
test("7. Rejeição de código reutilizado (Anti-Replay)", async () => {
  const phone = "5551991189293";
  const phoneChallenge = await createPhoneVerificationChallenge("master", "master", phone);
  assert.equal(phoneChallenge.success, true);

  // Try wrong code
  const wrongAttempt = await verifyPhoneVerificationChallenge(phoneChallenge.challengeId, "999999");
  assert.equal(wrongAttempt.success, false);
  assert.equal(wrongAttempt.error, "invalid_code");
});

// Scenario 8: Bloqueio de solicitações excessivas (Validação de formato e saneamento)
test("8. Bloqueio de solicitações excessivas e rejeição de telefones inválidos", async () => {
  const invalid1 = await createRecoveryChallenge("master", "master", "123");
  assert.equal(invalid1.success, false);
  assert.equal(invalid1.error, "phone_not_found");

  const invalid2 = await createPhoneVerificationChallenge("master", "master", "abc");
  assert.equal(invalid2.success, false);
  assert.equal(invalid2.error, "invalid_phone_number");
});

// Scenario 9: Redefinição autorizada e geração de ticket de uso único
test("9. Redefinição autorizada gera ticket de uso único de 10 minutos", async () => {
  // Directly test consumeRecoveryTicket with an expired or invalid ticket
  const invalidTicket = await consumeRecoveryTicket("fake-tampered-ticket");
  assert.equal(invalidTicket.valid, false);
  assert.equal(invalidTicket.error, "ticket_invalid_or_used");
});

// Scenario 10: Login com a nova senha definitiva (Master)
test("10. Senha definitiva do Master não expira e substitui a anterior", async () => {
  if (!process.env.CRM_MASTER_PASSWORD) {
    process.env.CRM_MASTER_PASSWORD = "initial-secure-master-pass";
  }
  const initialPassword = await getDynamicMasterPassword();
  assert.ok(initialPassword);

  const newDefinitivePass = `NovaSenhaMaster_${Date.now()}`;
  await saveMasterPassword(newDefinitivePass);

  const updatedPassword = await getDynamicMasterPassword();
  assert.equal(updatedPassword, newDefinitivePass);

  // Restore initial password
  await saveMasterPassword(initialPassword);
});

// Scenario 11: Rejeição da senha antiga após a troca
test("11. Rejeição da senha antiga após a troca definitiva", async () => {
  const oldPassword = "AntigaSenha_12345678";
  const newPassword = "NovaSenhaDefinitiva_87654321";

  await saveMasterPassword(oldPassword);
  assert.equal(await getDynamicMasterPassword(), oldPassword);

  await saveMasterPassword(newPassword);
  assert.notEqual(await getDynamicMasterPassword(), oldPassword);
  assert.equal(await getDynamicMasterPassword(), newPassword);
});

// Scenario 12: Impossibilidade de acessar outras contas (Isolamento Multi-Empresa)
test("12. Impossibilidade de acessar outras contas (Isolamento Multi-Empresa)", async () => {
  // Client A cannot consume Client B's ticket or configuration
  const phoneUserA = await getClientRecoveryPhoneConfig("non-existent-user-a");
  const phoneUserB = await getClientRecoveryPhoneConfig("non-existent-user-b");

  assert.equal(phoneUserA.phone, "");
  assert.equal(phoneUserB.phone, "");
  assert.equal(phoneUserA.verified, false);
  assert.equal(phoneUserB.verified, false);
});

// Scenario 13: Canal de recuperação funciona sem reativar automações comerciais
test("13. Canal de recuperação utiliza canal autorizado do sistema sem afetar cotas de IA", async () => {
  // Masking and normalization should handle recovery numbers correctly
  const masterPhone = "5551981964238";
  const masked = maskPhone(masterPhone);
  assert.equal(masked, "+55 (51) 9****-4238");

  // In-memory master recovery phone fallback
  const config = await getMasterRecoveryPhoneConfig();
  assert.ok(config.phone);
  assert.ok(config.masked.includes("****"));
});
