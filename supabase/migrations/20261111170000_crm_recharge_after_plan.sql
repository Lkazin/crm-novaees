-- Migration: recarga passa a ser consumida DEPOIS da franquia do plano
--
-- COMO ESTAVA (verificado em 11/11/2026):
--   limite = quotaLimit + todas as recargas pagas
--   A recarga era somada ao plano e o cliente usava tudo junto. Uma recarga de
--   100 num plano de 1.200 virava simplesmente "limite 1.300" - impossivel saber
--   quantas mensagens do mes sao do plano e quantas sao da recarga. O saldo
--   exibido (rechargeCreditsBalance) nunca diminuia: ninguem escrevia em
--   crm:recharges:consumed, entao o cliente via "+100 disponiveis" para sempre.
--
-- COMO FICA:
--   O plano e consumido primeiro. A recarga so entra em uso quando o plano
--   acaba. O saldo de recarga cai conforme e usado e nao volta a subir.
--
--   crm_recharge_pool(tenant) -> total de mensagens pagas via recarga
--   crm_attendance_usage      -> consumo do MES (plano + recarga, sem distincao)
--   saldo de recarga = pool - greatest(0, usado - limite_do_plano)

-- Total de recargas pagas do tenant.
create or replace function public.crm_recharge_pool(p_tenant uuid)
returns integer
language plpgsql
set search_path to ''
as $function$
declare cfg jsonb; total integer;
begin
  cfg := public.crm_locked_config(p_tenant);
  select coalesce(sum((r->>'messagesAdded')::integer), 0) into total
  from jsonb_array_elements(coalesce(cfg->'recharges', '[]'::jsonb)) r
  where r->>'status' = 'paid';
  return coalesce(total, 0);
end $function$;

-- Quantas mensagens de recarga ja foram consumidas neste mes.
-- Zero enquanto o consumo estiver dentro do plano.
create or replace function public.crm_recharge_consumed(p_tenant uuid)
returns integer
language plpgsql
set search_path to ''
as $function$
declare cfg jsonb; p jsonb; plan_limit integer; used integer; period text; consumido integer;
begin
  cfg := public.crm_locked_config(p_tenant);
  p := public.crm_effective_stored_plan(cfg);

  if coalesce((p->>'isTrial')::boolean, false) or p->>'planId' = 'crm-trial' or p->>'status' = 'trial' then
    return 0;
  end if;

  plan_limit := coalesce((p->>'customQuotaOverride')::integer, (p->>'quotaLimit')::integer, 1200);
  period := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');

  select u.used into consumido from public.crm_attendance_usage u
  where u.tenant_id = p_tenant and u.period_key = period;

  consumido := coalesce(consumido, 0) - plan_limit;
  if consumido < 0 then return 0; end if;
  return least(consumido, public.crm_recharge_pool(p_tenant));
end $function$;

-- O limite continua sendo plano + recarga (o cliente pode usar tudo),
-- mas agora o consumo e rastreado em separado.
create or replace function public.crm_attendance_permission(p_tenant uuid, p_instance text, p_limit integer)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare cfg jsonb; p jsonb; trial boolean; lim integer; wa integer; slot integer; period text; recharges_added integer;
begin
 cfg:=public.crm_apply_due_plan(p_tenant); p:=public.crm_effective_stored_plan(cfg);
 if not exists(select 1 from public.crm_tenants where id=p_tenant and status='active') or
  coalesce((cfg->'suspension'->>'isSuspended')::boolean,false) or coalesce(cfg->'maintenanceFeatures','[]'::jsonb) ? 'ai_chat' then
  raise exception 'attendance_suspended' using errcode='42501';
 end if;
 trial:=coalesce((p->>'isTrial')::boolean,false) or p->>'planId'='crm-trial' or p->>'status'='trial';
 if trial then
  if coalesce(p->>'trialExpiresAt','')='' or (p->>'trialExpiresAt')::timestamptz<=now() then raise exception 'trial_expired' using errcode='42501'; end if;
  lim:=coalesce((p->>'quotaLimit')::integer, 100); wa:=coalesce((p->>'maxWhatsappConnections')::integer, 3); period:='trial';
 else
  if p->>'status'='pending' and coalesce((p->>'autoBlock')::boolean,true) and
   (p->>'dueDate')::timestamptz<now() then raise exception 'payment_overdue' using errcode='42501'; end if;
  lim:=coalesce((p->>'customQuotaOverride')::integer,(p->>'quotaLimit')::integer, 1200);
  wa:=coalesce((p->>'maxWhatsappConnections')::integer, 3);
  period:=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
 end if;

 -- Recargas pagas somam ao limite disponivel (o cliente pode usar plano + recarga).
 select coalesce(sum((r->>'messagesAdded')::integer), 0) into recharges_added
 from jsonb_array_elements(coalesce(cfg->'recharges', '[]'::jsonb)) r
 where r->>'status' = 'paid';

 lim := lim + coalesce(recharges_added, 0);

 if lim is null or lim<1 or p_limit<1 or p_limit is null then raise exception 'invalid_quota_limit' using errcode='22023'; end if;
 slot:=coalesce(substring(p_instance from '_([2-5])$')::integer,1);
 if slot>wa or not exists(select 1 from public.crm_channels where tenant_id=p_tenant and instance_name=p_instance and status<>'paused') then
  raise exception 'channel_not_allowed' using errcode='42501';
 end if;
 return jsonb_build_object('period',period,'limit',least(lim,p_limit),'config',cfg);
end $function$;

revoke all on function public.crm_recharge_pool(uuid) from public, anon, authenticated;
revoke all on function public.crm_recharge_consumed(uuid) from public, anon, authenticated;
grant execute on function public.crm_recharge_pool(uuid) to service_role;
grant execute on function public.crm_recharge_consumed(uuid) to service_role;
