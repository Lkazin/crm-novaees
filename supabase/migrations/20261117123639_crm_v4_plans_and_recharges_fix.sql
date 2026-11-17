-- Migration: Reconcile CRM v4 plans (Essencial / Profissional / Empresarial / Trial),
-- 20-operator governance limit, annual billing lock, slot-1 numeric-suffix fix, and recharge consumption deduction.

create or replace function public.crm_enforce_operator_limit(p_tenant uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; lim integer; paused uuid[];
begin
 cfg := public.crm_locked_config(p_tenant);
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid_operator_limit' using errcode='22023'; end if;
 lim := least(p_limit,coalesce((public.crm_effective_stored_plan(cfg)->>'maxOperators')::integer,p_limit));
 with ranked as (
  select user_id,row_number() over(order by case role when 'owner' then 0 when 'admin' then 1 else 2 end,created_at,user_id) rn
  from public.crm_tenant_memberships where tenant_id=p_tenant and is_active
 ), changed as (
  update public.crm_tenant_memberships m set is_active=false from ranked r
  where m.tenant_id=p_tenant and m.user_id=r.user_id and r.rn>lim returning m.user_id
 ) select array_agg(user_id) into paused from changed;
 return jsonb_build_object('pausedUserIds',coalesce(paused,'{}'::uuid[]),'activeCount',
  (select count(*) from public.crm_tenant_memberships where tenant_id=p_tenant and is_active));
end $$;

create or replace function public.crm_apply_due_plan(p_tenant uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; p jsonb; pend jsonb; wa integer; ops integer;
begin
 cfg:=public.crm_locked_config(p_tenant); p:=cfg->'plan'; pend:=p->'pendingPlanUpdate';
 if pend is null or (pend->>'effectiveAt')::timestamptz>now() then return cfg; end if;
 if pend->>'effectiveAt' is null then raise exception 'invalid_pending_plan'; end if;
 p := (p-'pendingPlanUpdate') || jsonb_build_object(
  'quotaLimit',pend->'quotaLimit','price',pend->'price','maxOperators',pend->'maxOperators',
  'maxWhatsappConnections',pend->'maxWhatsappConnections','contractedPlan',
  jsonb_build_object('quotaLimit',pend->'quotaLimit','features',pend->'features','price',pend->'price',
   'maxOperators',pend->'maxOperators','maxWhatsappConnections',pend->'maxWhatsappConnections',
   'version',pend->'planVersion','contractedAt',now()));
 cfg:=jsonb_set(cfg,'{plan}',p);
 update public.crm_tenant_settings set business_description=cfg::text,updated_at=now() where tenant_id=p_tenant;
 wa:=(pend->>'maxWhatsappConnections')::integer; ops:=(pend->>'maxOperators')::integer;
 if wa is null or ops is null or wa not between 1 and 5 or ops not between 1 and 20 then raise exception 'invalid_pending_limits'; end if;
 update public.crm_channels set status=case when substring(instance_name from '_([2-5])$')::integer>wa
   and exists(select 1 from public.crm_channels c2 where c2.tenant_id=p_tenant and c2.instance_name=regexp_replace(crm_channels.instance_name,'_[2-5]$','')) then 'paused'
   when status='paused' then 'disconnected' else status end where tenant_id=p_tenant;
 perform public.crm_enforce_operator_limit(p_tenant,ops);
 return cfg;
end $$;

create or replace function public.crm_add_operator_membership(p_tenant uuid,p_user uuid,p_role text,p_max integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; lim integer; n integer;
begin
 cfg:=public.crm_apply_due_plan(p_tenant);
 if p_role is null or p_role not in ('admin','agent','viewer') or p_max is null or p_max not between 1 and 20 then raise exception 'invalid_membership' using errcode='22023'; end if;
 if coalesce((cfg->'suspension'->>'isSuspended')::boolean,false) or not exists(select 1 from public.crm_tenants where id=p_tenant and status='active') then raise exception 'tenant_inactive' using errcode='42501'; end if;
 lim:=least(p_max,coalesce((public.crm_effective_stored_plan(cfg)->>'maxOperators')::integer,p_max));
 select count(*) into n from public.crm_tenant_memberships where tenant_id=p_tenant and is_active;
 if exists(select 1 from public.crm_tenant_memberships where tenant_id=p_tenant and user_id=p_user and is_active) then
  return jsonb_build_object('added',false,'count',n);
 end if;
 if n>=lim then raise exception 'operator_limit_reached' using errcode='23514'; end if;
 insert into public.crm_tenant_memberships(tenant_id,user_id,role,is_active) values(p_tenant,p_user,p_role,true)
 on conflict(tenant_id,user_id) do update set role=excluded.role,is_active=true;
 return jsonb_build_object('added',true,'count',n+1);
end $$;

create or replace function public.crm_attendance_permission(p_tenant uuid, p_instance text, p_limit integer)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare cfg jsonb; p jsonb; trial boolean; lim integer; wa integer; slot integer; raw_slot integer; period text; recharges_added integer; recharges_consumed integer; net_recharges integer;
begin
 cfg:=public.crm_apply_due_plan(p_tenant); p:=public.crm_effective_stored_plan(cfg);
 if not exists(select 1 from public.crm_tenants where id=p_tenant and status='active') or
  coalesce((cfg->'suspension'->>'isSuspended')::boolean,false) or coalesce(cfg->'maintenanceFeatures','[]'::jsonb) ? 'ai_chat' then
  raise exception 'attendance_suspended' using errcode='42501';
 end if;
 trial:=coalesce((p->>'isTrial')::boolean,false) or p->>'planId'='crm-trial' or p->>'status'='trial';
 if trial then
  if coalesce(p->>'trialExpiresAt','')='' or (p->>'trialExpiresAt')::timestamptz<=now() then raise exception 'trial_expired' using errcode='42501'; end if;
  lim:=coalesce((p->>'quotaLimit')::integer, 50); wa:=coalesce((p->>'maxWhatsappConnections')::integer, 1); period:='trial';
 else
  if coalesce(p->>'billingCycle','monthly')='annual' and coalesce(p->>'status','pending')<>'paid' then
   raise exception 'annual_payment_pending' using errcode='42501';
  end if;
  if p->>'status'='pending' and coalesce((p->>'autoBlock')::boolean,true) and
   (p->>'dueDate')::timestamptz<now() then raise exception 'payment_overdue' using errcode='42501'; end if;
  lim:=coalesce((p->>'customQuotaOverride')::integer,(p->>'quotaLimit')::integer, 300);
  wa:=coalesce((p->>'maxWhatsappConnections')::integer, 1);
  period:=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
 end if;

 select coalesce(sum((r->>'messagesAdded')::integer), 0) into recharges_added
 from jsonb_array_elements(coalesce(cfg->'recharges', '[]'::jsonb)) r
 where r->>'status' = 'paid';

 recharges_consumed := coalesce((cfg->'usageCounters'->>'rechargesConsumed')::integer, 0);
 net_recharges := greatest(0, coalesce(recharges_added, 0) - greatest(0, recharges_consumed));
 lim := lim + net_recharges;

 if lim is null or lim<1 or p_limit<1 or p_limit is null then raise exception 'invalid_quota_limit' using errcode='22023'; end if;

 raw_slot := coalesce(substring(p_instance from '_([2-5])$')::integer, 1);
 if raw_slot > 1 and not exists(
   select 1 from public.crm_channels c where c.tenant_id=p_tenant and c.instance_name=regexp_replace(p_instance,'_[2-5]$','')
 ) then
  -- Store name ending in digit (e.g. "Loja 2" -> "loja_loja_2") uses this suffix on slot 1 unless there is an earlier channel.
  if not exists(select 1 from public.crm_channels c where c.tenant_id=p_tenant and c.instance_name<>p_instance and c.status<>'paused') then
   slot := 1;
  else
   slot := raw_slot;
  end if;
 else
  slot := raw_slot;
 end if;

 if slot>wa or not exists(select 1 from public.crm_channels where tenant_id=p_tenant and instance_name=p_instance and status<>'paused') then
  raise exception 'channel_not_allowed' using errcode='42501';
 end if;
 return jsonb_build_object('period',period,'limit',least(lim,p_limit),'config',cfg);
end $function$;

create or replace function public.crm_ai_message_permission(p_tenant uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; p jsonb; max_slot integer; raw_slot integer; requested_slot integer;
begin
 perm:=public.crm_attendance_permission(p_tenant,p_instance,p_limit);
 p:=public.crm_effective_stored_plan(perm->'config');
 max_slot:=case p->>'planId'
  when 'crm-trial' then 1
  when 'crm-essential' then 1
  when 'crm-professional' then 3
  when 'crm-enterprise' then 5
  when 'crm-start' then 1
  when 'crm-business' then 3
  when 'crm-premium' then 5
  else null end;
 if max_slot is null then raise exception 'unknown_commercial_plan' using errcode='42501'; end if;
 raw_slot:=coalesce(substring(p_instance from '_([2-5])$')::integer,1);
 if raw_slot > 1 and not exists(
   select 1 from public.crm_channels c where c.tenant_id=p_tenant and c.instance_name=regexp_replace(p_instance,'_[2-5]$','')
 ) and not exists(
   select 1 from public.crm_channels c where c.tenant_id=p_tenant and c.instance_name<>p_instance and c.status<>'paused'
 ) then
  requested_slot := 1;
 else
  requested_slot := raw_slot;
 end if;
 if requested_slot<1 or requested_slot>max_slot then raise exception 'channel_not_allowed_by_tier' using errcode='42501'; end if;
 return perm;
end $$;
