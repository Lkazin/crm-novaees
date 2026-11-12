-- =============================================================================
-- Purge: exclusao definitiva dos dados de uma empresa
-- =============================================================================
-- Chamado quando crm_deletion_requests.purge_after vence. Roda numa unica
-- transacao: ou apaga tudo, ou nao apaga nada.
--
-- A ordem segue as foreign keys (filho antes do pai), levantada de
-- information_schema. crm_tenants fica por ultimo.
-- =============================================================================

create or replace function public.crm_purge_tenant(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_tabela text;
  v_ordem text[] := array[
    'crm_outbox',
    'crm_messages',
    'crm_ai_usage_events',
    'crm_handoffs',
    'crm_internal_notes',
    'crm_conversations',
    'crm_contact_consents',
    'crm_contact_tags',
    'crm_contacts',
    'crm_tags',
    'crm_channel_alert_state',
    'crm_channel_alerts',
    'crm_channels',
    'crm_knowledge_articles',
    'crm_knowledge_articles_history',
    'crm_agents',
    'crm_ai_message_reservations',
    'crm_attendance_usage',
    'crm_attendance_windows',
    'crm_audit_events',
    'crm_automations',
    'crm_campaigns',
    'crm_quality_events',
    'crm_tenant_memberships',
    'crm_tenant_settings',
    'crm_upgrade_requests',
    'crm_usage_limits'
  ];
begin
  if p_tenant is null then
    raise exception 'tenant obrigatorio';
  end if;

  foreach v_tabela in array v_ordem loop
    execute format('delete from public.%I where tenant_id = $1', v_tabela)
      using p_tenant;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(v_tabela, v_n);
    end if;
  end loop;

  delete from public.crm_tenants where id = p_tenant;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('crm_tenants', v_n);

  return v_counts;
end;
$$;

revoke all on function public.crm_purge_tenant(uuid) from public;
revoke all on function public.crm_purge_tenant(uuid) from anon;
revoke all on function public.crm_purge_tenant(uuid) from authenticated;
grant execute on function public.crm_purge_tenant(uuid) to service_role;

-- ---- verificacao ----
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'crm_purge_tenant'
  ) then
    raise exception 'crm_purge_tenant nao foi criada';
  end if;
end $$;
