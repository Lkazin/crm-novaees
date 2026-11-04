-- Indexes for tenant-scoped CRM foreign keys.
create index if not exists crm_agents_tenant_fk_idx on public.crm_agents(tenant_id);
create index if not exists crm_audit_actor_fk_idx on public.crm_audit_events(actor_id);
create index if not exists crm_audit_tenant_fk_idx on public.crm_audit_events(tenant_id);
create index if not exists crm_conversations_assigned_fk_idx on public.crm_conversations(assigned_to);
create index if not exists crm_conversations_channel_tenant_fk_idx on public.crm_conversations(channel_id,tenant_id);
create index if not exists crm_conversations_contact_tenant_fk_idx on public.crm_conversations(contact_id,tenant_id);
create index if not exists crm_handoffs_conversation_tenant_fk_idx on public.crm_handoffs(conversation_id,tenant_id);
create index if not exists crm_handoffs_tenant_fk_idx on public.crm_handoffs(tenant_id);
create index if not exists crm_messages_conversation_tenant_fk_idx on public.crm_messages(conversation_id,tenant_id);
create index if not exists crm_outbox_message_tenant_fk_idx on public.crm_outbox(message_id,tenant_id);
create index if not exists crm_outbox_tenant_fk_idx on public.crm_outbox(tenant_id);
