-- Migration: crm_audit_events deixa de rejeitar ids que nao sao UUID
--
-- PROBLEMA (verificado em 11/11/2026):
--   crm_audit_events.entity_id e uuid. O codigo (plans.ts) grava ali o id do
--   plano, que e um slug de texto ('crm-premium', 'crm-trial'). O insert falhava
--   com 22P02 (invalid input syntax for type uuid) e o catch vazio escondia o
--   erro. Resultado: a tabela de auditoria tinha 0 linhas desde o inicio.
--   Alem disso o insert nao enviava tenant_id, que e NOT NULL.
--
-- CORRECAO:
--   entity_id passa a ser text (aceita slug de plano e qualquer id futuro) e
--   ganha entity_label para o nome legivel no momento do evento.

alter table public.crm_audit_events
  alter column entity_id type text using entity_id::text;

alter table public.crm_audit_events
  add column if not exists entity_label text;

create index if not exists crm_audit_events_tenant_created_idx
  on public.crm_audit_events (tenant_id, created_at desc);
