# Atlas canonical current-state architecture

This index is the canonical entry point for the architecture of the current checkout. It separates versioned implementation from facts requiring live verification. The integration report remains the repair and validation record; staging instructions remain the activation procedure.

- [Current infrastructure](ATLAS-CURRENT-INFRASTRUCTURE-2026-10-02.md)
- [Communication flows](ATLAS-COMMUNICATION-FLOWS-2026-10-02.md)
- [Service and data map](ATLAS-SERVICE-DATA-MAP-2026-10-02.md)
- [Machine-readable state](atlas-current-state.json)

Evidence boundary: repository inspected on 2026-10-02 on `feat/atlas-group-os-v2-integration`. Descriptions of source and Compose below are versioned implementation/configuration evidence, not live deployment verification. Live activation, DNS, image digests, database migration state and provider reachability are **UNKNOWN/REVERIFY**. No production access or migration execution occurred in this documentation mission. `LIVE-OBSERVED AS OF 2026-09-30` is reserved for dated external observations with evidence; none were available to substantiate here. The previous mission's complete evidence/status vocabulary and external facts were not present in the supplied history or local documents; no additional status vocabulary is invented.

## Evidence and maintenance

Every diagram describes source/configuration at the inspection date. A configured edge does not prove successful traffic. Preserve evidence date and source when updating; never promote configured or tested-with-mocks behavior to a live observation. Record missing historical evidence as `UNKNOWN/REVERIFY`.

Primary evidence: [integration report](../atlas-v2-integration-report.md), [production Compose](../../deploy/production/docker-compose.yml), [Caddy routes](../../deploy/production/Caddyfile), [staging Compose](../../deploy/staging/docker-compose.yml), [staging runbook](../../deploy/staging/README.md), [acceptance procedure](../../deploy/staging/ATLAS-DEV-ACCEPTANCE.md), [Prisma schema](../../prisma/schema.prisma), [migration order](../../database/atlas-v2-migration-order.json), [migrations](../../database/migrations/), [tests](../../tests/), and linked source files in the other documents.

The 49 passing tests reported by the integration report are historical integration evidence with mocked database/provider/queue boundaries. They do not establish real Auth, model, Redis or migration acceptance. This mission validates documentation only.

To verify live state later, retain sanitized service/image inventory, DNS/TLS evidence, catalog/migration checksums, scoped Auth and API results, Redis database isolation, provider response/usage and approval/action trace evidence. Follow the staging runbook and acceptance procedure; do not treat these documents as deployment authorization.
