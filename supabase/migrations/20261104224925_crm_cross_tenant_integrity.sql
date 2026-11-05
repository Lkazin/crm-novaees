-- Enforce outbox message ownership by the same CRM tenant.
alter table public.crm_messages
  add constraint crm_messages_id_tenant_unique unique (id, tenant_id);
alter table public.crm_outbox
  add constraint crm_outbox_message_same_tenant_fk
  foreign key (message_id, tenant_id)
  references public.crm_messages (id, tenant_id)
  on delete cascade;
-- An Evolution instance may serve only one tenant in this CRM project.
create unique index if not exists crm_channels_instance_global_uniq
  on public.crm_channels(instance_name);
