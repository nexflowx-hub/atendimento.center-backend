-- Read-only staging catalog verification; run immediately after the matching migration.
select current_database(), current_setting('server_version');
select 'ai.runtime_runs' as expected_table, to_regclass('ai.runtime_runs') is not null as must_be_true;
select 'ai.runtime_runs' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.runtime_runs'::regclass;
select 'ai.runtime_steps' as expected_table, to_regclass('ai.runtime_steps') is not null as must_be_true;
select 'ai.runtime_steps' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.runtime_steps'::regclass;
select 'audit.runtime_events' as expected_table, to_regclass('audit.runtime_events') is not null as must_be_true;
select 'audit.runtime_events' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'audit.runtime_events'::regclass;
select 'ai.ai_runtime_runs_tenant_time_idx' as expected_index, to_regclass('ai.ai_runtime_runs_tenant_time_idx') is not null as must_be_true;
select 'ai.ai_runtime_runs_agent_time_idx' as expected_index, to_regclass('ai.ai_runtime_runs_agent_time_idx') is not null as must_be_true;
select 'ai.ai_runtime_runs_status_idx' as expected_index, to_regclass('ai.ai_runtime_runs_status_idx') is not null as must_be_true;
select 'ai.ai_runtime_runs_trace_idx' as expected_index, to_regclass('ai.ai_runtime_runs_trace_idx') is not null as must_be_true;
select 'ai.ai_runtime_steps_run_ordinal_idx' as expected_index, to_regclass('ai.ai_runtime_steps_run_ordinal_idx') is not null as must_be_true;
select 'audit.audit_runtime_events_trace_time_idx' as expected_index, to_regclass('audit.audit_runtime_events_trace_time_idx') is not null as must_be_true;
select 'audit.audit_runtime_events_run_time_idx' as expected_index, to_regclass('audit.audit_runtime_events_run_time_idx') is not null as must_be_true;
select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('ai.runtime_runs'::regclass, 'ai.runtime_steps'::regclass, 'audit.runtime_events'::regclass) order by conrelid, conname;
select tgrelid::regclass, tgname, pg_get_triggerdef(oid), tgfoid = 'core.set_updated_at()'::regprocedure as expected_function from pg_trigger where not tgisinternal and tgrelid in ('ai.runtime_runs'::regclass, 'ai.runtime_steps'::regclass, 'audit.runtime_events'::regclass) order by tgrelid, tgname;
select to_regprocedure('core.set_updated_at()') is not null as must_be_true;
