-- Read-only staging catalog verification; run immediately after the matching migration.
select current_database(), current_setting('server_version');
select 'ai.agent_packs' as expected_table, to_regclass('ai.agent_packs') is not null as must_be_true;
select 'ai.agent_packs' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.agent_packs'::regclass;
select 'ai.agent_pack_versions' as expected_table, to_regclass('ai.agent_pack_versions') is not null as must_be_true;
select 'ai.agent_pack_versions' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.agent_pack_versions'::regclass;
select 'ai.agent_pack_tools' as expected_table, to_regclass('ai.agent_pack_tools') is not null as must_be_true;
select 'ai.agent_pack_tools' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.agent_pack_tools'::regclass;
select 'ai.agent_pack_assignments' as expected_table, to_regclass('ai.agent_pack_assignments') is not null as must_be_true;
select 'ai.agent_pack_assignments' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'ai.agent_pack_assignments'::regclass;
select 'knowledge.agent_pack_bindings' as expected_table, to_regclass('knowledge.agent_pack_bindings') is not null as must_be_true;
select 'knowledge.agent_pack_bindings' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'knowledge.agent_pack_bindings'::regclass;
select 'ai.ai_agent_packs_org_idx' as expected_index, to_regclass('ai.ai_agent_packs_org_idx') is not null as must_be_true;
select 'ai.ai_agent_pack_versions_pack_idx' as expected_index, to_regclass('ai.ai_agent_pack_versions_pack_idx') is not null as must_be_true;
select 'ai.ai_agent_pack_assignments_agent_idx' as expected_index, to_regclass('ai.ai_agent_pack_assignments_agent_idx') is not null as must_be_true;
select 'knowledge.knowledge_agent_pack_bindings_version_idx' as expected_index, to_regclass('knowledge.knowledge_agent_pack_bindings_version_idx') is not null as must_be_true;
select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('ai.agent_packs'::regclass, 'ai.agent_pack_versions'::regclass, 'ai.agent_pack_tools'::regclass, 'ai.agent_pack_assignments'::regclass, 'knowledge.agent_pack_bindings'::regclass) order by conrelid, conname;
select tgrelid::regclass, tgname, pg_get_triggerdef(oid), tgfoid = 'core.set_updated_at()'::regprocedure as expected_function from pg_trigger where not tgisinternal and tgrelid in ('ai.agent_packs'::regclass, 'ai.agent_pack_versions'::regclass, 'ai.agent_pack_tools'::regclass, 'ai.agent_pack_assignments'::regclass, 'knowledge.agent_pack_bindings'::regclass) order by tgrelid, tgname;
select to_regprocedure('core.set_updated_at()') is not null as must_be_true;
