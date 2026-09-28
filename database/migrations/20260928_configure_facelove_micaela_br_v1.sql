-- Bind FaceLove's already-provisioned BR execution channel to Micaela.
-- IDs below are operational identifiers, not credentials.

update core.tenants
set
  chatwoot_account_id = 3,
  evolution_instance = 'facelove-wa',
  metadata = metadata || '{"relationship_agent":"micaela","primary_market":"BR"}'::jsonb,
  updated_at = now()
where slug = 'facelove';

update channels.accounts c
set
  status = 'active',
  settings = c.settings || jsonb_build_object(
    'evolution_instance', 'facelove-wa',
    'chatwoot_account_id', 3,
    'chatwoot_inbox_id', 6,
    'chatwoot_inbox_name', 'FaceLove • WhatsApp'
  ),
  updated_at = now()
from core.tenants t
where c.tenant_id = t.id
  and t.slug = 'facelove'
  and c.external_account_id = 'micaela_br';
