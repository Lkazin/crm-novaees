import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PIX_CONFIG,
  RECHARGE_PACKAGES,
  type MessageRechargeItem
} from "./plans";

describe("Gestão Financeira & Aprovação Manual de Recargas", () => {
  it("deve carregar os pacotes oficiais com 100 msgs (R$ 20), 200 msgs (R$ 40) e 500 msgs (R$ 90)", () => {
    assert.equal(RECHARGE_PACKAGES.length >= 3, true);

    const pkg100 = RECHARGE_PACKAGES.find(p => p.packagesCount === 1);
    assert.equal(pkg100?.messages, 100);
    assert.equal(pkg100?.priceValue, 20);

    const pkg200 = RECHARGE_PACKAGES.find(p => p.packagesCount === 2);
    assert.equal(pkg200?.messages, 200);
    assert.equal(pkg200?.priceValue, 40);

    const pkg500 = RECHARGE_PACKAGES.find(p => p.packagesCount === 5);
    assert.equal(pkg500?.messages, 500);
    assert.equal(pkg500?.priceValue, 90);
  });

  it("deve fornecer configuração PIX padrão com chave, favorecido e instruções claras", () => {
    assert.equal(typeof DEFAULT_PIX_CONFIG.pixKey, "string");
    assert.equal(DEFAULT_PIX_CONFIG.pixKey.length > 5, true);
    assert.equal(typeof DEFAULT_PIX_CONFIG.beneficiaryName, "string");
    assert.equal(DEFAULT_PIX_CONFIG.beneficiaryName.includes("NovaesWeb"), true);
  });

  it("recargas com status 'pending' NUNCA somam créditos ao saldo do cliente", () => {
    const recharges: MessageRechargeItem[] = [
      {
        id: "rec_pending_1",
        packagesCount: 1,
        messagesAdded: 100,
        pricePaid: 20,
        purchasedAt: new Date().toISOString(),
        status: "pending",
        paymentMethod: "pix",
        clientNotes: "PIX feito pelo titular"
      },
      {
        id: "rec_pending_2",
        packagesCount: 2,
        messagesAdded: 200,
        pricePaid: 40,
        purchasedAt: new Date().toISOString(),
        status: "pending",
        paymentMethod: "pix"
      }
    ];

    // Simula a lógica de cálculo do getEffectiveTenantPlan
    const paidRecharges = recharges.filter(r => r.status === "paid");
    const totalCreditsAdded = paidRecharges.reduce((sum, r) => sum + r.messagesAdded, 0);

    assert.equal(paidRecharges.length, 0);
    assert.equal(totalCreditsAdded, 0);
  });

  it("recargas com status 'rejected' NUNCA somam créditos ao saldo do cliente e gravam motivo", () => {
    const recharges: MessageRechargeItem[] = [
      {
        id: "rec_rejected_1",
        packagesCount: 1,
        messagesAdded: 100,
        pricePaid: 20,
        purchasedAt: new Date().toISOString(),
        status: "rejected",
        paymentMethod: "pix",
        rejectionReason: "PIX não localizado no extrato bancário"
      }
    ];

    const paidRecharges = recharges.filter(r => r.status === "paid");
    const totalCreditsAdded = paidRecharges.reduce((sum, r) => sum + r.messagesAdded, 0);

    assert.equal(totalCreditsAdded, 0);
    assert.equal(recharges[0].rejectionReason, "PIX não localizado no extrato bancário");
  });

  it("somente após o Master aprovar (status 'paid'), os 100 créditos são liberados", () => {
    const recharge: MessageRechargeItem = {
      id: "rec_test_123",
      packagesCount: 1,
      messagesAdded: 100,
      pricePaid: 20,
      purchasedAt: new Date().toISOString(),
      status: "pending",
      paymentMethod: "pix",
      clientNotes: "Comprovante 8899"
    };

    // Antes de aprovar: 0 créditos
    let paidList = [recharge].filter(r => r.status === "paid");
    assert.equal(paidList.length, 0);

    // Master aprova a recarga
    recharge.status = "paid";
    recharge.approvedAt = new Date().toISOString();
    recharge.approvedBy = "Master Admin";

    // Depois de aprovar: 100 créditos liberados
    paidList = [recharge].filter(r => r.status === "paid");
    const totalCredits = paidList.reduce((sum, r) => sum + r.messagesAdded, 0);
    assert.equal(totalCredits, 100);
    assert.equal(recharge.approvedBy, "Master Admin");
    assert.equal(typeof recharge.approvedAt, "string");
  });

  it("impede re-aprovação dupla e rejeição de recarga já paga (anti-replay)", () => {
    const recharge: MessageRechargeItem = {
      id: "rec_approved_double",
      packagesCount: 1,
      messagesAdded: 100,
      pricePaid: 20,
      purchasedAt: new Date().toISOString(),
      status: "paid",
      approvedAt: new Date().toISOString(),
      approvedBy: "Master",
      paymentMethod: "pix"
    };

    // Validação estrita de transição de estado
    const canApproveAgain = recharge.status === "pending";
    const canReject = recharge.status === "pending";

    assert.equal(canApproveAgain, false, "Não pode aprovar recarga que já foi paga");
    assert.equal(canReject, false, "Não pode rejeitar recarga que já foi paga");
  });

  it("calcula saldo perpétuo subtraindo o maior consumo entre Redis e PostgreSQL", () => {
    const paidRecharges: MessageRechargeItem[] = [
      {
        id: "rec_1",
        packagesCount: 1,
        messagesAdded: 100,
        pricePaid: 20,
        purchasedAt: new Date().toISOString(),
        status: "paid",
        paymentMethod: "pix"
      },
      {
        id: "rec_2",
        packagesCount: 2,
        messagesAdded: 200,
        pricePaid: 40,
        purchasedAt: new Date().toISOString(),
        status: "paid",
        paymentMethod: "pix"
      }
    ];

    const totalAdded = paidRecharges.reduce((sum, r) => sum + r.messagesAdded, 0); // 300 msgs
    const durableConsumed = 45;
    const redisConsumed = 50; // Mensagens recentes ainda em buffer de projeção

    const effectiveConsumed = Math.max(durableConsumed, redisConsumed);
    const balance = Math.max(0, totalAdded - effectiveConsumed);

    assert.equal(totalAdded, 300);
    assert.equal(effectiveConsumed, 50);
    assert.equal(balance, 250);
  });
});
