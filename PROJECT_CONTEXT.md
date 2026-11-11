# NovaesWeb CRM AI - Contexto do Projeto para Antigravity / IA

## 1. Repositórios e Pastas do Ecossistema
- **CRM IA:** `C:\Users\camil\novaesweb-crm-ai` (Next.js 15, React 19, Supabase, Redis, Playwright).
  - Branch: `main`
  - Testes: `npm run test:agent` (168 testes aprovados).
  - Documentação central: `CODEX_ARCHITECTURE_GUIDE.md` e `CODEX_OPERATIONAL_GUIDE.md`.
- **App do Entregador:** `C:\Users\camil\painel-moto` (Cópia em `Downloads\painel motoboy`).
  - Remoto: `https://github.com/Lkazin/painel-moto.git`
  - Branch: `main` (commit `cf2363b`).
- **Backend / Logística da Loja:** `C:\Users\camil\entregado001`.
  - Remoto: `https://github.com/Lkazin/entregado001.git`
  - Branch: `main` (commit `41701d1`).

## 2. Supabase Mapeado
- **CRM IA (`mpteambmrlflllfqtkmq`):**
  - Conexão Total com chave de serviço no `.env`.
  - 25 tabelas ativas (tenants, conversas, contatos, agentes, etc.).
  - Execução de comandos SQL diretos habilitada via RPC `exec_sql`.
- **Painel Moto / Logística (`ngrkqutqmlhdenrxyaos`):**
  - Mapeado no `.env.local` de `entregado001`.
- **Loja / Delivery / Master (`mabkzkawziqlmgfikwmh`):**
  - Registrado na arquitetura do sistema.
