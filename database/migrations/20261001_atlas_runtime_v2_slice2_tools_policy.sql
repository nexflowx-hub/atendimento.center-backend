-- Atlas Intelligence Runtime V2 — Slice 2
-- Tool registry, per-agent grants, governed runtime actions.

create table if not exists ai.tool_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version text not null default '1',
  description text not null,
  capability text not null,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb,
  side_effect text not null default 'none'
    check (side_effect in ('none','reversible','material','destructive')),
  default_risk text not null default 'low'
    check (default_risk in ('low','medium','high','critical')),
  enabled boolean not null default true,
  timeout_ms integer not null default 15000 check (timeout_ms > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version)
);

create table if not exists ai.tool_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  agent_id uuid not null references ai.agents(id) on delete cascade,
  tool_code text not null,
  status text not null default 'active'
    check (status in ('active','disabled','revoked')),
  constraints jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, agent_id, tool_code)
);

create table if not exists ai.runtime_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai.runtime_runs(id) on delete cascade,
  step_id uuid references ai.runtime_steps(id) on delete set null,
  tool_code text not null,
  tool_version text,
  capability text not null,
  input jsonb not null default '{}'::jsonb,
  side_effect text not null
    check (side_effect in ('none','reversible','material','destructive')),
  risk text not null
    check (risk in ('low','medium','high','critical')),
  policy_result text
    check (policy_result in ('allow','deny','approval_required')),
  policy_reason text,
  status text not null default 'proposed'
    check (
      status in (
        'proposed','allowed','denied','suspended',
        'running','completed','failed','cancelled'
      )
    ),
  approval_request_id uuid,
  idempotency_key text,
  output jsonb,
  error_message text,
  proposed_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_tool_definitions_enabled_idx
  on ai.tool_definitions(enabled, code);
create index if not exists ai_tool_grants_agent_idx
  on ai.tool_grants(tenant_id, agent_id, status);
create index if not exists ai_runtime_actions_run_idx
  on ai.runtime_actions(run_id, proposed_at);
create index if not exists ai_runtime_actions_status_idx
  on ai.runtime_actions(status, proposed_at);

alter table ai.tool_definitions enable row level security;
alter table ai.tool_grants enable row level security;
alter table ai.runtime_actions enable row level security;

drop trigger if exists ai_tool_definitions_updated_at on ai.tool_definitions;
create trigger ai_tool_definitions_updated_at
before update on ai.tool_definitions
for each row execute function core.set_updated_at();

drop trigger if exists ai_tool_grants_updated_at on ai.tool_grants;
create trigger ai_tool_grants_updated_at
before update on ai.tool_grants
for each row execute function core.set_updated_at();

comment on table ai.tool_definitions is
  'Atlas runtime tool catalog. Registration does not grant use.';
comment on table ai.tool_grants is
  'Per-tenant, per-agent permission to request a registered tool.';
comment on table ai.runtime_actions is
  'Governed ActionEnvelope lifecycle for Atlas runtime tool proposals.';
