-- Service-only atomic human handoff. This changes CRM state, not WhatsApp transport.
create or replace function public.crm_operator_claim_conversation(
 p_tenant uuid, p_conversation uuid, p_actor uuid)
returns uuid
language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if not exists (
  select 1 from public.crm_tenant_memberships m
  join public.crm_tenants t on t.id=m.tenant_id
  where m.tenant_id=p_tenant and m.user_id=p_actor
  and m.role in ('owner','admin','agent') and t.status='active'
 ) then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 update public.crm_conversations
 set mode='human',assigned_to=p_actor,updated_at=now()
 where id=p_conversation and tenant_id=p_tenant and status<>'resolved'
 returning id into v_id;
 if v_id is null then raise exception 'conversation_not_available' using errcode='22023'; end if;
 insert into public.crm_handoffs(tenant_id,conversation_id,requested_by,status,reason)
 values(p_tenant,v_id,'human','accepted','Operator took ownership');
 insert into public.crm_audit_events(tenant_id,actor_id,action,entity_type,entity_id)
 values(p_tenant,p_actor,'conversation.claimed','crm_conversations',v_id);
 return v_id;
end $$;
revoke all on function public.crm_operator_claim_conversation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_operator_claim_conversation(uuid,uuid,uuid) to service_role;
