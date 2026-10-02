-- Atlas Intelligence Runtime V2 — Slice 5
-- Durable execution queue jobs.

create table if not exists ai.execution_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  queue_name text not null,
  job_type text not null,
  actor_type text not null,
  actor_id text,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled')),
  request jsonb not null default '{}'::jsonb,
  run_id uuid references ai.runtime_runs(id) on delete set null,
  attempts integer not null default 0,
  max_attempts integer not null default 1 check (max_attempts > 0),
  error_message text,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_execution_jobs_queue_status_idx
  on ai.execution_jobs(queue_name, status, scheduled_at);
create index if not exists ai_execution_jobs_tenant_time_idx
  on ai.execution_jobs(tenant_id, created_at desc);
create index if not exists ai_execution_jobs_run_idx
  on ai.execution_jobs(run_id)
  where run_id is not null;

alter table ai.execution_jobs enable row level security;

drop trigger if exists ai_execution_jobs_updated_at on ai.execution_jobs;
create trigger ai_execution_jobs_updated_at
before update on ai.execution_jobs
for each row execute function core.set_updated_at();

comment on table ai.execution_jobs is
  'Durable Atlas execution queue jobs. Queue payloads carry only this row ID.';
