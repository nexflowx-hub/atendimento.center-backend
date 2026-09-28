# Atlas Platform Core — Architecture v1

## Decision

The former Atendimento.Center backend becomes the first control-plane/API surface of **Atlas Platform**.

The platform has three immediate product engines:

1. **Atlas Engage** — CRM, omnichannel conversations, WhatsApp/Telegram/Meta/webchat, AI agents, conversational flows and automations.
2. **Atlas Growth / SMM** — provider catalog, public offers, pricing, order orchestration and fulfillment status.
3. **Atlas Signals** — social-intelligence ingestion for internal use and future commercialization, using official APIs first and controlled public-web connectors where permitted.

Existing finance platforms remain isolated:
- XPAYMENTS remains the system of record for payments/ledger/wallets.
- PiXBrasil remains the PIX/provider routing platform.
- The Novidades/AutoHub Supabase project remains the commerce/runtime lab for Atlas-owned storefronts and products.

## Data ownership

Supabase project `qguciygqckkbxhaboxjb` is the **Atlas Platform Core database**.

Schemas:

- `core` — organizations, tenants, memberships, entitlements.
- `crm` — contacts, leads, activities, appointment requests.
- `channels` — channel accounts and references to external conversations.
- `ai` — tenant AI configuration, agents, versions and bindings.
- `flows` — native/Typebot/n8n/external flow definitions and executions.
- `automation` — workflow registry and executions.
- `smm` — SMM providers, provider services, Atlas offers, orders and order events.
- `signals` — social connectors, monitored sources, collection jobs and collected items.
- `integrations` — external connections and webhook event inbox.
- `audit` — platform audit trail.

All Atlas business schemas are intentionally non-exposed to `anon` and `authenticated` PostgreSQL roles. The NestJS backend is the application boundary.

## Systems of execution

Atlas Platform is the control plane; specialized tools remain execution engines:

- Chatwoot — conversations/inboxes/operator workspace.
- Evolution API — WhatsApp transport.
- Telegram Bot API — Telegram transport.
- Meta APIs / Chatwoot channels — Facebook and Instagram.
- Typebot — visual deterministic/guided conversational flows.
- n8n — workflow/automation execution.
- OpenRouter and future model providers — LLM execution.
- Redis/BullMQ — asynchronous worker queues, polling and retries.
- External SMM providers — fulfillment.
- Social APIs / controlled collector workers — Atlas Signals ingestion.

Atlas stores normalized identities, routing, configuration, state references, audit data and commercial orders. It does not duplicate full Chatwoot or Typebot internal databases.

## Conversation modes

AI agents support four control modes:

- `closed_flow` — deterministic flow; AI only where explicitly permitted.
- `hybrid` — flow/rules plus free AI segments and tools.
- `freeform` — persona-led open conversation with policy/tool boundaries; FaceLove is the primary initial example.
- `tool_agent` — task agent focused on APIs/actions rather than long-form conversation.

A channel can bind an agent and optionally a flow. This allows each Atlas tenant to choose a different operating model without forking the platform.

## Initial internal tenants

The first migration registers:

- Atendimento.Center
- AtlasHub
- Novidades.Store
- FaceLove
- MyPets
- MyTrainX
- TreinoMilitar

These are Atlas Platform tenants. Their external Chatwoot/Evolution/commerce IDs are linked later through channel/integration records; no provider IDs are hard-coded into the database migration.

## SMM engine

The `smm` domain separates:

`provider -> provider service -> Atlas offer -> order -> provider fulfillment`

Provider identity/cost is internal. Public storefronts only consume Atlas offers.

Provider API credentials MUST NOT be stored in table JSON. Store only a `secret_ref`; runtime secrets belong in a secret manager/runtime environment.

Payments are referenced by `payment_system` and `payment_reference`. Atlas Platform does not implement a financial ledger.

## Atlas Signals / social intelligence

The first data model supports:

- official APIs,
- external data APIs,
- controlled public-web collection workers,
- manual imports.

Collection jobs are asynchronous and tenant-scoped. The engine stores normalized output plus raw provider payloads for traceability.

Collectors must not bypass authentication, private-account controls, CAPTCHAs/access controls, or platform security mechanisms. Official APIs and user-authorized access are preferred.

The UI may later be:
- an AtlasHub portal module,
- a standalone internal app,
- a white-label/Lovable-style frontend consuming the same Atlas API.

The backend/data model remains shared in all cases.

## Isolation model

A tenant is the operational isolation boundary. An organization may own multiple tenants.

Examples:

`Atlas Internal -> AtlasHub, FaceLove, MyPets, MyTrainX, Novidades.Store`

Future paying customers receive their own tenant and capability entitlements.

The Novidades commerce database remains separate and communicates by API/events/external references instead of cross-database foreign keys.

## Deployment direction

The current VPS stack remains useful:

`Caddy -> API / frontend / Chatwoot / Evolution`

with local execution databases for Chatwoot/Evolution and Redis.

Atlas business state moves to the Atlas Platform Supabase database.

Next runtime additions:

- `atlas-worker` — BullMQ worker for SMM polling, automations and integration events.
- `atlas-signals-worker` — isolated collector/browser workload for social intelligence.
- n8n — automation execution, behind private/internal access.
- Typebot — visual flow builder/viewer; keep its own Postgres.
- optional object storage for exports/collection artifacts.

Heavy browser collection must not run in the API process.

## Release order

### Wave 1 — Platform control plane
- map existing NestJS tenant/auth code to `core`
- create CRM/contact APIs
- channel mappings
- agent/flow registry
- audit logging
- bootstrap current Atlas tenants

### Wave 2 — Revenue first
- SMM provider adapters
- catalog sync
- margin/offer rules
- AtlasHub Growth catalog
- order creation
- XPAYMENTS checkout reference/webhook
- provider fulfillment worker
- customer order status

### Wave 3 — Social Intelligence
- connector abstraction
- job queue
- official API adapters first
- collector worker
- normalized datasets
- exports
- standalone/internal test UI

### Wave 4 — Automation + AI depth
- n8n registry/execution hooks
- Typebot registry/versioning
- freeform/hybrid agent orchestration
- knowledge/RAG
- human handoff
- lead qualification and CRM automations

## Production rules

- No `prisma db push` as the long-term production migration strategy.
- New DDL must be versioned.
- No secrets in Git or database JSON payloads.
- All webhook consumers must be idempotent.
- All provider jobs require retry/backoff and a terminal failed state.
- Every cross-system object should have an Atlas UUID plus external reference(s).
- XPAYMENTS and PiXBrasil remain independent financial systems of record.
