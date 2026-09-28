# Atlas Relationship Engine v1

## Scope

Atlas Relationship Engine is the reusable persistent-agent runtime inside Atendimento.Center / Atlas Engage.

**FaceLove is a client tenant. Micaela is the first concrete client agent.**

The runtime is intentionally generic so later agents such as LIA, MyTrainX personas, Atlas sales/support agents and future commercial tenants can reuse the same foundation without copying FaceLove-specific code.

## Existing components reused

- `core.tenants` — client/tenant isolation.
- `crm.contacts` — canonical person/contact record.
- `channels.accounts` — WhatsApp, Meta, web and other channel accounts.
- `channels.conversation_refs` — references to external conversations.
- `ai.agents`, `ai.agent_versions`, `ai.agent_bindings` — agent configuration, versioning and channel bindings.
- Chatwoot — operational inbox and human takeover surface.
- Evolution API — WhatsApp transport.
- OpenRouter — current model-provider abstraction.
- Typebot — optional deterministic/acquisition flows.
- n8n — workflow/orchestration and deterministic side effects.

Typebot and n8n are not the source of long-term relationship memory.

## Relationship state added

- `channels.contact_identities` — platform/channel-scoped identity resolution.
- `ai.relationship_states` — relationship stage plus 0-100 dimensions.
- `ai.conversation_memories` — validated durable memory.
- `ai.conversation_summaries` — rolling per-conversation summaries.
- `ai.open_loops` — unresolved conversational threads.
- `ai.world_states` — controlled persona day/context state.
- `ai.agent_runs` — planner decisions, final action envelopes and idempotency.
- `ai.followups` — contextual future follow-up registry.

## Runtime

### Canonical inbound

`POST /api/v1/relationship/inbound`

This is the normalized channel entrypoint for authenticated internal orchestration (for example n8n). It:

- resolves the configured `ChannelAccount`;
- selects the active `AgentBinding`;
- normalizes WhatsApp identities to exact E.164 or keeps platform-scoped social IDs;
- creates/reuses the Atlas `Contact` and `ContactIdentity`;
- creates/reuses the `ConversationRef`;
- returns non-text media events for the multimodal pipeline;
- sends text events directly through the Relationship Engine;
- uses the provider `eventId` for response idempotency.

Provider-specific webhook verification and outbound delivery remain adapter/orchestration responsibilities.

### Context

`GET /api/v1/relationship/:agentCode/contacts/:contactId/context`

Returns the current agent/person context without creating relationship state as a side effect.

### Respond

`POST /api/v1/relationship/respond`

Example input:

```json
{
  "agentCode": "micaela",
  "contactId": "<atlas-contact-uuid>",
  "eventId": "provider-event-id",
  "conversationRefId": "<optional-atlas-conversation-ref-uuid>",
  "currentMessage": "Oi, lembra de mim?",
  "recentConversation": [
    {"role":"user","content":"..."},
    {"role":"assistant","content":"..."}
  ],
  "runtime": {
    "verified_entitlements": [],
    "available_media": []
  }
}
```

The runtime executes:

```text
Context Loader
  -> Relationship Planner
  -> Response Writer
  -> Memory Extractor
  -> deterministic validation/persistence
  -> Action Envelope
```

The response is an action envelope. The LLM never performs provider/payment/media side effects directly:

```json
{
  "messages": [{"type":"text","text":"..."}],
  "media_request": null,
  "commerce_request": null,
  "followup_request": null,
  "relationship_delta": {},
  "memory_candidates": [],
  "handoff": false
}
```

Backend/n8n adapters are responsible for validating media assets, products, payment, entitlement, scheduling and outbound delivery.

## Safety and integrity properties

- An `eventId` makes a completed AI run idempotent.
- Relationship numeric deltas are allow-listed and capped per turn; persisted values remain within 0..100.
- The memory extractor can fail without blocking the conversational reply.
- Memory categories are allow-listed and require a confidence threshold before persistence.
- Adult-rated media intents are suppressed unless `adult_status=confirmed_18_plus`.
- The LLM cannot mark payment or entitlement as completed.
- Hidden chain-of-thought is never persisted.
- Cross-channel identity must be explicit/verified; no automatic merge by display name or photograph.

## FaceLove / Micaela v1

The FaceLove bootstrap migration registers:

- FaceLove AI runtime enabled.
- agent code `micaela`, mode `freeform`;
- Persona Canon v1;
- Relationship Planner v1;
- Response Writer v1;
- Memory Extractor v1;
- placeholder channel accounts `micaela_br` and `micaela_pt`;
- bindings for BR and PT.

The channel records stay `pending_config` until their real Evolution/Chatwoot references are attached.

No provider secrets, phone numbers, private media links or private user data are committed to Git.

## Implementation boundary

FaceLove remains responsible for FaceLove product data: profiles, media catalog, albums, products/tiers, entitlements and access links.

The Relationship Engine stores conversational state and emits intents such as `media_request` or `commerce_request`. Product services resolve those intents into real assets/offers.

## Next vertical slice

1. Apply `20260928_relationship_engine_v1.sql` to Atlas Platform Core.
2. Apply `20260928_bootstrap_facelove_micaela_v1.sql`.
3. Attach real Evolution instances and Chatwoot inbox references to `micaela_br` and `micaela_pt`.
4. Normalize inbound Chatwoot/Evolution events.
5. Resolve exact E.164/platform identity into `channels.contact_identities`.
6. Call `relationship/respond`.
7. Validate the returned envelope in backend/n8n.
8. Send through Chatwoot/Evolution.
9. Prove returning-contact memory and immediate human/AI-off takeover.
10. Only then enable FaceLove media/premium fulfillment.
