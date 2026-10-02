-- Read-only staging catalog verification; run immediately after the matching migration.
select current_database(), current_setting('server_version');
select attname, attnotnull, format_type(atttypid, atttypmod), pg_get_expr(adbin, adrelid) from pg_attribute join pg_attrdef on adrelid=attrelid and adnum=attnum where attrelid='ai.runtime_runs'::regclass and attname='state';
select to_regprocedure('core.set_updated_at()') is not null as must_be_true;
