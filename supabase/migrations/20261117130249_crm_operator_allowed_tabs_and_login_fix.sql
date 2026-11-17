-- Migration: Add per-operator allowed_tabs permissions on crm_tenant_memberships
-- and RPC crm_set_operator_allowed_tabs to configure panel access areas safely.

alter table public.crm_tenant_memberships
  add column if not exists allowed_tabs text[];

create or replace function public.crm_set_operator_allowed_tabs(
  p_tenant uuid,
  p_user uuid,
  p_allowed_tabs text[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.crm_locked_config(p_tenant);
  update public.crm_tenant_memberships
     set allowed_tabs = p_allowed_tabs
   where tenant_id = p_tenant
     and user_id = p_user
     and role <> 'owner'
     and is_active;
  if not found then
    return jsonb_build_object('updated', false);
  end if;
  return jsonb_build_object('updated', true);
end $$;

revoke all on function public.crm_set_operator_allowed_tabs(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.crm_set_operator_allowed_tabs(uuid, uuid, text[]) to service_role;
