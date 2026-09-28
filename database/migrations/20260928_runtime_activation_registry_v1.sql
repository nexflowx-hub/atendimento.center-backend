-- Applied to Atlas Platform Core as runtime_activation_registry_v1.
-- Defines desired runtime references only; no secret values are stored here.

with t as (
  select id from core.tenants where slug='atlashub'
)
insert into channels.accounts (
  tenant_id, channel_type, provider, name, external_account_id, status, secret_ref, settings
)
select
  t.id,
  'whatsapp',
  'evolution',
  'AtlasHub • WhatsApp',
  'atlashub-wa',
  'pending_config',
  null,
  jsonb_build_object(
    'expectedPhoneE164', '+5562991903462',
    'instanceName', 'atlashub-wa',
    'commercial', true
  )
from t
on conflict (tenant_id, channel_type, provider, external_account_id)
do update set
  name = excluded.name,
  status = case
    when channels.accounts.status = 'active' then 'active'
    else excluded.status
  end,
  settings = channels.accounts.settings || excluded.settings;

update smm.providers
set secret_ref = case code
  when 'jap' then 'env:SMM_JAP_API_KEY'
  when 'peakerr' then 'env:SMM_PEAKERR_API_KEY'
  when 'smmfollows' then 'env:SMM_SMMFOLLOWS_API_KEY'
  when 'revenda-exclusiva' then 'env:SMM_REVENDA_EXCLUSIVA_API_KEY'
  else secret_ref
end
where code in ('jap','peakerr','smmfollows','revenda-exclusiva');

update signals.connectors
set secret_ref = case code
  when 'apify' then 'env:APIFY_TOKEN'
  when 'bright-data' then 'env:BRIGHT_DATA_API_TOKEN'
  else secret_ref
end
where code in ('apify','bright-data');
