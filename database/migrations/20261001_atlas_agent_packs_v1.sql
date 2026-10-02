-- Atlas Group OS — Agent Packs V1

create table if not exists ai.agent_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  role text not null,
  department text,
  description text,
  status text not null default 'active'
    check (status in ('active','paused','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists ai.agent_pack_versions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references ai.agent_packs(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft'
    check (status in ('draft','approved','retired')),
  instructions text not null,
  model_policy jsonb not null default '{}'::jsonb,
  capability_policy jsonb not null default '{}'::jsonb,
  evaluation_status text not null default 'pending'
    check (evaluation_status in ('pending','passed','failed','waived')),
  approved_by text,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_id, version)
);

create table if not exists ai.agent_pack_tools (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references ai.agent_pack_versions(id) on delete cascade,
  tool_code text not null,
  mode text not null default 'allowed'
    check (mode in ('allowed','disabled')),
  constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (pack_version_id, tool_code)
);

create table if not exists ai.agent_pack_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  pack_version_id uuid not null references ai.agent_pack_versions(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active','paused','revoked')),
  assigned_by text,
  assigned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (tenant_id, agent_id)
);

create table if not exists knowledge.agent_pack_bindings (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references ai.agent_pack_versions(id) on delete cascade,
  source_id uuid not null references knowledge.sources(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pack_version_id, source_id)
);

create index if not exists ai_agent_packs_org_idx
  on ai.agent_packs(organization_id, status);
create index if not exists ai_agent_pack_versions_pack_idx
  on ai.agent_pack_versions(pack_id, status, version desc);
create index if not exists ai_agent_pack_assignments_agent_idx
  on ai.agent_pack_assignments(tenant_id, agent_id, status);
create index if not exists knowledge_agent_pack_bindings_version_idx
  on knowledge.agent_pack_bindings(pack_version_id);

alter table ai.agent_packs enable row level security;
alter table ai.agent_pack_versions enable row level security;
alter table ai.agent_pack_tools enable row level security;
alter table ai.agent_pack_assignments enable row level security;
alter table knowledge.agent_pack_bindings enable row level security;

drop trigger if exists ai_agent_packs_updated_at on ai.agent_packs;
create trigger ai_agent_packs_updated_at
before update on ai.agent_packs
for each row execute function core.set_updated_at();

drop trigger if exists ai_agent_pack_versions_updated_at on ai.agent_pack_versions;
create trigger ai_agent_pack_versions_updated_at
before update on ai.agent_pack_versions
for each row execute function core.set_updated_at();

drop trigger if exists ai_agent_pack_assignments_updated_at on ai.agent_pack_assignments;
create trigger ai_agent_pack_assignments_updated_at
before update on ai.agent_pack_assignments
for each row execute function core.set_updated_at();
