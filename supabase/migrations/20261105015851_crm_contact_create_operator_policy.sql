grant insert on public.crm_contacts to authenticated;
create policy crm_contacts_insert_member on public.crm_contacts
 for insert to authenticated with check (
  exists (
   select 1 from public.crm_tenant_memberships m
   join public.crm_tenants t on t.id=m.tenant_id
   where m.tenant_id=crm_contacts.tenant_id
   and m.user_id=(select auth.uid())
   and m.role in ('owner','admin','agent')
   and t.status='active'
  )
 );