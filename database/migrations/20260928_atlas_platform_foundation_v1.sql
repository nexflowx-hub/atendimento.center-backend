-- Atlas Platform Core v1
-- Applied to Supabase project qguciygqckkbxhaboxjb as atlas_platform_foundation_v1.
-- This file is the source-controlled replayable representation of that migration.

create schema if not exists core;
create schema if not exists crm;
create schema if not exists channels;
create schema if not exists ai;
create schema if not exists flows;
create schema if not exists automation;
create schema if not exists smm;
create schema if not exists signals;
create schema if not exists integrations;
create schema if not exists audit;

revoke all on schema core, crm, channels, ai, flows, automation, smm, signals, integrations, audit from public;
revoke all on schema core, crm, channels, ai, flows, automation, smm, signals, integrations, audit from anon, authenticated;

create or replace function core.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, core
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

revoke all on function core.set_updated_at() from public, anon, authenticated;

create table if not exists core.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null default 'internal' check (kind in ('internal','customer','partner')),
  status text not null default 'active' check (status in ('active','trial','suspended','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id) on delete set null,
  name text not null,
  slug text not null unique,
  product text not null default 'platform',
  status text not null default 'active' check (status in ('active','trial','suspended','cancelled')),
  plan text not null default 'internal',
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  chatwoot_account_id integer unique,
  evolution_instance text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  auth_user_id uuid not null,
  role text not null default 'agent' check (role in ('owner','admin','supervisor','agent','viewer','service')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, auth_user_id)
);
create index if not exists core_memberships_auth_user_idx on core.memberships(auth_user_id);

create table if not exists core.entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  capability text not null,
  status text not null default 'active' check (status in ('active','disabled','trial')),
  limit_value numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, capability)
);

create table if not exists crm.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  external_key text,
  name text,
  email text,
  phone text,
  telegram_username text,
  source text,
  locale text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_key)
);
create index if not exists crm_contacts_tenant_email_idx on crm.contacts(tenant_id, email);
create index if not exists crm_contacts_tenant_phone_idx on crm.contacts(tenant_id, phone);

create table if not exists crm.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  source text,
  status text not null default 'new',
  stage text,
  score numeric,
  product_code text,
  owner_auth_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_leads_tenant_status_idx on crm.leads(tenant_id, status, created_at desc);
create index if not exists crm_leads_contact_idx on crm.leads(contact_id);

create table if not exists crm.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  lead_id uuid references crm.leads(id) on delete set null,
  activity_type text not null,
  external_ref text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_tenant_time_idx on crm.activities(tenant_id, occurred_at desc);

create table if not exists crm.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  contact_name text,
  contact_phone text,
  service text,
  preferred_date timestamptz,
  preferred_period text,
  status text not null default 'pending',
  conversation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_appointment_requests_tenant_status_idx on crm.appointment_requests(tenant_id, status);

create table if not exists channels.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  channel_type text not null check (channel_type in ('whatsapp','telegram','instagram','facebook','webchat','email','sms','other')),
  provider text not null,
  name text not null,
  external_account_id text,
  status text not null default 'active',
  secret_ref text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, provider, external_account_id)
);

create table if not exists channels.conversation_refs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  channel_account_id uuid not null references channels.accounts(id) on delete cascade,
  external_conversation_id text not null,
  external_inbox_id text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_account_id, external_conversation_id)
);

create table if not exists ai.tenant_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references core.tenants(id) on delete cascade,
  enabled boolean not null default false,
  model text not null default 'openai/gpt-4.1-mini',
  system_prompt text not null default '',
  human_handoff_threshold double precision not null default 0.75,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai.agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  mode text not null default 'hybrid' check (mode in ('closed_flow','hybrid','freeform','tool_agent')),
  provider text not null default 'openrouter',
  model text not null default 'openai/gpt-4.1-mini',
  system_prompt text not null default '',
  temperature numeric,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists ai.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai.agents(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

create table if not exists flows.definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  engine text not null default 'native' check (engine in ('native','typebot','n8n','external')),
  conversational_mode text not null default 'closed' check (conversational_mode in ('closed','guided','hybrid','free')),
  external_id text,
  status text not null default 'draft',
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists flows.runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  flow_id uuid not null references flows.definitions(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  conversation_ref_id uuid references channels.conversation_refs(id) on delete set null,
  agent_id uuid references ai.agents(id) on delete set null,
  status text not null default 'running',
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ai.agent_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  channel_account_id uuid references channels.accounts(id) on delete cascade,
  flow_id uuid references flows.definitions(id) on delete set null,
  priority integer not null default 100,
  enabled boolean not null default true,
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_id, channel_account_id, flow_id)
);

create table if not exists automation.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  engine text not null default 'native' check (engine in ('native','n8n','typebot','external')),
  external_id text,
  trigger_type text not null,
  enabled boolean not null default true,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists automation.runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  workflow_id uuid not null references automation.workflows(id) on delete cascade,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists smm.providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  base_url text,
  status text not null default 'active',
  secret_ref text,
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists smm.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references smm.providers(id) on delete cascade,
  provider_service_id text not null,
  platform text not null,
  category text not null,
  service_type text not null,
  name text not null,
  description text,
  min_quantity integer,
  max_quantity integer,
  cost_amount numeric(18,6),
  cost_currency text not null default 'USD',
  refill_supported boolean not null default false,
  cancel_supported boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider_service_id)
);

create table if not exists smm.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  service_id uuid not null references smm.services(id) on delete cascade,
  public_name text not null,
  description text,
  sale_price numeric(18,6) not null,
  currency text not null default 'BRL',
  active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, service_id)
);

create table if not exists smm.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid references crm.contacts(id) on delete set null,
  offer_id uuid references smm.offers(id) on delete set null,
  service_id uuid not null references smm.services(id) on delete restrict,
  target text not null,
  quantity integer not null check (quantity > 0),
  amount numeric(18,6) not null default 0,
  currency text not null default 'BRL',
  payment_system text,
  payment_reference text,
  provider_order_reference text,
  status text not null default 'pending_payment',
  provider_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists smm.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references smm.orders(id) on delete cascade,
  event_type text not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists signals.connectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  connector_type text not null check (connector_type in ('official_api','public_web','browser_worker','manual_import','external_api')),
  status text not null default 'active',
  secret_ref text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signals.sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  connector_id uuid references signals.connectors(id) on delete set null,
  network text not null,
  source_type text not null,
  identifier text not null,
  canonical_url text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, network, source_type, identifier)
);

create table if not exists signals.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  connector_id uuid references signals.connectors(id) on delete set null,
  source_id uuid references signals.sources(id) on delete set null,
  task_type text not null,
  target text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  priority integer not null default 100,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists signals.items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  job_id uuid references signals.jobs(id) on delete set null,
  network text not null,
  external_id text,
  item_type text not null,
  canonical_url text,
  author_handle text,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  content_hash text,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists integrations.connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references core.tenants(id) on delete cascade,
  kind text not null,
  provider text not null,
  name text not null,
  external_ref text,
  status text not null default 'active',
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integrations.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references core.tenants(id) on delete set null,
  provider text not null,
  event_type text not null,
  external_event_id text,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create table if not exists audit.logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references core.tenants(id) on delete set null,
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists channels_accounts_tenant_idx on channels.accounts(tenant_id, channel_type);
create index if not exists channels_conversation_refs_tenant_idx on channels.conversation_refs(tenant_id, status);
create index if not exists flows_runs_tenant_status_idx on flows.runs(tenant_id, status, started_at desc);
create index if not exists automation_runs_tenant_status_idx on automation.runs(tenant_id, status, queued_at desc);
create index if not exists smm_services_platform_category_idx on smm.services(platform, category, active);
create index if not exists smm_orders_tenant_status_idx on smm.orders(tenant_id, status, created_at desc);
create index if not exists smm_orders_provider_ref_idx on smm.orders(provider_order_reference);
create index if not exists smm_order_events_order_idx on smm.order_events(order_id, created_at);
create index if not exists signals_jobs_queue_idx on signals.jobs(status, priority, scheduled_at);
create index if not exists signals_items_tenant_network_time_idx on signals.items(tenant_id, network, collected_at desc);
create unique index if not exists signals_items_external_unique on signals.items(tenant_id, network, external_id) where external_id is not null;
create index if not exists integrations_connections_tenant_idx on integrations.connections(tenant_id, kind, provider);
create unique index if not exists integrations_webhook_event_unique on integrations.webhook_events(provider, external_event_id) where external_event_id is not null;
create index if not exists integrations_webhook_status_idx on integrations.webhook_events(status, received_at);
create index if not exists audit_logs_tenant_time_idx on audit.logs(tenant_id, created_at desc);

do $$
declare tbl regclass;
begin
  foreach tbl in array array[
    'core.organizations'::regclass,'core.tenants'::regclass,'core.memberships'::regclass,'core.entitlements'::regclass,
    'crm.contacts'::regclass,'crm.leads'::regclass,'crm.activities'::regclass,'crm.appointment_requests'::regclass,
    'channels.accounts'::regclass,'channels.conversation_refs'::regclass,
    'ai.tenant_configurations'::regclass,'ai.agents'::regclass,'ai.agent_versions'::regclass,'ai.agent_bindings'::regclass,
    'flows.definitions'::regclass,'flows.runs'::regclass,
    'automation.workflows'::regclass,'automation.runs'::regclass,
    'smm.providers'::regclass,'smm.services'::regclass,'smm.offers'::regclass,'smm.orders'::regclass,'smm.order_events'::regclass,
    'signals.connectors'::regclass,'signals.sources'::regclass,'signals.jobs'::regclass,'signals.items'::regclass,
    'integrations.connections'::regclass,'integrations.webhook_events'::regclass,'audit.logs'::regclass
  ]
  loop execute format('alter table %s enable row level security', tbl); end loop;
end $$;

do $$
declare item record;
begin
  for item in select * from (values
    ('core.organizations','organizations_updated_at'),('core.tenants','tenants_updated_at'),
    ('core.memberships','memberships_updated_at'),('core.entitlements','entitlements_updated_at'),
    ('crm.contacts','contacts_updated_at'),('crm.leads','leads_updated_at'),
    ('crm.appointment_requests','appointment_requests_updated_at'),
    ('channels.accounts','channel_accounts_updated_at'),('channels.conversation_refs','conversation_refs_updated_at'),
    ('ai.tenant_configurations','ai_tenant_configurations_updated_at'),('ai.agents','ai_agents_updated_at'),
    ('flows.definitions','flow_definitions_updated_at'),('automation.workflows','automation_workflows_updated_at'),
    ('smm.providers','smm_providers_updated_at'),('smm.services','smm_services_updated_at'),
    ('smm.offers','smm_offers_updated_at'),('smm.orders','smm_orders_updated_at'),
    ('signals.connectors','signals_connectors_updated_at'),('signals.sources','signals_sources_updated_at'),
    ('signals.jobs','signals_jobs_updated_at'),('integrations.connections','integrations_connections_updated_at')
  ) as v(table_name, trigger_name)
  loop
    execute format('drop trigger if exists %I on %s', item.trigger_name, item.table_name);
    execute format('create trigger %I before update on %s for each row execute function core.set_updated_at()', item.trigger_name, item.table_name);
  end loop;
end $$;

insert into core.organizations (slug, name, kind, status, metadata)
values ('atlas-internal','Atlas Internal','internal','active','{"purpose":"Atlas-owned projects and platform operations"}'::jsonb)
on conflict (slug) do update
set name=excluded.name, kind=excluded.kind, status=excluded.status, metadata=core.organizations.metadata || excluded.metadata;

with org as (select id from core.organizations where slug='atlas-internal')
insert into core.tenants (organization_id,slug,name,product,status,plan,metadata)
select org.id,x.slug,x.name,x.product,'active','internal',x.metadata
from org
cross join (values
  ('atendimento-center','Atendimento.Center','engage','{"role":"platform-operations"}'::jsonb),
  ('atlashub','AtlasHub','growth','{"role":"commercial-front"}'::jsonb),
  ('novidades-store','Novidades.Store','commerce','{"role":"internal-commerce-lab"}'::jsonb),
  ('facelove','FaceLove','engage','{"conversation_mode":"freeform"}'::jsonb),
  ('mypets','MyPets','engage','{"conversation_mode":"hybrid"}'::jsonb),
  ('mytrainx','MyTrainX','engage','{"conversation_mode":"hybrid"}'::jsonb),
  ('treinomilitar','TreinoMilitar','engage','{"conversation_mode":"guided"}'::jsonb)
) as x(slug,name,product,metadata)
on conflict (slug) do update
set name=excluded.name, product=excluded.product, status=excluded.status, plan=excluded.plan, metadata=core.tenants.metadata || excluded.metadata;

insert into core.entitlements (tenant_id,capability,status,metadata)
select t.id,c.capability,'active','{}'::jsonb
from core.tenants t
join (values
  ('atendimento-center','crm'),('atendimento-center','omnichannel'),('atendimento-center','ai_agents'),
  ('atendimento-center','flows'),('atendimento-center','automation'),
  ('atlashub','crm'),('atlashub','omnichannel'),('atlashub','ai_agents'),('atlashub','flows'),
  ('atlashub','automation'),('atlashub','smm'),('atlashub','social_intelligence'),
  ('novidades-store','crm'),('novidades-store','omnichannel'),('novidades-store','automation'),('novidades-store','social_intelligence'),
  ('facelove','crm'),('facelove','omnichannel'),('facelove','ai_agents'),('facelove','flows'),('facelove','automation'),
  ('mypets','crm'),('mypets','omnichannel'),('mypets','ai_agents'),('mypets','flows'),('mypets','automation'),
  ('mytrainx','crm'),('mytrainx','omnichannel'),('mytrainx','ai_agents'),('mytrainx','flows'),('mytrainx','automation'),
  ('treinomilitar','crm'),('treinomilitar','omnichannel'),('treinomilitar','ai_agents'),('treinomilitar','flows'),('treinomilitar','automation')
) as c(slug,capability) on c.slug=t.slug
on conflict (tenant_id,capability) do nothing;

comment on schema smm is 'Atlas SMM/Growth catalog, offers, provider routing and order orchestration.';
comment on schema signals is 'Atlas Social Intelligence ingestion. Official APIs preferred; public-web connectors must respect authorization, privacy, rate limits and applicable platform terms.';
comment on schema channels is 'Atlas omnichannel references. Chatwoot/Evolution remain systems of execution; this schema stores Atlas mappings and control-plane metadata.';
comment on schema flows is 'Conversational flow abstraction for native, Typebot, n8n and external engines.';
