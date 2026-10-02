-- Atlas Intelligence Runtime V2 — Slice 4
-- Resumable model/tool loop state.

alter table ai.runtime_runs
  add column if not exists state jsonb not null default '{}'::jsonb;

comment on column ai.runtime_runs.state is
  'Trusted Runtime V2 continuation state for bounded model/tool loops; not durable knowledge memory.';
