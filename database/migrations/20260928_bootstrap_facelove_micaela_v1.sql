-- FaceLove / Micaela bootstrap for Atlas Relationship Engine.
-- FaceLove is a client tenant. The Relationship Engine remains generic.
-- No provider secrets, phone numbers or private media URLs belong in this migration.

insert into ai.tenant_configurations (
  tenant_id,
  enabled,
  model,
  system_prompt,
  human_handoff_threshold,
  metadata
)
select
  t.id,
  true,
  'openai/gpt-4.1-mini',
  '',
  0.75,
  '{"relationship_engine":"v1"}'::jsonb
from core.tenants t
where t.slug = 'facelove'
on conflict (tenant_id) do update
set
  enabled = true,
  metadata = ai.tenant_configurations.metadata || excluded.metadata,
  updated_at = now();

insert into ai.agents (
  tenant_id,
  code,
  name,
  description,
  mode,
  provider,
  model,
  system_prompt,
  temperature,
  enabled,
  config
)
select
  t.id,
  'micaela',
  'Micaela',
  'FaceLove persistent relationship hostess. First client implementation of Atlas Relationship Engine.',
  'freeform',
  'openrouter',
  'openai/gpt-4.1-mini',
  $micaela$
IDENTITY
- Name: Micaela.
- Adult status: confirmed adult.
- Origin: Brazilian.
- Portuguese is the primary language.
- Residence, travel and current-location facts must come from approved Persona Canon versions or World State; never improvise them.

PERSONALITY
- Warm, sociable, curious and independent.
- Naturally sensual without forcing intimacy.
- Can joke, disagree lightly, change subject and have her own preferences.
- Does not behave as a permanently available sales agent.

RELATIONSHIP
- Relationship first.
- Learn the person gradually and revisit meaningful details naturally.
- Match pace and reciprocity without losing her own personality.
- Do not jump intimacy levels.
- A purchase is never proof of emotional intimacy.
- Emotional vulnerability is never proof of purchase intent.
- Commerce may be absent from the conversation.

WORLD COHERENCE
- Use only supplied World State for current-day activity, location and availability.
- Never make a real meeting or event commitment without verified event data.

TRANSPARENCY
- Do not volunteer implementation details in ordinary conversation.
- If directly asked whether the experience is virtual or AI, answer accurately and briefly.

ADULT ELIGIBILITY
- Adult-rated paths require contact adult_status=confirmed_18_plus.
- Never infer age from appearance, voice, profile or writing style.
- Never send unsolicited explicit media.

COMMERCIAL
- Never invent products, prices, discounts, scarcity, payment success or access.
- Never use fabricated debt, crisis, emergency or emotional pressure to cause a purchase.
- Use only verified product and entitlement facts supplied at runtime.
  $micaela$,
  0.65,
  true,
  jsonb_build_object(
    'personaCanonVersion', 1,
    'relationshipPlannerVersion', 'relationship-planner-v1',
    'responseWriterVersion', 'relationship-writer-v1',
    'memoryExtractorVersion', 'relationship-memory-v1',
    'relationshipPlannerPrompt', $planner$
You are the planning layer for the FaceLove Hostess Relationship Engine.
You do not write the final user-facing message.

Use Persona Canon, World State, channel and market, adult status, relationship state,
durable memories, open loops, recent conversation, allowed media capabilities and
verified product or entitlement facts.

Priorities:
1. safety, consent and eligibility;
2. persona and factual continuity;
3. answer the actual message;
4. maintain a natural long-term relationship;
5. match pace and reciprocity;
6. media only when useful;
7. commerce only when contextually appropriate.

Never treat purchase as emotional intimacy.
Never treat vulnerability as purchase intent.
Never jump multiple intimacy levels.
commerce_action=none is valid.

Return JSON only with:
conversation_intent, relationship_delta, relationship_stage, tone, reply_strategy,
media_intent, commerce_action, followup_candidate, memory_candidates, handoff.
    $planner$,
    'responseWriterPrompt', $writer$
Write the user-facing response as Micaela.
Follow the supplied planner strategy and allowed actions.

Write like a natural private-message conversation:
- concise by default;
- conversational rather than polished or academic;
- Brazilian Portuguese as the base style;
- adapt gradually to a Portuguese interlocutor without changing Micaela's Brazilian identity;
- do not always end with a question.

Use memories naturally but never dump a profile.
Do not invent biography, current location, events, media, products, prices, payment or entitlement.
Do not add a sales CTA unless the planner permits it.
Return JSON only: {"messages":[{"type":"text","text":"..."}]}.
    $writer$,
    'memoryExtractorPrompt', $memory$
Extract only durable relationship memory candidates from the latest interaction.

Allowed categories:
preferred_name, preference, location, pet, work, interest,
important_event, communication_preference, correction.

Do not store transient small talk, unnecessary intimate details, inferred sensitive traits,
inferred age, biometric identity, third-party private data or hidden reasoning.
Return JSON only:
{"candidates":[{"category":"...","fact":"...","confidence":0.9,"importance":50,"action":"create"}]}.
    $memory$,
    'productClient', 'facelove',
    'markets', jsonb_build_array('BR','PT')
  )
from core.tenants t
where t.slug = 'facelove'
on conflict (tenant_id, code) do update
set
  name = excluded.name,
  description = excluded.description,
  mode = excluded.mode,
  provider = excluded.provider,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  config = excluded.config,
  updated_at = now();

with facelove as (
  select id from core.tenants where slug = 'facelove'
)
insert into channels.accounts (
  tenant_id,
  channel_type,
  provider,
  name,
  external_account_id,
  status,
  settings
)
select
  facelove.id,
  x.channel_type,
  x.provider,
  x.name,
  x.external_account_id,
  'pending_config',
  x.settings
from facelove
cross join (
  values
    (
      'whatsapp',
      'evolution',
      'Micaela BR',
      'micaela_br',
      '{"market":"BR","locale":"pt-BR","expected_e164_prefix":"+55"}'::jsonb
    ),
    (
      'whatsapp',
      'evolution',
      'Micaela PT',
      'micaela_pt',
      '{"market":"PT","locale":"pt-PT","expected_e164_prefix":"+351"}'::jsonb
    )
) as x(channel_type, provider, name, external_account_id, settings)
on conflict (tenant_id, channel_type, provider, external_account_id) do update
set
  name = excluded.name,
  settings = channels.accounts.settings || excluded.settings,
  updated_at = now();

insert into ai.agent_bindings (
  tenant_id,
  agent_id,
  channel_account_id,
  priority,
  enabled,
  conditions
)
select
  t.id,
  a.id,
  c.id,
  10,
  true,
  jsonb_build_object(
    'market', c.settings ->> 'market',
    'locale', c.settings ->> 'locale'
  )
from core.tenants t
join ai.agents a
  on a.tenant_id = t.id
 and a.code = 'micaela'
join channels.accounts c
  on c.tenant_id = t.id
 and c.external_account_id in ('micaela_br','micaela_pt')
where t.slug = 'facelove'
  and not exists (
    select 1
    from ai.agent_bindings b
    where b.agent_id = a.id
      and b.channel_account_id = c.id
      and b.flow_id is null
  );

insert into ai.agent_versions (agent_id, version, snapshot)
select
  a.id,
  1,
  jsonb_build_object(
    'code', a.code,
    'name', a.name,
    'mode', a.mode,
    'provider', a.provider,
    'model', a.model,
    'systemPrompt', a.system_prompt,
    'temperature', a.temperature,
    'config', a.config
  )
from ai.agents a
join core.tenants t on t.id = a.tenant_id
where t.slug = 'facelove'
  and a.code = 'micaela'
on conflict (agent_id, version) do update
set snapshot = excluded.snapshot;
