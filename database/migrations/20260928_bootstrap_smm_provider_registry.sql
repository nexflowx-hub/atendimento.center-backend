-- Applied to Atlas Platform Core as migration bootstrap_smm_provider_registry.
-- Registry only: no API endpoint or secret is assumed here.

insert into smm.providers (code, name, status, capabilities, metadata)
values
  ('jap', 'JustAnotherPanel', 'pending_configuration',
   '{"apiStyle":"smm-panel-v2","rateUnitSize":1000}'::jsonb,
   '{"priority":"primary_candidate"}'::jsonb),
  ('peakerr', 'Peakerr', 'pending_configuration',
   '{"apiStyle":"smm-panel-v2","rateUnitSize":1000}'::jsonb,
   '{"priority":"primary_candidate"}'::jsonb),
  ('smmfollows', 'SMMFollows', 'pending_configuration',
   '{"apiStyle":"smm-panel-v2","rateUnitSize":1000}'::jsonb,
   '{"priority":"fallback_candidate"}'::jsonb),
  ('revenda-exclusiva', 'Revenda Exclusiva', 'pending_configuration',
   '{"apiStyle":"smm-panel-v2","rateUnitSize":1000}'::jsonb,
   '{"priority":"candidate"}'::jsonb)
on conflict (code) do update
set name = excluded.name,
    capabilities = smm.providers.capabilities || excluded.capabilities,
    metadata = smm.providers.metadata || excluded.metadata;
