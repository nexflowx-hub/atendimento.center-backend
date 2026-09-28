-- Applied to Atlas Platform Core as migration bootstrap_signals_connector_registry.
-- Registry only. Connectors remain pending until an actual actor/dataset/credential is configured.

insert into signals.connectors (code, name, connector_type, status, secret_ref, settings)
values
  ('apify', 'Apify', 'external_api', 'pending_configuration', 'env:APIFY_TOKEN',
   '{"adapter":"apify"}'::jsonb),
  ('bright-data', 'Bright Data', 'external_api', 'pending_configuration', null,
   '{"adapter":"bright-data"}'::jsonb)
on conflict (code) do update
set name = excluded.name,
    connector_type = excluded.connector_type,
    secret_ref = coalesce(signals.connectors.secret_ref, excluded.secret_ref),
    settings = signals.connectors.settings || excluded.settings;
