-- Atlas Intelligence Runtime V2 — Slice 1
-- Generic Run / Step / Trace foundation.
-- Apply only to Atlas Platform Core.

create table if not exists ai.runtime_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id) on delete set null,
  tenant_id uuid not null references core.tenants(id) on delete restrict,
  agent_id uuid not null references ai.agents(id) on delete restrict,
  agent_version_id uuid references ai.agent_versions(id) on delete set null,
  actor_type text not null default 'user',
  actor_id text,
  trigger_type text not null default 'api',
  trigger_ref text,
  status text not null default 'running'
    check (status in ('queued','running','suspended','completed','failed','cancelled')),
  provider text,
  model text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(18,8),
  latency_ms integer,
  trace_id uuid not null default gen_random_uuid(),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai.runtime_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai.runtime_runs(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  kind text not null,
  status text not null default 'running'
    check (status in ('queued','running','suspended','completed','failed','cancelled')),
  provider text,
  model text,
  tool_code text,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(18,8),
  latency_ms integer,
  approval_request_id uuid,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, ordinal)
);

create table if not exists audit.runtime_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai.runtime_runs(id) on delete cascade,
  trace_id uuid not null,
  event_type text not null,
  actor_type text,
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_runtime_runs_tenant_time_idx
  on ai.runtime_runs(tenant_id, created_at desc);
create index if not exists ai_runtime_runs_agent_time_idx
  on ai.runtime_runs(agent_id, created_at desc);
create index if not exists ai_runtime_runs_status_idx
  on ai.runtime_runs(status, started_at);
create index if not exists ai_runtime_runs_trace_idx
  on ai.runtime_runs(trace_id);
create index if not exists ai_runtime_steps_run_ordinal_idx
  on ai.runtime_steps(run_id, ordinal);
create index if not exists audit_runtime_events_trace_time_idx
  on audit.runtime_events(trace_id, created_at);
create index if not exists audit_runtime_events_run_time_idx
  on audit.runtime_events(run_id, created_at);

alter table ai.runtime_runs enable row level security;
alter table ai.runtime_steps enable row level security;
alter table audit.runtime_events enable row level security;

drop trigger if exists ai_runtime_runs_updated_at on ai.runtime_runs;
create trigger ai_runtime_runs_updated_at
before update on ai.runtime_runs
for each row execute function core.set_updated_at();

comment on table ai.runtime_runs is
  'Generic Atlas Intelligence agent runs. Separate from relationship-specific ai.agent_runs.';
comment on table ai.runtime_steps is
  'Ordered execution steps for generic Atlas Intelligence runtime runs.';
comment on table audit.runtime_events is
  'Durable event trace for Atlas Intelligence runtime runs.';
