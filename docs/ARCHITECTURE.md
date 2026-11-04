# Arquitetura V1 — NovaesWeb CRM AI

**Fase:** planejamento. Stack sujeita ao inventário local.

## Fronteiras
1. **Painel Web:** Next.js/TypeScript, telas Master e cliente com RBAC.
2. **Backend de aplicação:** valida identidade, empresa, permissões, limites e configura agentes.
3. **Worker assíncrono:** valida webhooks, deduplica eventos, executa jobs com tentativas controladas e registra erros.
4. **WhatsApp Adapter:** Evolution API na V1 local; interface intercambiável para provedores oficiais.
5. **AI Adapter:** integração futura com gateway selecionado após verificar qual OmniRoute está instalado. Chaves somente em ambiente servidor.
6. **Supabase dedicado:** autenticação, dados de empresas, contatos, conversas, agentes, uso e auditoria. Não misturar com banco interno da Evolution.
7. **Redis:** fila e trava de processamento; não tratar Redis como repositório definitivo de conversas.

## Modelo multiempresa
Tabelas conceituais: tenants, memberships, agents, channels, contacts, conversations, messages, knowledge_entries, handoffs, usage_events, audit_events. Todas as entidades de negócio vinculadas ao tenant e protegidas por autorização no servidor e RLS no banco. ADMIN_MASTER é função interna controlada pelo servidor, não por dados editáveis no perfil.

## Fluxo-alvo
WhatsApp → Evolution API → webhook autenticado → verificação de origem e idempotência → fila → contexto da empresa → IA com limites → resposta registrada → envio ao WhatsApp. Se humano assumir, o agente não responde até liberação explícita.

## Não fazer na primeira entrega
Cobrança automática, disparos em massa, voz, integrações generalizadas, automações agressivas e app nativo.

## Critérios para habilitar empresas reais
Testar separação entre dois tenants, acesso indevido, vazamento de chaves, duplicidade de mensagens, retomada após falha, controle de custos, atendimento humano, política do WhatsApp e LGPD.
