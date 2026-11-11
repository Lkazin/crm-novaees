-- Migration: liberar o disparo automatico da IA (ai_sending_enabled)
--
-- A tabela crm_tenant_settings foi criada (20261104231721) com
--   ai_sending_enabled boolean not null default false check (ai_sending_enabled = false)
-- ou seja: a coluna existia, mas era IMPOSSIVEL ligar. Qualquer UPDATE para true
-- violava a constraint e o disparo automatico nunca poderia ser ativado.
--
-- O kill-switch real do envio continua sendo a variavel de ambiente
-- AI_REPLY_ENABLED (src/lib/agent/config.ts) e, por tenant, o guard
-- src/lib/crm/outbound-guard.ts (status do tenant, suspensao, plano, modo da
-- conversa). Esta migration apenas remove a trava que tornava a coluna inutil.
--
-- campaigns_enabled e automation_execution_enabled permanecem travados em false
-- de proposito: sao modulos ainda nao ligados no produto.

alter table public.crm_tenant_settings
  drop constraint if exists crm_tenant_settings_ai_sending_enabled_check;

alter table public.crm_tenant_settings
  add constraint crm_tenant_settings_ai_sending_enabled_check
  check (ai_sending_enabled in (true, false));
