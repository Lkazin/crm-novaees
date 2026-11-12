-- =============================================================================
-- Cancelamento e exclusao de conta pedidos pelo proprio cliente
-- =============================================================================
-- Regra do produto:
--   - o cliente pede o cancelamento dentro do painel;
--   - o painel continua ATIVO ate o fim do ciclo ja pago;
--   - no fim do ciclo os dados sao excluidos em definitivo;
--   - apos a exclusao nao existe volta: o mesmo e-mail/CNPJ comeca do zero.
--
-- Nada e apagado no ato do pedido: a exclusao so acontece depois do fim do
-- ciclo, e o pedido pode ser cancelado pelo cliente antes disso.
-- =============================================================================

create table if not exists public.crm_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requested_by text,
  reason text,
  status text not null default 'scheduled',
  -- fim do ciclo ja pago: e ate aqui que o painel continua ativo
  active_until timestamptz not null,
  -- quando a exclusao definitiva deve rodar
  purge_after timestamptz not null,
  cancelled_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_deletion_requests_status_check'
  ) then
    alter table public.crm_deletion_requests
      add constraint crm_deletion_requests_status_check
      check (status in ('scheduled', 'cancelled', 'purged'));
  end if;
end $$;

-- Um pedido ativo por empresa.
create unique index if not exists crm_deletion_requests_one_active_idx
  on public.crm_deletion_requests (tenant_id)
  where status = 'scheduled';

create index if not exists crm_deletion_requests_purge_idx
  on public.crm_deletion_requests (purge_after)
  where status = 'scheduled';

alter table public.crm_deletion_requests enable row level security;

drop policy if exists crm_deletion_requests_service on public.crm_deletion_requests;
create policy crm_deletion_requests_service on public.crm_deletion_requests
  for all to service_role using (true) with check (true);

-- ---- verificacao final: nenhuma crm_* sem RLS ----
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
