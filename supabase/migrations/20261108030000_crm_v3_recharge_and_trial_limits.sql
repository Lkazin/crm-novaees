-- Migration: v3 commercial plans alignment (Teste 7d com até 3 WhatsApps e recargas computadas no limite)
create or replace function public.crm_attendance_permission(p_tenant uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
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

 -- Sum paid recharges credits if any
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
end $$;

create or replace function public.crm_ai_message_permission(p_tenant uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; p jsonb; max_slot integer; requested_slot integer;
begin
 perm:=public.crm_attendance_permission(p_tenant,p_instance,p_limit);
 p:=public.crm_effective_stored_plan(perm->'config');
 max_slot:=case p->>'planId' when 'crm-trial' then 3 when 'crm-start' then 1
  when 'crm-business' then 3 when 'crm-premium' then 3 else 3 end;
 requested_slot:=coalesce(substring(p_instance from '_([0-9]+)$')::integer,1);
 if requested_slot<1 or requested_slot>max_slot then raise exception 'channel_not_allowed_by_tier' using errcode='42501'; end if;
 return perm;
end $$;

