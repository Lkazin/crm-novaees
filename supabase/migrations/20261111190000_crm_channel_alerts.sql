-- Migration: estado do monitor de canais + fila de alertas do Master
--
-- O Radar de WhatsApp ja MOSTRA os canais, mas ninguem e avisado quando um cai.
-- Este monitor roda periodicamente, compara o estado real da Evolution com o
-- status gravado em crm_channels e avisa o Master por WhatsApp quando:
--   * um canal que estava conectado cai (alerta imediato)
--   * um canal segue caido e o alerta ainda nao foi resolvido (lembrete 6h)
--   * o canal volta (aviso de recuperacao, uma unica vez)
--
-- crm_channel_alert_state guarda o estado anterior para detectar a TRANSICAO
-- (nao alertamos a cada ciclo, so quando muda).

create table if not exists public.crm_channel_alert_state (
  tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
  channel_id uuid not null references public.crm_channels(id) on delete cascade,
  instance_name text not null,
  last_status text not null,
  last_alert_at timestamptz,
  last_alert_kind text,
  last_recovered_at timestamptz,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, channel_id)
);

create index if not exists crm_channel_alert_state_down_idx
  on public.crm_channel_alert_state (last_status, last_alert_at)
  where last_status <> 'connected';

-- Registro dos alertas enviados, para auditoria e para nao repetir mensagem.
create table if not exists public.crm_channel_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
  channel_id uuid references public.crm_channels(id) on delete set null,
  instance_name text not null,
  kind text not null check (kind in ('down', 'reminder', 'recovered')),
  phone text,
  delivered boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists crm_channel_alerts_created_idx
  on public.crm_channel_alerts (created_at desc);
