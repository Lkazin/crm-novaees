-- Emergency CRM tenant suspension: preserve all records, disable any future automation flags.
-- Service-only RPC; Reactivation never switches a tenant directly to active.
create or replace function public.crm_admin_set_tenant_suspension(
  p_tenant uuid, p_actor uuid, p_suspend boolean)
returns text
language plpgsql security invoker set search_path=''
as $$
declare v_previous text;
declare v_new text;
begin
  if not exists (
    select 1 from public.platform_staff s
    where s.user_id=p_actor and s.enabled and s.role in ('MASTER','ADMINISTRADOR')
  ) then raise exception 'platform_access_denied' using errcode='42501'; end if;
  select status into v_previous from public.crm_tenants where id=p_tenant for update;
  if v_previous is null then raise exception 'tenant_not_found' using errcode='22023'; end if;
  if p_suspend then
    v_new:='suspended';
  elsif v_previous='suspended' then
    -- Never automatically reactivate WhatsApp or paid AI consumption.
    v_new:='inactive';
  else
    raise exception 'tenant_not_suspended' using errcode='22023';
  end if;
  update public.crm_tenants set status=v_new where id=p_tenant;
  insert into public.crm_tenant_settings(tenant_id,ai_sending_enabled,campaigns_enabled,automation_execution_enabled)
  values(p_tenant,false,false,false)
  on conflict(tenant_id) do update set
    ai_sending_enabled=false,campaigns_enabled=false,automation_execution_enabled=false,
    updated_at=now();
  insert into public.crm_audit_events(tenant_id,actor_id,action,entity_type,entity_id)
  values(p_tenant,p_actor,case when p_suspend then 'tenant.suspended' else 'tenant.suspension_lifted_inactive' end,
    'crm_tenants',p_tenant);
  return v_new;
end $$;
revoke all on function public.crm_admin_set_tenant_suspension(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.crm_admin_set_tenant_suspension(uuid,uuid,boolean) to service_role;
