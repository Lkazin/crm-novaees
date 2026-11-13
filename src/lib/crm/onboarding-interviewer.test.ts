import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNextInterviewTurn,
  compileProfileFromInterview,
  parsePortugueseSchedule,
  type InterviewMessage,
} from "./onboarding-interviewer";

test("parsePortugueseSchedule extrai dias, expediente e horario de sabado de texto livre", () => {
  const result = parsePortugueseSchedule(
    "Segunda a sexta das 08h30 às 18h30 e sábado das 09h às 13h",
    "Bella Pizza",
  );
  assert.equal(result.openTime, "08:30");
  assert.equal(result.closeTime, "18:30");
  assert.deepEqual(result.days, ["seg", "ter", "qua", "qui", "sex", "sab"]);
  assert.equal(result.schedule.seg.enabled, true);
  assert.equal(result.schedule.sab.enabled, true);
  assert.equal(result.schedule.sab.openTime, "09:00");
  assert.equal(result.schedule.sab.closeTime, "13:00");
  assert.equal(result.schedule.dom.enabled, false);
});

test("buildNextInterviewTurn avanca pelas 6 perguntas e sinaliza readyToCompile ao concluir", () => {
  const first = buildNextInterviewTurn([], "Maya", "Loja Exemplo");
  assert.equal(first.currentStep, 1);
  assert.equal(first.readyToCompile, false);
  assert.match(first.reply, /Maya/);

  const messages: InterviewMessage[] = [
    { role: "assistant", content: first.reply },
    { role: "user", content: "Sofia, tom amigável e acolhedor" },
    { role: "user", content: "Pizza Calabresa R$ 49,90 e Muçarela R$ 45,00" },
    { role: "user", content: "Pix, cartão em até 3x e entrega grátis no centro" },
    { role: "user", content: "Terça a domingo das 18h às 23h30" },
    { role: "user", content: "Rua Central, 100. Entrega em 40 minutos." },
    { role: "user", content: "Quando pedir desconto ou falar com gerente" },
  ];

  const finalTurn = buildNextInterviewTurn(messages, "Maya", "Loja Exemplo");
  assert.equal(finalTurn.readyToCompile, true);
  assert.equal(finalTurn.currentStep, 6);
});

test("compileProfileFromInterview consolida nome da assistente, prompt, base de conhecimento e horarios", () => {
  const messages: InterviewMessage[] = [
    { role: "user", content: "Sofia, tom formal e corporativo" },
    { role: "user", content: "Consultoria Empresarial: R$ 500,00" },
    { role: "user", content: "Pix com 10% de desconto e Boleto" },
    { role: "user", content: "Segunda a sexta das 09h às 18h" },
    { role: "user", content: "Av. Paulista, 1000. Garantia de 90 dias." },
    { role: "user", content: "Quando o cliente solicitar contrato personalizado" },
  ];

  const profile = compileProfileFromInterview(messages, "Novaes Consultoria");
  assert.match(profile.agentLabel, /Sofia/);
  assert.match(profile.instructions, /postura formal/i);
  assert.match(profile.instructions, /contrato personalizado/);
  assert.match(profile.storeInfo, /Consultoria Empresarial: R\$ 500,00/);
  assert.match(profile.storeInfo, /Pix com 10% de desconto/);
  assert.equal(profile.operatingHours.openTime, "09:00");
  assert.equal(profile.operatingHours.closeTime, "18:00");
  assert.deepEqual(profile.operatingHours.days, ["seg", "ter", "qua", "qui", "sex"]);
});
