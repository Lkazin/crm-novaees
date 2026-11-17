-- Enables up to 20 total accesses. No existing tenant or membership is modified.
-- Back up current function definitions before applying in the target database.
begin;
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
 update public.crm_channels set status=case when substring(instance_name from '_([2-5])$')::integer>wa then 'paused'
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
commit;
