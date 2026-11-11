-- =============================================================================
-- 4 + 5: RLS e policies explicitas
-- =============================================================================
-- 4. crm_channel_alert_state e crm_channel_alerts foram criadas sem RLS. Sao as
--    unicas tabelas crm_* nessa situacao. Na pratica o Supabase ja barra a anon
--    key (HTTP 401 no teste), mas depender disso e fragil: a proxima tabela pode
--    nao ter a mesma sorte.
--
-- 5. Seis tabelas tem RLS ligado e NENHUMA policy. Isso significa que ninguem
--    alem do service_role le — e se uma query usar a anon key, volta vazio em
--    silencio. Foi exatamente esse silencio que escondeu o bug da auditoria
--    (insert sem tenant_id falhando sem erro visivel).
--    Aqui cada uma ganha policy explicita de service_role, para o comportamento
--    ficar declarado e nao depender de ausencia de policy.
-- =============================================================================

-- ---- 4: ligar RLS nas tabelas do monitor de canais ----
alter table if exists public.crm_channel_alert_state enable row level security;
alter table if exists public.crm_channel_alerts enable row level security;

drop policy if exists crm_channel_alert_state_service on public.crm_channel_alert_state;
create policy crm_channel_alert_state_service on public.crm_channel_alert_state
  for all to service_role using (true) with check (true);

drop policy if exists crm_channel_alerts_service on public.crm_channel_alerts;
create policy crm_channel_alerts_service on public.crm_channel_alerts
  for all to service_role using (true) with check (true);

-- ---- 5: policy explicita nas tabelas que estavam sem nenhuma ----
-- crm_ai_message_reservations: reserva de quota antes de chamar a IA
do $$
begin
  if to_regclass('public.crm_ai_message_reservations') is not null then
    execute 'alter table public.crm_ai_message_reservations enable row level security';
    execute 'drop policy if exists crm_ai_message_reservations_service on public.crm_ai_message_reservations';
    execute 'create policy crm_ai_message_reservations_service on public.crm_ai_message_reservations for all to service_role using (true) with check (true)';
  end if;
end $$;

-- crm_attendance_usage: contador da franquia
do $$
begin
  if to_regclass('public.crm_attendance_usage') is not null then
    execute 'alter table public.crm_attendance_usage enable row level security';
    execute 'drop policy if exists crm_attendance_usage_service on public.crm_attendance_usage';
    execute 'create policy crm_attendance_usage_service on public.crm_attendance_usage for all to service_role using (true) with check (true)';
  end if;
end $$;

-- crm_attendance_windows: janelas de atendimento
do $$
begin
  if to_regclass('public.crm_attendance_windows') is not null then
    execute 'alter table public.crm_attendance_windows enable row level security';
    execute 'drop policy if exists crm_attendance_windows_service on public.crm_attendance_windows';
    execute 'create policy crm_attendance_windows_service on public.crm_attendance_windows for all to service_role using (true) with check (true)';
  end if;
end $$;

-- crm_audit_events: trilha de auditoria
do $$
begin
  if to_regclass('public.crm_audit_events') is not null then
    execute 'alter table public.crm_audit_events enable row level security';
    execute 'drop policy if exists crm_audit_events_service on public.crm_audit_events';
    execute 'create policy crm_audit_events_service on public.crm_audit_events for all to service_role using (true) with check (true)';
  end if;
end $$;

-- crm_outbox: fila de envio
do $$
begin
  if to_regclass('public.crm_outbox') is not null then
    execute 'alter table public.crm_outbox enable row level security';
    execute 'drop policy if exists crm_outbox_service on public.crm_outbox';
    execute 'create policy crm_outbox_service on public.crm_outbox for all to service_role using (true) with check (true)';
  end if;
end $$;

-- crm_upgrade_requests: pedidos de upgrade
do $$
begin
  if to_regclass('public.crm_upgrade_requests') is not null then
    execute 'alter table public.crm_upgrade_requests enable row level security';
    execute 'drop policy if exists crm_upgrade_requests_service on public.crm_upgrade_requests';
    execute 'create policy crm_upgrade_requests_service on public.crm_upgrade_requests for all to service_role using (true) with check (true)';
  end if;
end $$;

-- ---- verificacao: nenhuma tabela crm_* pode ficar sem RLS ----
do $$
declare
  faltando text;
begin
  select string_agg(tablename, ', ') into faltando
  from pg_tables
  where schemaname = 'public' and tablename like 'crm\_%' and rowsecurity = false;
  if faltando is not null then
    raise warning 'Tabelas crm_* ainda sem RLS: %', faltando;
  end if;
end $$;
