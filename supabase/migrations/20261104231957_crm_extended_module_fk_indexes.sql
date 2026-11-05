create index if not exists crm_contact_consents_contact_tenant_idx on public.crm_contact_consents(contact_id,tenant_id);
create index if not exists crm_contact_tags_contact_tenant_idx on public.crm_contact_tags(contact_id,tenant_id);
create index if not exists crm_notes_tenant_idx on public.crm_internal_notes(tenant_id);