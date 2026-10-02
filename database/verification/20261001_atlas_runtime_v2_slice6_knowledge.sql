-- Read-only staging catalog verification; run immediately after the matching migration.
select current_database(), current_setting('server_version');
select 'knowledge.sources' as expected_table, to_regclass('knowledge.sources') is not null as must_be_true;
select 'knowledge.sources' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'knowledge.sources'::regclass;
select 'knowledge.documents' as expected_table, to_regclass('knowledge.documents') is not null as must_be_true;
select 'knowledge.documents' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'knowledge.documents'::regclass;
select 'knowledge.chunks' as expected_table, to_regclass('knowledge.chunks') is not null as must_be_true;
select 'knowledge.chunks' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'knowledge.chunks'::regclass;
select 'portfolio.project_memories' as expected_table, to_regclass('portfolio.project_memories') is not null as must_be_true;
select 'portfolio.project_memories' as expected_rls, relrowsecurity as must_be_true from pg_class where oid = 'portfolio.project_memories'::regclass;
select 'knowledge.knowledge_sources_scope_idx' as expected_index, to_regclass('knowledge.knowledge_sources_scope_idx') is not null as must_be_true;
select 'knowledge.knowledge_documents_source_idx' as expected_index, to_regclass('knowledge.knowledge_documents_source_idx') is not null as must_be_true;
select 'knowledge.knowledge_chunks_document_idx' as expected_index, to_regclass('knowledge.knowledge_chunks_document_idx') is not null as must_be_true;
select 'knowledge.knowledge_chunks_search_idx' as expected_index, to_regclass('knowledge.knowledge_chunks_search_idx') is not null as must_be_true;
select 'portfolio.project_memories_project_idx' as expected_index, to_regclass('portfolio.project_memories_project_idx') is not null as must_be_true;
select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('knowledge.sources'::regclass, 'knowledge.documents'::regclass, 'knowledge.chunks'::regclass, 'portfolio.project_memories'::regclass) order by conrelid, conname;
select tgrelid::regclass, tgname, pg_get_triggerdef(oid), tgfoid = 'core.set_updated_at()'::regprocedure as expected_function from pg_trigger where not tgisinternal and tgrelid in ('knowledge.sources'::regclass, 'knowledge.documents'::regclass, 'knowledge.chunks'::regclass, 'portfolio.project_memories'::regclass) order by tgrelid, tgname;
select attgenerated = 's' as must_be_true, pg_get_expr(adbin, adrelid) from pg_attribute join pg_attrdef on adrelid=attrelid and adnum=attnum where attrelid='knowledge.chunks'::regclass and attname='search_vector';
select to_regprocedure('core.set_updated_at()') is not null as must_be_true;
