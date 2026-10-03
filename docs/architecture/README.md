# Atlas canonical current-state architecture

This index is the canonical entry point for the architecture of the current checkout. It separates versioned implementation from facts requiring live verification. The integration report remains the repair and validation record; staging instructions remain the activation procedure.

- [Current infrastructure](ATLAS-CURRENT-INFRASTRUCTURE-2026-10-02.md)
- [Communication flows](ATLAS-COMMUNICATION-FLOWS-2026-10-02.md)
- [Service and data map](ATLAS-SERVICE-DATA-MAP-2026-10-02.md)
- [Machine-readable state](atlas-current-state.json)

Evidence boundary: repository evidence recorded on 2026-10-02 on `feat/atlas-group-os-v2-integration`; reconciled on 2026-10-03 from starting commit `36d5a04`. Source behavior is **IMPLEMENTED-CODE**; production Compose is **CONFIGURED-CANDIDATE**. Current live activation, DNS, image digests, migration state and provider reachability remain **UNKNOWN/REVERIFY**. No production access or migration execution occurred in this documentation mission. Historical live-environment facts are sourced from the documented 2026-09-30 Atlas HQ read-only baseline. They remain dated evidence and require revalidation before destructive or production-changing actions.

## Evidence and maintenance

Every diagram describes **IMPLEMENTED-CODE** or **CONFIGURED-CANDIDATE** source/configuration at the inspection date. A configured edge does not prove successful traffic. Preserve evidence date and source when updating; never promote configured or tested-with-mocks behavior to a live observation. Record unverified current state as `UNKNOWN/REVERIFY`.

Primary evidence: [integration report](../atlas-v2-integration-report.md), [production Compose](../../deploy/production/docker-compose.yml), [Caddy routes](../../deploy/production/Caddyfile), [staging Compose](../../deploy/staging/docker-compose.yml), [staging runbook](../../deploy/staging/README.md), [acceptance procedure](../../deploy/staging/ATLAS-DEV-ACCEPTANCE.md), [Prisma schema](../../prisma/schema.prisma), [migration order](../../database/atlas-v2-migration-order.json), [migrations](../../database/migrations/), [tests](../../tests/), and linked source files in the other documents.

The 49 passing tests reported by the integration report are historical integration evidence with mocked database/provider/queue boundaries. They do not establish real Auth, model, Redis or migration acceptance. This mission validates documentation only.

To verify live state later, retain sanitized service/image inventory, DNS/TLS evidence, catalog/migration checksums, scoped Auth and API results, Redis database isolation, provider response/usage and approval/action trace evidence. Follow the staging runbook and acceptance procedure; do not treat these documents as deployment authorization.

## Canonical evidence vocabulary

Use exactly: `LIVE-OBSERVED`, `OPERATOR-CONFIRMED`, `CONFIGURED-CANDIDATE`, `IMPLEMENTED-CODE`, `STAGING-READY`, `STAGING-VALIDATED`, `PRODUCTION-VALIDATED`, `PLANNED`, `UNKNOWN/REVERIFY`. Attach dates and sources to evidence; readiness does not establish validation.

| Scope | Classification |
| --- | --- |
| 2026-09-30 host, network and running stack inventory | LIVE-OBSERVED, dated Atlas HQ read-only baseline |
| atlas-codex engineering/bootstrap identity | OPERATOR-CONFIRMED during current implementation |
| Production Compose and Caddy declared in atendimento-center | CONFIGURED-CANDIDATE on current branch |
| Runtime V2, Group OS, Knowledge, Agent Packs, Executive, atlas.agent queue, approval/revalidation path, Redis /2 enforcement | IMPLEMENTED-CODE |
| Staging Compose, ordered migrations, verification SQL, Atlas.Dev acceptance runbook | STAGING-READY |
| Staging acceptance and production Atlas V2 activation | UNKNOWN/REVERIFY; neither STAGING-VALIDATED nor PRODUCTION-VALIDATED |
| Portfolio retention, freeze/cold and conditional retirement intent | PLANNED |
