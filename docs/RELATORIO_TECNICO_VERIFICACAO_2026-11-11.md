# Relatório técnico de verificação — NovaesWeb CRM AI

**Data da verificação:** 11/11/2026
**Verificado por:** auditoria automatizada (código local + Supabase + Redis + Evolution API + GitHub)
**Raiz:** `C:\Users\camil\novaesweb-crm-ai`

Este documento registra **o que foi efetivamente checado**, com evidência de cada constatação.
Nada aqui foi inferido de memória ou de outro projeto: cada item tem a fonte ao lado.

---

## 1. Identificação do projeto

| Item | Valor |
|---|---|
| Nome do pacote | `novaesweb-crm-ai` (versão `0.1.0`, privado) |
| Stack | Next.js 15.5.29 (App Router), React 19.1.8, TypeScript 5.8.3 |
| Dependências de runtime | `ioredis` 5.4.2, `lucide-react`, `server-only` (nenhum SDK de Supabase — usa REST via `fetch`) |
| Testes | `tsx --test` (unitários), Playwright 1.56.1 (e2e) |
| Branch atual | `main` |
| Último commit | `2aad833` — *fix(crm): corrigir variaveis de compilacao da sidebar e exportacao* |
| Total de commits | 255 |
| Remoto | `https://github.com/Lkazin/crm-novaees.git` |

---

## 2. GitHub

| Item | Valor |
|---|---|
| Repositório | `Lkazin/crm-novaees` |
| URL | https://github.com/Lkazin/crm-novaees |
| Visibilidade | **PÚBLICO** (confirmado pela API do GitHub: `"private": false`, `"visibility": "public"`) |
| Branch padrão | `main` |
| Último push | 11/11/2026 10:14 UTC (07:14 em São Paulo) |
| Tamanho | ~1,6 MB |
| Linguagem principal | TypeScript |
| Issues abertas | 0 |
| `gh` CLI instalado | **Não** — não é possível operar issues/PRs pelo terminal |

### Branches locais

| Branch | Situação |
|---|---|
| `main` | atual, sincronizada com `origin/main` |
| `feat/whatsapp-ai-lab` | sincronizada com origin, **2 commits atrás** |
| `feat/client-user-store-linking` | sincronizada |
| `feat/commercial-plans-definitive` | local, sem push |
| `feat/financeiro-expansao` | local, sem push |
| `codex/fix-plan-governance` | local, sem push |

### Ações de CI (`.github/workflows/`)

| Workflow | Disparo |
|---|---|
| `supabase-crm-keepalive.yml` | cron 10:17 e 22:17 UTC — mantém o projeto Supabase free ativo |
| `validate-dashboard.yml` | — |
| `visual-smoke.yml` | push em `feat/dashboard-image-to-nextjs` e PR para `main` |

**Achado relevante:** não existe workflow que rode os 171 testes unitários ou o `tsc` em push para `main`. A validação depende de execução manual.

---

## 3. Acesso ao Supabase

**Sim, tenho acesso — confirmado com chamadas reais.**

| Item | Valor |
|---|---|
| Projeto | `mpteambmrlflllfqtkmq` |
| URL | `https://mpteambmrlflllfqtkmq.supabase.co` |
| Credencial usada | `CRM_SUPABASE_SERVICE_ROLE_KEY` (do `.env` local) — permissão total, ignora RLS |
| Teste REST | `HTTP 200` no OpenAPI do PostgREST |
| Tabelas com prefixo `crm_` | **24** |

### 3.1 Tabelas existentes no banco (espelho real do PostgREST)

```
crm_agents            crm_ai_message_reservations   crm_ai_usage_events
crm_attendance_usage  crm_attendance_windows        crm_audit_events
crm_automations       crm_campaigns                 crm_channels
crm_contact_consents  crm_contact_tags              crm_contacts
crm_conversations     crm_handoffs                  crm_internal_notes
crm_knowledge_articles  crm_messages                crm_outbox
crm_tags              crm_tenant_memberships        crm_tenant_settings
crm_tenants           crm_upgrade_requests          crm_usage_limits
```

As 24 tabelas criadas pelas 16 migrations em `supabase/migrations/` **estão todas aplicadas**. Há 23 `create policy` (RLS) nos arquivos de migration.

### 3.2 Dados reais hoje no banco

| Tabela | Registros |
|---|---|
| `crm_tenants` | **2** — `NovaesWeb` (`3298bdbe…`, ativa) e `Loja camila` (`7af3571a…`, ativa) |
| `crm_channels` | **4** |
| `crm_contacts` | **3** — Lucas Alencar, +2 números de teste |
| `crm_conversations` | **3** — todas `resolved` / `mode = paused` |
| `crm_messages` | **92** — última em 11/11/2026 09:46 UTC (06:46 BRT), `inbound / customer` |
| `crm_agents` | **2** — `ketline` (10.069 caracteres de instrução) e `camila` (203) |
| `crm_knowledge_articles` | **1** — *"Informações da Loja e Cardápio"*, publicado |
| `crm_ai_usage_events` | **0** |
| `crm_upgrade_requests` | **0** |
| `crm_tenant_memberships` | 2 (owner + admin) |

### 3.3 Estrutura real de `crm_tenant_settings`

Colunas confirmadas: `tenant_id, timezone, business_description, human_handoff_enabled, ai_sending_enabled, campaigns_enabled, automation_execution_enabled, retention_days, updated_at`.

**Importante:** a configuração da loja **não** fica em colunas próprias — ela é um **JSON serializado dentro de `business_description`**. Isso é atípico e é o ponto mais frágil do banco hoje. Chaves encontradas no JSON:

- Tenant `3298bdbe` (NovaesWeb): `plan, recharges, ai_settings, description, paymentHistory, securitySettings, autoCloseSettings, master_plans_drafts, master_plans_catalog`
- Tenant `7af3571a` (Loja camila): `plan, businessDetails, teamOperators`

Ambos com `ai_sending_enabled = false`, `human_handoff_enabled = true`, `retention_days = 7`, `timezone = America/Sao_Paulo`.

### 3.4 Teste de RLS com a chave pública (anon)

```
crm_tenants         (anon): permission denied for table crm_tenants  [42501]
crm_tenant_settings (anon): permission denied for table crm_tenant_settings  [42501]
crm_contacts        (anon): permission denied
crm_messages        (anon): permission denied
```

**Resultado: bom.** A chave pública não lê nenhuma tabela. Não há vazamento direto por PostgREST anônimo.

**Ressalva:** isso significa também que o frontend **não** fala com o Supabase direto — todo acesso passa pelas 39 rotas de API do Next.js, que usam a service role. Toda a segurança de dados depende, portanto, da corretude dessas rotas, não do RLS.

### 3.5 Função `exec_sql`

Não existe no projeto (`PGRST202`). O `PROJECT_CONTEXT.md` afirma que "execução de comandos SQL diretos está habilitada via RPC `exec_sql`" — **essa informação está desatualizada/incorreta**.

---

## 4. Redis

**Acessível.** `redis://127.0.0.1:6379`, `PING → PONG` (rodando na máquina, porta 6379 escutando).

Estado atual — apenas **3 chaves** com prefixo `crm:*`:

| Chave | Significado |
|---|---|
| `crm:master_custom_password` | senha master customizada |
| `crm:quota:3298bdbe-…` | contador de franquia do tenant NovaesWeb |
| `crm:revoked_master:da9fa79e…` | token master revogado |

**Achados:**
1. `crm:master:plans` **não existe**. O catálogo de planos cai no fallback `DEFAULT_PLANS` do código (`plans.ts`). Ou seja, o catálogo editado pelo Master não está publicado no Redis.
2. Não há `crm:tenant:effective_plan:*`, então o cache de plano efetivo também não está populado.
3. O Redis está **vazio de dados operacionais** — todo o estado vive no Supabase.

---

## 5. Evolution API (WhatsApp)

**Acessível.** `https://satiable-crinkle-wimp.ngrok-free.dev` → `HTTP 200` em `fetchInstances`.

### Instâncias reais na Evolution

| Instância | Status Evolution | Status no CRM (`crm_channels`) | Dono |
|---|---|---|---|
| `novaesweb-ia-teste` | **open** (conectada, `555191189293`) | `connected` | NovaesWeb |
| `camila` | connecting | `connected` | NovaesWeb |
| `novaesweb_teste` | close (`555181964238`) | `connected` | NovaesWeb |
| `loja_loja_camila` | connecting | `disconnected` | Loja camila |

**Achado crítico:** o status no Supabase **não reflete** o status real da Evolution. `novaesweb_teste` está `close` na Evolution e `connected` no CRM; `camila` está `connecting` e o CRM diz `connected`.

### Webhook ativo da instância `novaesweb-ia-teste`

```json
{
  "url": "http://host.docker.internal:3040/api/evolution/webhook?secret=***",
  "headers": { "x-crm-webhook-secret": "***" },
  "enabled": true,
  "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
  "createdAt": "2026-11-06T21:07:11Z",
  "updatedAt": "2026-11-08T15:19:03Z"
}
```

Webhook **real e ativo**. Aponta para `host.docker.internal:3040` — ou seja, o CRM tem que estar rodando na máquina em Docker na porta 3040 para o WhatsApp funcionar.

---

## 6. OmniRoute (gateway de IA)

Rodando em `127.0.0.1:20128` (porta escutando).

- `/v1/models` → `HTTP 401` (exige autenticação, **sem a chave do `.env`** — o `AI_API_KEY` está no `.env`, mas o teste sem credencial foi negado, como esperado)
- `/` → `HTTP 307` (redireciona, provavelmente para a tela de login)

Configuração no `.env`:
```
AI_OPENAI_BASE_URL=http://127.0.0.1:20128/v1
AI_MODEL=auto/best-chat
AI_REPLY_ENABLED=true
```

Modelos citados no código (`src/lib/agent/ai.ts`): `groq/openai/gpt-oss-20b` como rota padrão e `auto/gpt` na lista de candidatos.

---

## 7. Serviços locais escutando

| Porta | Serviço |
|---|---|
| 3000 | provavelmente outro app Next.js |
| 3040 | **CRM (novaesweb-crm-ai)** — alvo do webhook |
| 6379 | Redis |
| 8080 | Evolution API local |
| 20128 | OmniRoute |

---

## 8. Como o sistema funciona — fluxo completo

```
WhatsApp do cliente
  → Evolution API (instância, ex.: novaesweb-ia-teste)
  → webhook POST /api/evolution/webhook?secret=...  (header x-crm-webhook-secret, comparação em tempo constante)
  → src/lib/agent/processor.ts (processWebhook)
      1. filtra events != messages.upsert e fromMe
      2. dedup em Redis
      3. carrega contexto da loja (fetchStoreContextByInstance) + plano efetivo
      4. bloqueia se loja suspensa / pagamento vencido / trial esgotado
      5. se mode == "human" → para, NÃO consome franquia
      6. checa horário de funcionamento
      7. detecta escalação (cliente pediu humano / irritado)
      8. trava anti-loop (>25 respostas de IA em 24h → transfere)
      9. gera resposta (ai.ts) com fallback se o plano permitir
     10. envia via Evolution API
     11. SÓ após envio confirmado: abre janela de 24h e soma 1 na franquia
  → Supabase (crm_contacts / crm_conversations / crm_messages)
  → Painel do cliente (polling, não WebSocket)
```

### Frontend — polling, não realtime

`ClientWorkspace.tsx` não usa `postgres_changes` nem WebSocket. Usa:
- **pulse a cada 1,5 s** (`/api/crm/operator/pulse`) para chat ao vivo e alertas de handoff
- auto-close a cada 45 s
- status do WhatsApp a cada 2 s (conectando) ou 8 s (normal)

---

## 9. Rotas e páginas

**10 páginas:** `/` (login cliente), `/cliente`, `/cliente/knowledge`, `/admin`, `/admin/ai-providers` (redirect), `/novaescrmadm` (login master secreto), `/operator` e `/operator/knowledge` (redirect p/ `/cliente`), `/reset-password`.

**39 rotas de API:** `crm/operator/*` (16), `crm/admin/*` (12), `crm/auth/*` (7), `crm/whatsapp/*` (2), `evolution/webhook` (1).

`src/middleware.ts` protege `/admin` (cookie `nw_master_session`), `/cliente` (cookie `nw_crm_session` ou master) e redireciona `/operator` → `/cliente`.

---

## 10. Planos comerciais — o código diverge da documentação

Lido direto de `src/lib/crm/plans.ts`:

| Plano | Preço | Franquia IA | WhatsApps | Operadores | Status |
|---|---|---|---|---|---|
| **CRM Premium** | R$ 89,90 | 1.200/mês | 3 | 3 | **ativo** |
| Teste Grátis | R$ 0,00 | 50 (7 dias) | 2 | 3 | ativo |
| CRM Start | R$ 59,90 | 200 | 1 | 1 | `inactive` (legado) |
| CRM Business | R$ 99,90 | 600 | 3 | 3 | `inactive` (legado) |

**Divergências encontradas:**
- O `CODEX_ARCHITECTURE_GUIDE.md` diz Premium custa `159,90`, franquia `1500`, 5 WhatsApps e 5 operadores. O código diz `89,90`, `1200`, `3` e `3`.
- O mesmo guia diz Start `200` msgs / Business `600` — isso bate — mas afirma que os três planos estão à venda, e no código Start e Business estão `inactive`.
- O guia fala em `CATALOG_SCHEMA_VERSION = 2` numa seção e `3` noutra; o código diz `3`.
- Recargas: R$ 20 = 100 msgs, R$ 40 = 200, R$ 90 = 500 (combo).

**O guia de arquitetura precisa ser corrigido** — hoje ele induz a erro quem for mexer em preços.

---

## 11. Validações executadas agora

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run test:agent` | ✅ **171 testes, 8 suítes, 0 falhas** (38,6 s) |
| `npx eslint .` | ⚠️ **17 erros, 57 avisos** |
| `npm run build` | não executado nesta rodada |
| `npm run test:e2e` (Playwright) | não executado (48 testes em 14 specs) |

### Os 17 erros de lint — todos em arquivos `scripts/*.js`

`add-sidebar-collapse.js`, `connect-workspace-collapse.js`, `apply-sidebar.js`, `apply-global-red-glow.js`, `apply-red-glow-cards.js`, `clean-client-workspace.js`, `sidebar-fill-height.js`, `sidebar-fixed-responsive.js`, `sidebar-fullheight-bigger-font.js`, `update-sidebar-logo.js`.

Tipo do erro: `@typescript-eslint/no-require-imports` e `no-explicit-any`.

Esses arquivos **não são código do app**: são scripts de patch que reescrevem `ClientWorkspace.tsx` e `ClientSidebar.tsx` por regex. O `next.config.ts` tem `eslint.ignoreDuringBuilds: true`, então o build passa — mas o `npm run lint` está vermelho por causa deles.

**Correção barata:** adicionar `"scripts/**"` ao array `ignores` do `eslint.config.mjs`.

---

## 12. Segredos — situação real

O `.gitignore` está correto: `.env` e `.env.ai-lab` **não** estão versionados (confirmado por `git ls-files`; só `*.example` estão no Git).

Mas existem segredos em texto puro em três lugares:

1. **`.env` e `.env.ai-lab` locais** — service role do Supabase, API key do Evolution, `CRM_MASTER_PASSWORD`, `CRM_MASTER_SESSION_SECRET`, `CRM_WEBHOOK_SECRET`.
2. **`src/lib/crm/master-auth.ts`, linha 219** — há uma **API key do Evolution escrita no código-fonte** como valor padrão de fallback (`139867a7…771e3`). Se o repositório é **público**, isso é uma credencial exposta. Precisa ser rotacionada.
3. **`.github/workflows/supabase-crm-keepalive.yml`** — a publishable key do Supabase está versionada. Chave publicável é feita para o cliente, então o risco é baixo, mas ainda é um valor fixo no repositório público.

---

## 13. Problemas encontrados — ordem de gravidade

### 🔴 Críticos

1. **Repositório público + API key de fallback no código** (`master-auth.ts:219`). Rotacionar a chave e remover o fallback embutido.
2. **Nenhum header de segurança HTTP** — não há `Content-Security-Policy`, `X-Frame-Options` nem `Strict-Transport-Security` em `next.config.ts` nem no middleware. Nada impede clickjacking do `/admin`.
3. **`.env` roda a service role do Supabase no servidor de desenvolvimento com `AI_REPLY_ENABLED=true`** — a IA pode responder sozinha no WhatsApp real `novaesweb-ia-teste` agora. O `docs/CRM_RELEASE_READINESS` diz que isso deveria ser `false` até homologação.
4. **Status de canal no banco não bate com a Evolution** — 3 dos 4 canais divergem. O painel mostra "conectado" para WhatsApp desconectado.

### 🟠 Altos

5. **`src/app/admin/page.tsx` com 7.294 linhas** e **`ClientWorkspace.tsx` com 7.080 linhas**. Receberam 6 alterações cada nos últimos 20 commits. É o maior risco de manutenção do projeto.
6. **Configuração em JSON dentro de `business_description`** — um JSON malformado derruba plano, horários, recargas e pagamentos da loja de uma vez. Não há schema validado nem migration possível por coluna.
7. **`crm:master:plans` ausente no Redis** — o catálogo editado no Master não está publicado; o sistema usa o `DEFAULT_PLANS` do código.
8. **Documentação divergente do código** em preços, franquias e limites (`CODEX_ARCHITECTURE_GUIDE.md` vs `plans.ts`).
9. **`PROJECT_CONTEXT.md` afirma `exec_sql` habilitado** — a função não existe.
10. **Nenhum teste roda no CI para `main`** — 171 testes e `tsc` só existem se alguém rodar à mão.

### 🟡 Médios

11. **`npm run lint` vermelho** (17 erros, todos em `scripts/`) — fácil de resolver.
12. **Polling de 1,5 s por aba aberta** — com vários operadores gera carga desnecessária; Supabase Realtime resolveria.
13. **`next.config.ts` com `eslint.ignoreDuringBuilds: true`** — o build nunca pega erro de lint.
14. **Duas entradas de login** (`/novaescrmadm` e `/`) e um `/operator` que só redireciona — a documentação ainda descreve `/operator/knowledge` como página viva.
15. **5 branches paradas sem push** e `feat/whatsapp-ai-lab` 2 commits atrás.
16. **2 scripts não commitados** (`add-sidebar-collapse.js`, `connect-workspace-collapse.js`).

---

## 14. O que está sólido

Para não parecer que só há problema — estas partes estão boas:

- **Separação multi-tenant** com `tenant_id` em todas as tabelas, 23 policies de RLS e `tenant-isolation.test.ts` cobrindo leitura, envio e canais cruzados.
- **Webhook autenticado** com `timingSafeEqual` em tempo constante, comprimento mínimo de segredo (32), header **ou** query string.
- **Sessão Master assinada por HMAC** com segredo dedicado, expiração, modo "lembrar-me", blacklist de revogação no Redis e rate limit (5 tentativas / 15 min) com OTP por WhatsApp.
- **Cobrança de franquia só após envio confirmado** — a ordem em `processor.ts` (passo 11) está correta e evita cobrar resposta que não saiu.
- **Governança de funcionalidades em 4 estados** (`allowed`, `locked_by_plan`, `maintenance`, `suspended`) validada *fail-closed* no servidor via `requireTenantFeature()`.
- **Horário de atendimento** respeitando o plano (básico no Start, com intervalo no Business/Premium).
- **Anti-loop de IA** (25 mensagens em 24h) e **transferência sem consumir franquia**.
- **171 testes passando** e **TypeScript sem erro**.
- **RLS bloqueando o acesso anônimo** de verdade.

---

## 15. Próximos passos sugeridos (em ordem)

1. Tornar o repositório **privado** e rotacionar a API key do Evolution em `master-auth.ts`.
2. Adicionar `"scripts/**"` aos `ignores` do ESLint → lint volta a zero.
3. Colocar `main` sob CI com `tsc`, `test:agent` e `lint` no push.
4. Corrigir `CODEX_ARCHITECTURE_GUIDE.md` (preços/limites) e `PROJECT_CONTEXT.md` (`exec_sql`).
5. Sincronizar o status dos canais com a Evolution (ou marcar como dado derivado, não persistido).
6. Publicar o catálogo de planos no Redis ou remover a dependência dele.
7. Adicionar headers de segurança no `next.config.ts`.
8. Quebrar `admin/page.tsx` e `ClientWorkspace.tsx` em módulos antes de mexer em preço ou plano.

---

## Fonte de cada afirmação

| Afirmação | Origem |
|---|---|
| Stack, versões, scripts | `package.json`, `package-lock.json` |
| Repositório público, último push | API `https://api.github.com/repos/Lkazin/crm-novaees` |
| 24 tabelas, contagens, estrutura de colunas | PostgREST do projeto `mpteambmrlflllfqtkmq` com service role |
| RLS bloqueando anon | mesma API, chave publishable |
| 3 chaves no Redis | `PING`/`KEYS crm:*` via `ioredis` em `127.0.0.1:6379` |
| 4 instâncias e status | `GET /instance/fetchInstances` na Evolution |
| Webhook ativo | `GET /webhook/find/novaesweb-ia-teste` na Evolution |
| OmniRoute 401 | `GET http://127.0.0.1:20128/v1/models` |
| Portas abertas | `netstat -an` |
| Preços e limites | `src/lib/crm/plans.ts`, linhas 390–470 |
| Fluxo da IA | `src/lib/agent/processor.ts`, `ai.ts` |
| Testes 171/171 | `npm run test:agent` |
| 0 erros TS | `npx tsc --noEmit` |
| 17 erros ESLint | `npx eslint .` |
| Ausência de headers | `next.config.ts` e `src/middleware.ts` lidos integralmente |
