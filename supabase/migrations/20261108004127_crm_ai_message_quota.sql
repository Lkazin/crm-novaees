-- One accepted, generated AI reply = one quota unit, including replies to the same
-- contact within 24h. Existing usage is retained; no historical data is deleted.
-- Deploy this migration before the application. Legacy RPCs are left in place
-- solely for rolling deployment; the new application never calls them.
create table public.crm_ai_message_reservations (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 token uuid not null,
 instance_name text not null,
 message_keys text[] not null check(cardinality(message_keys)>0 and cardinality(message_keys)<=100),
 state text not null check(state in ('reserved','dispatching','committed','released')),
 period_key text not null check(period_key='trial' or period_key ~ '^[0-9]{4}-[0-9]{2}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,token)
);
create index crm_ai_message_keys on public.crm_ai_message_reservations using gin(message_keys);
create index crm_ai_message_pending on public.crm_ai_message_reservations(tenant_id,period_key,state);
alter table public.crm_ai_message_reservations enable row level security;
revoke all on public.crm_ai_message_reservations from public,anon,authenticated;
grant all on public.crm_ai_message_reservations to service_role;

-- Stored contracts may have legacy excessive WhatsApp limits. The canonical
-- commercial tier is an upper bound even before that contract is reconciled.
create function public.crm_ai_message_permission(p_tenant uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; p jsonb; max_slot integer; requested_slot integer;
begin
 perm:=public.crm_attendance_permission(p_tenant,p_instance,p_limit);
 p:=public.crm_effective_stored_plan(perm->'config');
 max_slot:=case p->>'planId' when 'crm-trial' then 1 when 'crm-start' then 1
  when 'crm-business' then 3 when 'crm-premium' then 5 else null end;
 if max_slot is null then raise exception 'unknown_commercial_plan' using errcode='42501'; end if;
 requested_slot:=coalesce(substring(p_instance from '_([0-9]+)$')::integer,1);
 if requested_slot<1 or requested_slot>max_slot then raise exception 'channel_not_allowed_by_tier' using errcode='42501'; end if;
 return perm;
end $$;

create function public.crm_reserve_ai_message(
 p_tenant uuid,p_message_keys text[],p_instance text,p_token uuid,p_limit integer,
 p_floor integer default 0,p_floor_period text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; period text; lim integer; cfg jsonb; baseline integer; n integer; pending integer; fresh_keys text[];
begin
 if p_token is null or p_instance is null or p_message_keys is null or cardinality(p_message_keys) not between 1 and 100
  or exists(select 1 from unnest(p_message_keys) k where k is null or k !~ '^[a-f0-9]{64}$') then
  raise exception 'invalid_message_reservation' using errcode='22023';
 end if;
 -- The same advisory lock is shared with plan changes and operator governance.
 perm:=public.crm_ai_message_permission(p_tenant,p_instance,p_limit);
 period:=perm->>'period'; lim:=(perm->>'limit')::integer; cfg:=perm->'config';
 -- A dispatch whose provider result was uncertain never expires automatically.
 update public.crm_ai_message_reservations set state='released',updated_at=now()
 where tenant_id=p_tenant and state='reserved' and updated_at<now()-interval '5 minutes';
 if exists(select 1 from public.crm_ai_message_reservations where tenant_id=p_tenant
  and message_keys && p_message_keys and state in ('reserved','dispatching')) then
  return jsonb_build_object('allowed',false,'reason','message_busy');
 end if;
 -- A retry may be buffered together with a new event. Keep the new event instead
 -- of marking the entire mixed batch as duplicate and losing an unanswered message.
 select array_agg(distinct k) into fresh_keys from unnest(p_message_keys) k
 where not exists(select 1 from public.crm_ai_message_reservations r where r.tenant_id=p_tenant
  and r.state='committed' and r.message_keys @> array[k]);
 if fresh_keys is null then return jsonb_build_object('allowed',false,'reason','message_already_processed'); end if;
 baseline:=greatest(0,case when p_floor_period=period then coalesce(p_floor,0) else 0 end,
  case when period='trial' then coalesce((cfg->'usageCounters'->>'trialUsed')::integer,0)
  else coalesce((cfg->'usageCounters'->'monthly'->>period)::integer,0) end);
 insert into public.crm_attendance_usage(tenant_id,period_key,used) values(p_tenant,period,baseline)
 on conflict(tenant_id,period_key) do update set used=greatest(crm_attendance_usage.used,excluded.used);
 select used into n from public.crm_attendance_usage where tenant_id=p_tenant and period_key=period;
 select count(*) into pending from public.crm_ai_message_reservations
 where tenant_id=p_tenant and period_key=period and state in ('reserved','dispatching');
 -- Include in-flight replies from the previous application during a rolling update.
 pending:=pending+(select count(*) from public.crm_attendance_windows where tenant_id=p_tenant
  and period_key=period and new_window and state in ('reserved','dispatching'));
 if n+pending>=lim then return jsonb_build_object('allowed',false,'reason','quota_exceeded','used',n); end if;
 insert into public.crm_ai_message_reservations(tenant_id,token,instance_name,message_keys,state,period_key)
 values(p_tenant,p_token,p_instance,fresh_keys,'reserved',period);
 return jsonb_build_object('allowed',true,'token',p_token,'period',period,'used',n,'newWindow',false);
end $$;

create function public.crm_dispatch_ai_message(p_tenant uuid,p_token uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; r public.crm_ai_message_reservations%rowtype; n integer; pending integer; baseline integer;
begin
 perm:=public.crm_ai_message_permission(p_tenant,p_instance,p_limit);
 select * into r from public.crm_ai_message_reservations where tenant_id=p_tenant and token=p_token;
 if not found or r.instance_name<>p_instance or r.state<>'reserved' or r.updated_at<now()-interval '5 minutes' then
  raise exception 'message_reservation_not_ready' using errcode='42501';
 end if;
 -- Bill the calendar period in effect immediately before provider dispatch.
 if r.period_key<>perm->>'period' then
  baseline:=case when perm->>'period'='trial' then coalesce((perm->'config'->'usageCounters'->>'trialUsed')::integer,0)
   else coalesce((perm->'config'->'usageCounters'->'monthly'->>(perm->>'period'))::integer,0) end;
  insert into public.crm_attendance_usage(tenant_id,period_key,used) values(p_tenant,perm->>'period',baseline)
  on conflict(tenant_id,period_key) do update set used=greatest(crm_attendance_usage.used,excluded.used);
  update public.crm_ai_message_reservations set period_key=perm->>'period' where tenant_id=p_tenant and token=p_token;
  r.period_key:=perm->>'period';
 end if;
 select used into n from public.crm_attendance_usage where tenant_id=p_tenant and period_key=r.period_key;
 select count(*) into pending from public.crm_ai_message_reservations where tenant_id=p_tenant
  and period_key=r.period_key and state in ('reserved','dispatching');
 pending:=pending+(select count(*) from public.crm_attendance_windows where tenant_id=p_tenant
  and period_key=r.period_key and new_window and state in ('reserved','dispatching'));
 if n is null or n+pending>(perm->>'limit')::integer then raise exception 'quota_limit_changed' using errcode='42501'; end if;
 update public.crm_ai_message_reservations set state='dispatching',updated_at=now() where tenant_id=p_tenant and token=p_token;
 return jsonb_build_object('dispatched',true);
end $$;

create function public.crm_commit_ai_message(p_tenant uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.crm_ai_message_reservations%rowtype; n integer;
begin
 perform public.crm_locked_config(p_tenant);
 select * into r from public.crm_ai_message_reservations where tenant_id=p_tenant and token=p_token;
 if not found then raise exception 'message_reservation_not_found' using errcode='22023'; end if;
 if r.state='dispatching' then
  update public.crm_attendance_usage set used=used+1 where tenant_id=p_tenant and period_key=r.period_key;
  if not found then raise exception 'message_usage_not_found' using errcode='22023'; end if;
  update public.crm_ai_message_reservations set state='committed',updated_at=now() where tenant_id=p_tenant and token=p_token;
 elsif r.state<>'committed' then raise exception 'message_not_dispatched' using errcode='42501';
 end if;
 select used into n from public.crm_attendance_usage where tenant_id=p_tenant and period_key=r.period_key;
 return jsonb_build_object('committed',true,'used',n,'period',r.period_key,'newWindow',false);
end $$;

create function public.crm_release_ai_message(p_tenant uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.crm_locked_config(p_tenant);
 update public.crm_ai_message_reservations set state='released',updated_at=now()
 where tenant_id=p_tenant and token=p_token and state in ('reserved','dispatching');
 return jsonb_build_object('released',true);
end $$;

revoke all on function public.crm_reserve_ai_message(uuid,text[],text,uuid,integer,integer,text),
 public.crm_dispatch_ai_message(uuid,uuid,text,integer),public.crm_commit_ai_message(uuid,uuid),
 public.crm_release_ai_message(uuid,uuid),public.crm_ai_message_permission(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.crm_reserve_ai_message(uuid,text[],text,uuid,integer,integer,text),
 public.crm_dispatch_ai_message(uuid,uuid,text,integer),public.crm_commit_ai_message(uuid,uuid),
 public.crm_release_ai_message(uuid,uuid),public.crm_ai_message_permission(uuid,text,integer) to service_role;
