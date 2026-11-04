# NovaesWeb CRM AI

Sistema independente de CRM e atendimento com IA, integrado à Evolution API e com gateway OmniRoute para múltiplos provedores.

## Estado atual — 04/11/2026

- Interface responsiva de acesso privado e caixa de entrada real somente leitura (sem clientes ou KPIs de demonstração).
- Dashboard, contatos e relatórios exibem apenas os dados disponíveis na caixa de entrada.
- Telas de agentes, conexões e configurações mostram o estado de configuração validável, sem alterar chaves.
- IA: teste local CRM → OmniRoute → Groq relatado como bem-sucedido pelo operador.
- Webhook autenticado preparado; envio automático desligado.
- Registro de mensagens recebidas em Redis é opt-in, retém até sete dias e está **desligado por padrão**.
- Supabase CRM isolado com 10 tabelas operacionais, RLS, integridade entre empresas, e índices de relações — migrations aplicadas em 04/11/2026.
- As tabelas operacionais do Supabase ainda não estão ligadas à caixa de entrada Redis, e não há nenhum cliente de produção cadastrado.
- Alternância opcional para até duas rotas adicionais de modelo de IA, somente após configuração explícita e aprovação de provedores no OmniRoute.

**Esta versão não está pronta para receber clientes reais.** Faltam autenticação individual por empresa, histórico durável, atendimento humano, confirmação de entregas, fila/worker, observabilidade, política LGPD e homologação do webhook real. Não é correto habilitar `AI_REPLY_ENABLED=true` neste estágio.

## Código, documentação e scripts

- `src/app/page.tsx` — UI do CRM privado, leitura de dados reais.
- `src/app/api/crm/inbox/route.ts` — caixa de entrada protegida por token local.
- `src/app/api/crm/status/route.ts` — estado da Evolution e das rotas de IA.
- `src/app/api/evolution/webhook/route.ts` — recepção com segredo.
- `src/lib/crm/inbox.ts` — captura opt-in com deduplicação atômica.
- `src/lib/agent/ai.ts` — geração com fallback opcional delimitado.
- `supabase/migrations/` — evolução auditável do schema.
- `scripts/validate-crm-local.ps1` — amanhã atualizar somente o CRM no Docker e executar testes sem WhatsApp.
- `scripts/prepare-client-support.ps1` — verifica a instância escolhida `novaesweb-ia-teste` e o webhook atual, sem alterá-lo.

## Verificação local (quando estiver no computador)

Na pasta do projeto e após atualizar a branch:

```powershell
git pull origin feat/whatsapp-ai-lab
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\prepare-client-support.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\validate-crm-local.ps1"
```

O segundo script atualiza somente os serviços do projeto Compose `novaesweb-crm-ai-lab`. Não muda nem reinicia os containers da Evolution, do OmniRoute, do Master ou do Entregador.

Painel local: `http://localhost:3040`. Acesso requer o `CRM_LAB_ADMIN_TOKEN` definido no arquivo local `.env.ai-lab`; não compartilhe esse token.

Veja `docs/CRM_REAL_INBOX.md` e `docs/CRM_RELEASE_READINESS_2026-11-04.md` para limitações, segurança e plano de homologação.
