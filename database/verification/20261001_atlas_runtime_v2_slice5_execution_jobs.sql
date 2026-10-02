-- Read-only staging catalog verification; run immediately after the matching migration.
select current_database(), current_setting('server_version');
select 'ai.execution_jobs' as expected_table, to_regclass('ai.execution_jobs') is not null as must_be_true;
select 'ai.execution_jobs' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.execution_jobs'::regclass;
select 'ai.ai_execution_jobs_queue_status_idx' as expected_index, to_regclass('ai.ai_execution_jobs_queue_status_idx') is not null as must_be_true;
select 'ai.ai_execution_jobs_tenant_time_idx' as expected_index, to_regclass('ai.ai_execution_jobs_tenant_time_idx') is not null as must_be_true;
select 'ai.ai_execution_jobs_run_idx' as expected_index, to_regclass('ai.ai_execution_jobs_run_idx') is not null as must_be_true;
select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('ai.execution_jobs'::regclass) order by conrelid, conname;
select tgrelid::regclass, tgname, pg_get_triggerdef(oid), tgfoid = 'core.set_updated_at()'::regprocedure as expected_function from pg_trigger where not tgisinternal and tgrelid in ('ai.execution_jobs'::regclass) order by tgrelid, tgname;
select to_regprocedure('core.set_updated_at()') is not null as must_be_true;
