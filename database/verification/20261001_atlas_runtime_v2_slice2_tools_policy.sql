-- Read-only staging catalog verification; run immediately after the matching migration.
select current_database(), current_setting('server_version');
select 'ai.tool_definitions' as expected_table, to_regclass('ai.tool_definitions') is not null as must_be_true;
select 'ai.tool_definitions' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.tool_definitions'::regclass;
select 'ai.tool_grants' as expected_table, to_regclass('ai.tool_grants') is not null as must_be_true;
select 'ai.tool_grants' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.tool_grants'::regclass;
select 'ai.runtime_actions' as expected_table, to_regclass('ai.runtime_actions') is not null as must_be_true;
select 'ai.runtime_actions' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.runtime_actions'::regclass;
select 'ai.ai_tool_definitions_enabled_idx' as expected_index, to_regclass('ai.ai_tool_definitions_enabled_idx') is not null as must_be_true;
select 'ai.ai_tool_grants_agent_idx' as expected_index, to_regclass('ai.ai_tool_grants_agent_idx') is not null as must_be_true;
select 'ai.ai_runtime_actions_run_idx' as expected_index, to_regclass('ai.ai_runtime_actions_run_idx') is not null as must_be_true;
select 'ai.ai_runtime_actions_status_idx' as expected_index, to_regclass('ai.ai_runtime_actions_status_idx') is not null as must_be_true;
select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('ai.tool_definitions'::regclass, 'ai.tool_grants'::regclass, 'ai.runtime_actions'::regclass) order by conrelid, conname;
select tgrelid::regclass, tgname, pg_get_triggerdef(oid), tgfoid = 'core.set_updated_at()'::regprocedure as expected_function from pg_trigger where not tgisinternal and tgrelid in ('ai.tool_definitions'::regclass, 'ai.tool_grants'::regclass, 'ai.runtime_actions'::regclass) order by tgrelid, tgname;
select to_regprocedure('core.set_updated_at()') is not null as must_be_true;
