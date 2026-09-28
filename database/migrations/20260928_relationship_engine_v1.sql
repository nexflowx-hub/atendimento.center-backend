-- Atlas Relationship Engine v1
-- Generic persistent relationship state for Atlas Engage agents.
-- FaceLove/Micaela is the first client implementation; tables are not FaceLove-specific.

alter table crm.contacts
  add column if not exists adult_status text not null default 'unknown',
  add column if not exists timezone text;

create table if not exists channels.contact_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  channel_account_id uuid references channels.accounts(id) on delete cascade,
  identity_type text not null,
  identity_value text not null,
  verified_link boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, identity_type, identity_value, channel_account_id)
);

create index if not exists contact_identities_lookup_idx
  on channels.contact_identities(tenant_id, identity_type, identity_value);
create index if not exists contact_identities_contact_idx
  on channels.contact_identities(contact_id);

create table if not exists ai.relationship_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  stage text not null default 'new',
  familiarity integer not null default 0 check (familiarity between 0 and 100),
  trust integer not null default 0 check (trust between 0 and 100),
  emotional_closeness integer not null default 0 check (emotional_closeness between 0 and 100),
  flirt_intensity integer not null default 0 check (flirt_intensity between 0 and 100),
  reciprocity integer not null default 0 check (reciprocity between 0 and 100),
  engagement integer not null default 0 check (engagement between 0 and 100),
  purchase_readiness integer not null default 0 check (purchase_readiness between 0 and 100),
  relationship_depth integer not null default 0 check (relationship_depth between 0 and 100),
  last_mood text,
  last_topic text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contact_id, agent_id),
  check (stage in ('new','known','friendly','warm','flirty','close','premium','long_term','cooling_off'))
);

create index if not exists relationship_states_tenant_stage_idx
  on ai.relationship_states(tenant_id, stage, updated_at desc);

create table if not exists ai.conversation_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  category text not null,
  fact text not null,
  confidence double precision not null default 0.8 check (confidence between 0 and 1),
  source_message_id text,
  importance integer not null default 50 check (importance between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists conversation_memories_active_idx
  on ai.conversation_memories(tenant_id, contact_id, agent_id, status);
create index if not exists conversation_memories_importance_idx
  on ai.conversation_memories(contact_id, agent_id, importance desc);

create table if not exists ai.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_ref_id uuid not null references channels.conversation_refs(id) on delete cascade,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  rolling_summary text not null,
  updated_at timestamptz not null default now(),
  unique(conversation_ref_id, agent_id)
);

create index if not exists conversation_summaries_contact_idx
  on ai.conversation_summaries(contact_id, agent_id);

create table if not exists ai.open_loops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  topic text not null,
  status text not null default 'open',
  due_after timestamptz,
  priority integer not null default 50,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists open_loops_active_idx
  on ai.open_loops(tenant_id, contact_id, agent_id, status);

create table if not exists ai.world_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  valid_from timestamptz not null,
  valid_until timestamptz,
  timezone text not null,
  availability text not null default 'medium',
  mood text,
  current_context text,
  today_story text,
  conversation_hooks jsonb not null default '[]'::jsonb,
  canon_version integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists world_states_agent_valid_idx
  on ai.world_states(agent_id, valid_from desc);

create table if not exists ai.agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  event_id text,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  conversation_ref_id uuid references channels.conversation_refs(id) on delete set null,
  planner_version text not null default 'relationship-planner-v1',
  prompt_version text not null default 'relationship-writer-v1',
  model text not null,
  decision jsonb not null default '{}'::jsonb,
  response_envelope jsonb,
  latency_ms integer,
  result text not null default 'completed',
  error_message text,
  created_at timestamptz not null default now(),
  unique(tenant_id, event_id)
);

create index if not exists agent_runs_contact_idx
  on ai.agent_runs(tenant_id, contact_id, agent_id, created_at desc);

create table if not exists ai.followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  contact_id uuid not null references crm.contacts(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  reason text not null,
  earliest_at timestamptz not null,
  latest_at timestamptz,
  status text not null default 'scheduled',
  message_strategy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists followups_schedule_idx
  on ai.followups(tenant_id, status, earliest_at);
create index if not exists followups_contact_idx
  on ai.followups(contact_id, agent_id);

comment on table channels.contact_identities is
  'Verified platform-scoped identities for Atlas contacts. Never merge contacts by display name or photo alone.';
comment on table ai.relationship_states is
  'Per-contact/per-agent persistent relationship state. Numeric dimensions are bounded from 0 to 100.';
comment on table ai.conversation_memories is
  'Validated durable relationship memory. LLM extraction proposes candidates; deterministic application code validates persistence.';
comment on table ai.agent_runs is
  'Operational planner decisions and final action envelopes. Hidden chain-of-thought is never persisted.';
