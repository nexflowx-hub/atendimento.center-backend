Atlas V2 controlled staging activation and rollback

This is a future operator procedure. It was not executed during integration verification. Use only the dedicated staging Compose file, never deploy/production/deploy.sh.

The complete first-target checklist and exact API payloads are in [ATLAS-DEV-ACCEPTANCE.md](ATLAS-DEV-ACCEPTANCE.md). It provisions Atlas Internal / Technology / ATLAS-GROUP-OS / Atlas.Dev and requires a real governed Runtime task with trace evidence. Run each matching `database/verification/<migration filename>` immediately after its migration; inspect every expected catalog row before proceeding.

1. Provision prerequisites

Provide a separate staging PostgreSQL/Supabase database and staging Auth project. It must contain the approved upstream Atlas baseline schemas/tables, upstream prerequisite migrations, anon/authenticated roles, gen_random_uuid() and core.set_updated_at(). Do not clone production secrets or connect this procedure to production. Use synthetic tenant/user/agent data. PostgreSQL 14+ is the supported minimum for this runbook; verify actual staging version and generated-column behavior during rehearsal.

An operator supplies a protected environment file outside the checkout at `/tmp/atlas-v2-staging.env` with ATLAS_STAGING_IMAGE (a new immutable image tag), ATLAS_STAGING_DATABASE_URL, ATLAS_STAGING_SUPABASE_URL, ATLAS_STAGING_SUPABASE_ANON_KEY, optional ATLAS_STAGING_OPENROUTER_API_KEY, optional ATLAS_STAGING_OPENROUTER_MODEL, and ATLAS_STAGING_PREVIOUS_IMAGE when upgrading an existing staging instance. Keep it mode 0600. Do not print it or commit it. Configure a PostgreSQL service named atlas-v2-staging through the operator's private libpq service/password files, pointing to that same isolated staging database. Use a separate staging-only operator credential with DDL privileges. Application credentials must have the intended private-schema access/RLS behavior.

Confirm endpoint identities out of band before continuing. The compose file separates service/network/volume names and binds API to 127.0.0.1:18080; it does not create or choose a database for you. The staging Redis has no published port, and Atlas uses /2. Do not expose Redis or the API publicly during initial rehearsal. Record the previous image tag and migration state before upgrade. Grant no tools by default.

2. Reproduce repository checks

Run from the integration checkout:

```bash
set -euo pipefail
PRISMA_SKIP_POSTINSTALL_GENERATE=1 DATABASE_URL=postgresql://atlas_build:atlas_build@127.0.0.1:5432/atlas_build npm ci
DATABASE_URL=postgresql://atlas_build:atlas_build@127.0.0.1:5432/atlas_build node node_modules/prisma/build/index.js validate
DATABASE_URL=postgresql://atlas_build:atlas_build@127.0.0.1:5432/atlas_build npm run prisma:generate
npm test
docker compose --env-file /dev/null -f deploy/staging/docker-compose.yml config --no-interpolate --no-env-resolution --quiet
```

3. Backup and rehearse migrations before application startup

Only after confirming the PostgreSQL service points to the isolated staging database:

```bash
set -euo pipefail
umask 077
export PGSERVICE=atlas-v2-staging
export PGAPPNAME=atlas-v2-staging-activation
pg_dump --format=custom --file=/tmp/atlas-v2-staging-before.dump
pg_restore --list /tmp/atlas-v2-staging-before.dump >/dev/null
while IFS= read -r migration; do
  psql -X --set=ON_ERROR_STOP=1 --single-transaction --file="database/migrations/$migration"
done < <(node -e "for (const f of require('./database/atlas-v2-migration-order.json')) console.log(f)")
```

The backup-list check only validates archive readability. Rehearse restore into a separate staging database before accepting it as a recovery point. Run the same ordered migration loop a second time to verify replay on staging. Record migration checksums in your staging release record; IF NOT EXISTS does not reconcile drift. Run `sha256sum database/migrations/20261001_*.sql` to obtain the checksums.

Verify catalog state and generated search behavior in staging:

```bash
psql -X --set=ON_ERROR_STOP=1 <<'SQL'
select to_regclass('ai.runtime_runs'), to_regclass('ai.runtime_steps'),
       to_regclass('audit.runtime_events'), to_regclass('ai.runtime_actions'),
       to_regclass('ai.execution_jobs'), to_regclass('portfolio.projects'),
       to_regclass('governance.approval_requests'), to_regclass('finops.usage_records'),
       to_regclass('knowledge.sources'), to_regclass('knowledge.agent_pack_bindings');
select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('knowledge','portfolio','governance','finops') and c.relkind = 'r';
select pg_get_expr(ad.adbin, ad.adrelid)
from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
where ad.adrelid = 'knowledge.chunks'::regclass and a.attname = 'search_vector';
begin;
insert into core.organizations(id,slug,name) values ('00000000-0000-4000-8000-000000000001','atlas-staging-vector-test','Staging vector test');
insert into knowledge.sources(id,organization_id,scope_type,kind) values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','organization','test');
insert into knowledge.documents(id,organization_id,source_id,title,content,fingerprint) values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Test','atlas vector test','staging-vector-test');
insert into knowledge.chunks(organization_id,document_id,ordinal,content,char_count) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',1,'atlas vector test',17);
select search_vector @@ plainto_tsquery('simple','atlas') as must_be_true
from knowledge.chunks where document_id='00000000-0000-4000-8000-000000000003';
rollback;
SQL
```

Check all relations are non-null, RLS is enabled, stored expression is expected and must_be_true is true. Verify all FK/check/index/trigger definitions with staging's catalog inspection tools and confirm application-role access. Parser tests alone cannot establish these facts.

Optional seed: first ensure exactly one intended `atlas-internal` staging organization exists and its staging tenant is associated. Then explicitly run `psql -X --set=ON_ERROR_STOP=1 --single-transaction --file=database/seeds/20261001_atlas_internal_org_v1.sql`. The seed does not create the organization and may update statuses on replay.

4. Build and activate isolated staging services

```bash
set -euo pipefail
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml config --quiet
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml build backend
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml up -d redis backend
curl --fail --silent --show-error http://127.0.0.1:18080/api/v1/health
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml up -d --no-deps atlas_agent_worker
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml ps
```

Keep initial worker concurrency at 1. Before enabling it on an upgrade, reconcile existing queued/running jobs and pending approved actions; don't blindly replay uncertain side effects. The staging image build must succeed before continuing. Use a separate approved model key with a small cost limit if real model testing is enabled.

5. Required authenticated smoke tests

Use the staging Auth client/HTTP client with protected token storage, without writing tokens to command history, reports or logs. Exercise `/api/v1/group-os/structure`, projects/goals/tasks, knowledge ingest/search/project-memory, agent-pack draft/review/approve/assignment, `/api/v1/group-os/executive/brief`, `/api/v1/runtime/runs`, `/api/v1/runtime/jobs`, `/api/v1/runtime/approvals/:id/decision` and run inspection. Confirm:

- Anonymous access and insufficient-role mutations are denied; a second organization/tenant cannot access another tenant's runs/jobs or assign its agent packs.
- No-grant agents receive no tools. Draft/paused/foreign packs authorize nothing. Explicit grants work. Nonempty constraints authorize nothing.
- Read-only model/tool continuation completes synchronously before Redis/worker is needed. Queued execution uses the durable job ID and produces a canonical run/trace.
- A task-status side effect leaves the task unchanged until owner/admin human approval, then executes once and returns its tool result to model continuation. Denial cancels the continuation; expiry and revoked grants deny execution.
- Repeated approval requests/continuations do not execute the same action again. Test worker shutdown/restart and manually reconcile uncertain running jobs.
- Executive totals agree with canonical SQL counts beyond display caps. Knowledge search is scoped and full-text matches work. Observe costs from actual provider usage; empty FinOps usage is not evidence of zero Runtime cost.

Record evidence and dependency risk acceptance. This checklist is the staging acceptance gate; none of these live checks were claimed as completed during integration.

6. Roll back application activation

Stop only the dedicated staging backend/agent worker:

```bash
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml stop atlas_agent_worker backend
```

For an existing staging instance, use its previously recorded immutable image:

```bash
set -euo pipefail
set -a
. /tmp/atlas-v2-staging.env
set +a
export ATLAS_STAGING_IMAGE="${ATLAS_STAGING_PREVIOUS_IMAGE:?Previous reviewed staging image is required}"
docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml up -d --no-deps backend
curl --fail --silent --show-error http://127.0.0.1:18080/api/v1/health
```

This assumes the previous image runs the same backend entrypoint and remains compatible with additive schema. Keep the agent worker stopped if the previous image lacks dist/agent-worker.js or until pending IDs are reconciled. Start it with the same image override only if verified compatible. For first activation with no previous image, leave backend/worker stopped; do not invent an upstream image tag. Preserve the staging Redis volume and database for review. Do not use compose down -v or remove schemas to roll back the application.

7. Exact database-state recovery if application rollback is insufficient

Provision a new empty isolated staging replacement database with appropriate staging roles/extensions. Configure a separate libpq service `atlas-v2-staging-restore` pointing exclusively to that empty replacement. Restore the pre-activation archive there:

```bash
PGSERVICE=atlas-v2-staging-restore pg_restore --dbname='service=atlas-v2-staging-restore' --exit-on-error --single-transaction /tmp/atlas-v2-staging-before.dump
```

Verify the restored database with the previous staging application image. Update only the protected staging environment's database endpoint and matching libpq staging service through the operator's secret manager; restart only staging backend with the previous-image override above. Keep the old staging database for investigation. Replay no outstanding queue jobs automatically against the restored database. This restores exact pre-activation database contents without attempting destructive down-migrations on any running/shared database.
