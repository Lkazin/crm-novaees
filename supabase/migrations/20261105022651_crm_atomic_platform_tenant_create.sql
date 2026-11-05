-- Service-only transaction: create tenant, default secure settings, and audit together.
create or replace function public.crm_admin_create_tenant(p_name text, p_actor uuid)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
 if p_actor is null or not exists (select 1 from public.platform_staff p where p.user_id=p_actor and p.enabled and p.role in ('MASTER','ADMINISTRADOR')) then
   raise exception 'platform_access_denied' using errcode='42501';
 end if;
 if p_name is null or char_length(btrim(p_name)) not between 2 and 160 then
   raise exception 'invalid_tenant_name' using errcode='22023';
 end if;
 insert into public.crm_tenants(name,status) values(btrim(p_name),'inactive') returning id into v_id;
 insert into public.crm_tenant_settings(tenant_id,ai_sending_enabled,campaigns_enabled,automation_execution_enabled)
 values(v_id,false,false,false);
 insert into public.crm_audit_events(tenant_id,actor_id,action,entity_type,entity_id)
 values(v_id,p_actor,'tenant.created','crm_tenants',v_id);
 return v_id;
end $$;
revoke all on function public.crm_admin_create_tenant(text,uuid) from public,anon,authenticated;
grant execute on function public.crm_admin_create_tenant(text,uuid) to service_role;