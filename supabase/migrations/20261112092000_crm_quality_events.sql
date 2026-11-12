-- =============================================================================
-- Fase 4: eventos de qualidade do atendimento (indicadores do Painel Master)
-- =============================================================================
-- Cada linha e um fato verificado, nao uma estimativa. Nada aqui e calculado
-- por heuristica no painel: o painel so agrega o que foi gravado.
--
-- Origens:
--   unauthorized_url    -> commercial-guard.findUnauthorizedUrls na resposta
--   unauthorized_price  -> commercial-guard.findUnauthorizedPrices na resposta
--   mixed_catalogs      -> commercial-guard.mixesCatalogs na resposta
--   duplicate_reply     -> mesmo texto para a mesma conversa dentro da janela
--   send_failure        -> envio pela Evolution falhou
--   human_handoff       -> conversa transferida para atendente
--   slow_reply          -> latencia acima do limite configurado
-- =============================================================================

create table if not exists public.crm_quality_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid,
  message_id uuid,
  kind text not null,
  severity text not null default 'warn',
  detail jsonb not null default '{}'::jsonb,
  latency_ms integer,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_quality_events_kind_check'
  ) then
    alter table public.crm_quality_events
      add constraint crm_quality_events_kind_check
      check (kind in (
        'unauthorized_url',
        'unauthorized_price',
        'mixed_catalogs',
        'duplicate_reply',
        'send_failure',
        'human_handoff',
        'slow_reply'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'crm_quality_events_severity_check'
  ) then
    alter table public.crm_quality_events
      add constraint crm_quality_events_severity_check
      check (severity in ('info', 'warn', 'error'));
  end if;
end $$;

create index if not exists crm_quality_events_tenant_created_idx
  on public.crm_quality_events (tenant_id, created_at desc);

create index if not exists crm_quality_events_kind_idx
  on public.crm_quality_events (tenant_id, kind, created_at desc);

-- Revisao humana: indicador semantico so conta como resolvido depois de revisado.
create index if not exists crm_quality_events_pending_review_idx
  on public.crm_quality_events (tenant_id, created_at desc)
  where reviewed_at is null;

alter table public.crm_quality_events enable row level security;

drop policy if exists crm_quality_events_service on public.crm_quality_events;
create policy crm_quality_events_service on public.crm_quality_events
  for all to service_role using (true) with check (true);

-- ---- verificacao final ----
do $$
declare
  sem_rls int;
begin
  select count(*) into sem_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname like 'crm\_%'
    and c.relkind = 'r'
    and not c.relrowsecurity;
  if sem_rls > 0 then
    raise warning 'tabelas crm_* sem RLS: %', sem_rls;
  end if;
end $$;
