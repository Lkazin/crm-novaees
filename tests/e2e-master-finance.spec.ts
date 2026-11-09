import { test, expect } from "@playwright/test";

test.describe("E2E Navegador Real: Painel Master e Fluxo de Cadastro / Financeiro", () => {
  test.beforeEach(async ({ context, page }) => {
    // Cookie de sessão master para o Next.js middleware autorizar a rota /admin
    await context.addCookies([
      {
        name: "nw_master_session",
        value: "test-master-token-session",
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);

    // Mock do endpoint de sessão administrativa para entrar no /admin como Master autorizado
    await page.route("**/api/crm/auth/session*", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: true,
            actor: "master_admin",
            role: "master",
            user: { email: "master@novaesweb.com.br", role: "master" }
          })
        });
      }
      await route.fallback();
    });

    // Mock de clientes reais para o teste E2E visual no navegador
    await page.route("**/api/crm/admin/clients*", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            clients: [
              {
                id: "11111111-2222-3333-4444-555555555555",
                name: "Hamburgueria do Chefe",
                status: "active",
                email: "chefe@hamburgueria.com",
                userId: "user-123",
                ownerName: "Carlos Eduardo",
                businessDetails: {
                  ownerName: "Carlos Eduardo",
                  niche: "Hamburgueria",
                  businessWhatsapp: "51999998888",
                  document: "12.345.678/0001-90",
                  agentName: "Sofia"
                },
                created_at: new Date().toISOString(),
                whatsappStatus: "connected",
                connectedWhatsappCount: 1,
                operatorsCount: 1,
                maxOperators: 3,
                maxWhatsappConnections: 3,
                plan: {
                  planId: "crm-premium",
                  name: "CRM Premium",
                  price: "299,90",
                  dueDate: "2026-12-10",
                  status: "paid",
                  autoBlock: true,
                  isOverdue: false,
                  quotaLimit: 2000,
                  quotaUsed: 150
                },
                paymentHistory: [
                  {
                    id: "fat-001",
                    amount: "299,90",
                    dueDate: "2026-11-10",
                    paidAt: "2026-11-09T10:00:00Z",
                    status: "paid"
                  }
                ]
              }
            ]
          })
        });
      }
      await route.fallback();
    });

    // Mock de usuários para o seletor de clientes
    await page.route("**/api/crm/admin/users*", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            users: [
              {
                id: "user-123",
                name: "Carlos Eduardo",
                email: "chefe@hamburgueria.com",
                whatsapp: "51999998888",
                status: "linked",
                isBlocked: false,
                createdAt: new Date().toISOString(),
                linkedTenants: [{ tenantId: "11111111-2222-3333-4444-555555555555", tenantName: "Hamburgueria do Chefe" }]
              },
              {
                id: "user-456",
                name: "Juliana Santos",
                email: "juliana@moda.com",
                whatsapp: "51988887777",
                status: "waiting_store",
                isBlocked: false,
                createdAt: new Date().toISOString(),
                linkedTenants: []
              }
            ]
          })
        });
      }
      await route.fallback();
    });

    // Mock de planos
    await page.route("**/api/crm/admin/plans*", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            plans: [
              { id: "crm-start", name: "CRM Start", price: "59,90", quotaLimit: 200 },
              { id: "crm-business", name: "CRM Business", price: "149,90", quotaLimit: 800 },
              { id: "crm-premium", name: "CRM Premium", price: "299,90", quotaLimit: 2000 }
            ],
            clientCounts: { "crm-premium": 1 }
          })
        });
      }
      await route.fallback();
    });

    // Mock de finanças / despesas
    await page.route("**/api/crm/admin/finance*", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pixConfig: {
              keyType: "cnpj",
              pixKey: "12.345.678/0001-90",
              beneficiaryName: "NovaesWeb Tecnologia LTDA",
              bankName: "Banco Inter"
            },
            expenses: [
              {
                id: "exp-1",
                description: "Hospedagem Servidor VPS",
                category: "servers",
                amount: 180,
                dueDate: "2026-11-20",
                status: "paid",
                createdAt: new Date().toISOString()
              }
            ]
          })
        });
      }
      await route.fallback();
    });

    // Mock de recargas
    await page.route("**/api/crm/admin/recharges*", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ recharges: [] })
        });
      }
      await route.fallback();
    });
  });

  test("1. Acessa o Painel Master e renderiza o Logo Oficial e Título", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("img[alt='Novaes CRM IA']").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Painel Master").first()).toBeVisible();
    await page.screenshot({ path: "tests/screenshots/1-painel-master.png" });
  });

  test("2. Navega para Central de Logins & Clientes e valida formulário com gerador de senha", async ({ page }) => {
    await page.goto("/admin?section=users");
    await expect(page.getByText("Central de Logins & Clientes").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Juliana Santos")).toBeVisible();
    await expect(page.getByText("AGUARDANDO VINCULAÇÃO")).toBeVisible();

    // Abre formulário de novo login
    const btnNovoLogin = page.getByRole("button", { name: "+ Criar Login" });
    await btnNovoLogin.click();

    await expect(page.getByText("Criar Login de Cliente")).toBeVisible();

    // Testa botão de gerar senha forte
    const btnGerarSenha = page.getByRole("button", { name: /Gerar Senha Forte/i });
    await btnGerarSenha.click();

    const senhaInput = page.locator("input[placeholder='Mínimo 6 dígitos']").first();
    const senhaGerada = await senhaInput.inputValue();
    expect(senhaGerada.length).toBeGreaterThanOrEqual(10);

    await page.screenshot({ path: "tests/screenshots/2-central-logins.png" });
  });

  test("3. Navega para Faturamento & Métricas e valida KPIs, Previsão e Tabela de Cobranças", async ({ page }) => {
    await page.goto("/admin?section=kpis");
    await expect(page.getByText("MRR contratado").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("R$ 299,90").first()).toBeVisible();
    await expect(page.getByText("Previsão de cobranças")).toBeVisible();

    // Valida Central Geral de Cobranças
    await expect(page.getByText("Central Geral de Cobranças das Lojas")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Hamburgueria do Chefe/i }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /Carlos Eduardo/i }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /CRM Premium/i }).first()).toBeVisible();

    await page.screenshot({ path: "tests/screenshots/3-faturamento-kpis.png" });
  });

  test("4. Abre a Ficha Financeira de uma Loja pelo botão de ação", async ({ page }) => {
    await page.goto("/admin?section=clients");
    await expect(page.getByText("Hamburgueria do Chefe").first()).toBeVisible({ timeout: 20_000 });

    // Clica no botão de Ficha Financeira ($)
    const btnFicha = page.locator("button[title='Ficha Financeira e Cobrança']").first();
    await btnFicha.click();

    // Valida modal aberto
    await expect(page.getByText("Ficha Financeira: Hamburgueria do Chefe")).toBeVisible();
    await expect(page.getByText("Carlos Eduardo")).toBeVisible();
    await expect(page.getByRole("button", { name: /Conceder Prazo Adicional/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Aplicar Desconto/i })).toBeVisible();

    await page.screenshot({ path: "tests/screenshots/4-ficha-financeira.png" });
  });
});
