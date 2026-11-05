-- Draft knowledge editing by tenant members, publication only by owners/admins.
grant insert on public.crm_knowledge_articles to authenticated;
grant update (title,body,status,updated_at) on public.crm_knowledge_articles to authenticated;
create policy crm_knowledge_write_draft on public.crm_knowledge_articles for insert to authenticated
with check(
 status='draft' and created_by=(select auth.uid())
 and exists(select 1 from public.crm_tenant_memberships m join public.crm_tenants t on t.id=m.tenant_id
 where m.tenant_id=crm_knowledge_articles.tenant_id and m.user_id=(select auth.uid())
 and m.role in ('owner','admin','agent') and t.status='active')
);
create policy crm_knowledge_update_allowed on public.crm_knowledge_articles for update to authenticated
using(exists(select 1 from public.crm_tenant_memberships m join public.crm_tenants t on t.id=m.tenant_id
 where m.tenant_id=crm_knowledge_articles.tenant_id and m.user_id=(select auth.uid())
 and m.role in ('owner','admin','agent') and t.status='active'))
with check(exists(select 1 from public.crm_tenant_memberships m join public.crm_tenants t on t.id=m.tenant_id
 where m.tenant_id=crm_knowledge_articles.tenant_id and m.user_id=(select auth.uid())
 and t.status='active' and
 ((m.role in ('owner','admin')) or (m.role='agent' and crm_knowledge_articles.status='draft'))));
