Atlas Group OS V2 integration report — 2026-10-02

Canonical current-state architecture: [docs/architecture/README.md](architecture/README.md).

The existing integration was repaired in place against upstream commit `f47dc6a31db118e0047decd1ea50e6a97a30df48`. The upstream baseline history was preserved; the candidate is consolidated on local branch `feat/atlas-group-os-v2-integration`. No production container, service, database, deployment or secret was accessed or modified. No migration was executed. Integration and staging support are committed locally; no merge, push or activation is part of this consolidation.

1. Original failures and root causes

| Failure / finding | Root cause | Correction |
| --- | --- | --- |
| `npm install` postinstall: `prisma: Permission denied` | Copied Prisma CLI file lacked executable permission; the explicit postinstall command also ignored the requested skip flag | Node-based CLI invocation and a postinstall wrapper honoring `PRISMA_SKIP_POSTINSTALL_GENERATE=1` |
| TS2554 in approved-action resume | Agent Pack overlay replaced the approval-aware policy implementation with a single-argument policy | Preserve pack/manual authorization while restoring definition integrity, scoped approved request, expiry and persisted human decision checks |
| Four TS2339 errors for approval ID/output | Action result statuses widened to `string`, preventing discriminated-union narrowing | Literal suspended/completed return types |
| TS2353 on suspended result argument | Response helper does not accept a status property | Remove redundant argument property; durable suspended update and suspended response remain |
| TS2769 constructing ToolRegistry Map | Type inference selected the first concrete tool class | Explicit shared `RuntimeTool` Map type |
| Follow-up TS2339 (`never.status`) | Literal statuses made an old defensive branch unreachable | Remove impossible branch |
| Nest guard dependencies unavailable in new module scopes | Sibling AppModule imports do not export Auth providers into each feature | Import AuthModule in all six new controller modules; compile/init test uses a mocked database |
| Invalid RLS DDL in four migrations | PostgreSQL ALTER TABLE accepts one target table, not a comma-separated table list | One RLS statement per table |
| API startup initialized BullMQ eagerly | Queue constructor ran during provider construction | Initialize on first enqueue; shutdown works with no Redis configuration |
| Invalid/fractional worker concurrency | Numeric conversion could produce NaN or a fraction | Finite integer handling, default 1, clamp 1–4 |
| Repeated approval/action continuation could race | Read then unconditional update | Conditional durable claims before approved action execution and Runtime continuation |
| Executive totals truncated at 50 approvals/decisions and 25 runs/jobs | Counts used capped display lists | Canonical count/groupBy queries independent of display limits |
| Unsupported tool constraints silently ignored | Authorization selected only tool codes | Fail closed on nonempty constraints; reject constrained pack-tool additions |
| Knowledge search only checked chunk organization | Joined rows were not independently scoped | Parameterized organization predicates on chunks, documents and sources |
| Container builds were not locked or independent of database configuration | Dockerfile used npm install and implicit generation | npm ci, explicit synthetic generation URL, copied postinstall wrapper before install, production dependency pruning |
| Nested environment files could enter image context | dockerignore excluded only the root .env | Exclude nested .env variants, retaining examples |

2. Files changed during repair

Existing integration repairs:

- `src/runtime/actions/runtime-action.service.ts`, `src/runtime/runtime-run.service.ts`, `src/runtime/tools/tool-registry.service.ts`, `src/runtime/tools/tool-authorization.service.ts`, `src/runtime/policy/policy-engine.service.ts`, `src/runtime/runtime.module.ts`.
- `src/execution-v2/agent-queue.service.ts`, `src/execution-v2/agent-execution-worker.service.ts`, `src/execution-v2/redis-connection.ts`, `src/execution-v2/execution.module.ts`.
- `src/group-os/group-os.module.ts`, `src/knowledge/knowledge.module.ts`, `src/knowledge/knowledge-query.ts`, `src/agent-packs/agent-packs.module.ts`, `src/agent-packs/agent-packs.service.ts`, `src/executive/executive.module.ts`, `src/executive/executive.service.ts`.
- RLS syntax in `20261001_atlas_group_os_foundation_v1.sql`, `20261001_atlas_runtime_v2_slice2_tools_policy.sql`, `20261001_atlas_runtime_v2_slice6_knowledge.sql`, `20261001_atlas_agent_packs_v1.sql`.
- `package.json`, `package-lock.json`, `Dockerfile`, `.dockerignore`.

New repair/support files (including final consolidation): `scripts/prisma-postinstall.cjs`, `database/atlas-v2-migration-order.json`, `tests/atlas-integration.test.cjs`, `tests/atlas-canonical-state.test.cjs`, `tests/atlas-migrations.test.cjs`, `deploy/staging/docker-compose.yml`, this report, `deploy/staging/README.md`, `deploy/staging/ATLAS-DEV-ACCEPTANCE.md` and seven `database/verification/` read-only catalog queries.

The original Prisma/AppModule overlays, environment examples, production Compose/deploy overlays, remaining new Atlas sources, migrations and seed remain in the checkout. The implementation is grouped atomically because its modules, schema, dependency lock and tests are interdependent. The release diff includes all formerly untracked integration files.

3. Prisma validation: GREEN

`DATABASE_URL=postgresql://atlas_build:atlas_build@127.0.0.1:5432/atlas_build node node_modules/prisma/build/index.js validate` passed. No schema correction was necessary. No database connection occurred.

4. Prisma generation: GREEN

`DATABASE_URL=postgresql://atlas_build:atlas_build@127.0.0.1:5432/atlas_build npm run prisma:generate` generated Prisma Client 6.19.2 successfully.

5. Dependencies and TypeScript/Nest build: GREEN

Both npm install and a final clean npm ci passed with generation skipped. Node 22.23.2 meets the repository engine requirement. `npm run build` passed; `npm test` also rebuilds before testing. package-lock.json records resolved versions. Docker image construction itself was not executed.

6. Tests: GREEN, 49 passed, zero failed/skipped

The repository had no test script or test suite for the new integration. Added Node test-runner tests cover policy integrity, expired/missing/revoked approvals, durable human decisions, pack lifecycle and organization scope, explicit grants, unsupported constraints, ToolRunner denial, canonical Executive counts, SQL parameterization, provider name mapping, unknown proposals, Redis /2 isolation, queue payloads, worker claims, synchronous Runtime, durable suspension/resume, duplicate approved-action claims, Nest provider/guard resolution, migration grammar and dependency order. Database/provider/queue execution is mocked. Real Auth, model requests, Redis execution and database migrations remain staging checks.

7. Migration review and required order

Use `database/atlas-v2-migration-order.json`; do not sort filenames alphabetically. Apply after the approved upstream Atlas foundation and prerequisite upstream migrations already exist:

1. `20261001_atlas_runtime_v2_slice1.sql`
2. `20261001_atlas_group_os_foundation_v1.sql`
3. `20261001_atlas_runtime_v2_slice2_tools_policy.sql`
4. `20261001_atlas_runtime_v2_slice4_model_tools.sql`
5. `20261001_atlas_runtime_v2_slice5_execution_jobs.sql`
6. `20261001_atlas_runtime_v2_slice6_knowledge.sql`
7. `20261001_atlas_agent_packs_v1.sql`

RuntimeRun precedes RuntimeStep/Event/Action/ExecutionJob. Group OS creates portfolio/governance/finops before operational memory. Knowledge creates sources before Agent Pack knowledge bindings. Table-local and cross-schema FK targets exist in this order. Core foundation supplies schemas, gen_random_uuid() availability and core.set_updated_at(). Supabase roles anon/authenticated must exist for REVOKE statements. All seven files and the optional seed parse with the PostgreSQL grammar parser without a server connection.

Knowledge uses a stored tsvector expression with fixed `simple` configuration and a GIN index. Partial membership/policy uniqueness, status/risk checks, budget date/amount constraints, version bounds and primary/foreign keys were reviewed. Runtime trace, status, queue, source, project and authorization indexes are present. Additional FK-side indexes may be needed as staging volume grows; no performance benchmark was performed.

Replay uses IF NOT EXISTS for tables/indexes/schemas/columns and drop-if-exists followed by trigger recreation. These guards do not repair divergent existing definitions. Execute transactionally, verify catalog definitions/checksums before replay, and rehearse twice in staging. The parser does not validate PL/pgSQL function bodies, role existence, privileges or generated-expression execution. The optional seed requires core.organizations.slug = atlas-internal; otherwise it inserts nothing. Replaying the seed updates canonical operating structure, including statuses, so it is an explicitly reviewed bootstrap step rather than a routine migration.

Approval request run/action IDs, runtime approval IDs and FinOps usage run IDs are application-managed soft links in this overlay, not database-enforced FKs. Tenant/organization consistency across independently referenced records is enforced by trusted services rather than composite SQL FKs. New Prisma models intentionally do not fully describe SQL FKs, partial indexes, checks, RLS, triggers or the generated tsvector. SQL migrations are authoritative; Prisma db push and Prisma-generated migration diffs are unsuitable for activation of this integration.

PostgreSQL syntax/reference: [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html), [generated columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html).

8. Docker and worker review: static GREEN

Production and isolated staging Compose files passed `docker compose --env-file /dev/null ... config --no-interpolate --no-env-resolution --quiet`. Production deploy.sh passed bash -n; it was never executed. Production keeps Chatwoot /0, Evolution /1 and Atlas /2. Runtime validates Atlas /2. Worker has database/model/Redis environment and default concurrency 1. Only executionJobId enters BullMQ; prompts stay in durable database requests. API does not initialize Redis until enqueue. Synchronous Runtime works independently. Worker depends on Redis health; API does not add a Redis startup dependency. Dedicated staging Compose has its own network/volume and a loopback-only API port, with no production service dependencies.

9. Security/governance review

The model produces proposals; trusted Runtime resolves/validates tools, persists envelopes, evaluates policy, suspends side effects, records human approval, rechecks policy and runs the tool with trace/audit. Pack permission requires approved version, active assignment and active pack in the tenant organization; explicit grants remain supported. Recheck denies disabled definitions, revoked authorization, integrity mismatch, unmatched approval, expired approval and missing human decision. Registration does not re-enable an already disabled definition. Relationship Memory, organization Knowledge, ProjectMemory and continuation state remain separate. Executive summaries use canonical state and grouped usage, not LLM arithmetic. Provider specifics remain behind ModelGateway/OpenRouterProvider. No second backend was introduced.

Tool constraints are unsupported and fail closed. Fixed policy rules are implemented; the GovernancePolicy rule JSON is stored canonical data and is not a general executable policy DSL. Agent Pack instructions/model/capability policy fields and knowledge bindings are stored, but full runtime consumption is not implemented in this slice. Organization-level endpoints expose organization state to authenticated tenant members in that organization; a stricter organization-role model would require a separate product decision.

10. Remaining blockers/limitations

No remaining compile/schema/test blocker. Controlled staging still needs a separate database/Auth environment, backup, real migration/replay rehearsal, image build, authenticated API smoke tests and real worker/Redis/model tests.

npm audit reports four high-severity entries through Prisma 6.19.2 tooling: Prisma, @prisma/config, deepmerge-ts and effect. The concrete advisories are [DeepmergeTS recursion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) and [Effect context contamination](https://github.com/advisories/GHSA-38f7-945m-qr2g). npm audit --omit=dev still reports this chain because of optional peer resolution; do not assume production pruning removes it. A forced Prisma downgrade/major change was not made. Resolve or explicitly accept this exposure before production activation.

Worker attempts remain 1 to avoid blind side-effect replay. Crash recovery can leave claimed jobs/actions/runs requiring operator reconciliation; exactly-once execution is not guaranteed. Tool timeouts do not cancel an already running side effect. Some writes and audit records are separate transactions. FinOps UsageRecord totals only cover explicitly recorded usage; automatic attribution of every Runtime model call to UsageRecord is not implemented. These limits are suitable for monitored staging, not unattended broad production activation.

11. Exact staging activation

Follow `deploy/staging/README.md`, which supplies the command sequence, prerequisites, ordered transactional migration/replay, backup, isolated Compose startup and smoke-test requirements. No activation command was executed in this session.

12. Exact rollback

Follow the rollback sequence in `deploy/staging/README.md`: stop only the staging API/worker, retain additive schema, restart the previously reviewed immutable staging image, and reconcile outstanding durable IDs before worker restart. Restore a backup only into a newly provisioned isolated replacement staging database if exact database rollback is necessary. No rollback or destructive operation was executed.

13. Consolidation commits

1. `feat(atlas): consolidate governed Group OS V2 integration` — all interdependent Atlas modules, Prisma/AppModule, migrations/seed/manifest, locked dependencies, build support, per-migration verification SQL and regression tests.
2. `chore(staging): prepare Atlas.Dev activation and rollback` — production configuration overlays (statically reviewed only), isolated staging Compose/runbooks, the 22-step Atlas.Dev acceptance procedure and this report.

The initial implementation remains one coherent change to avoid artificial, broken intermediate architecture slices. Exact commit IDs are reported from git after consolidation. No merge or push is authorized by this mission.

14. Readiness decision

Ready for controlled staging activation with the documented prerequisites and monitored scope. Prisma validation/generation, reproducible dependency installation, Nest compilation and all relevant tests are green. Production activation remains gated by the live staging checks and dependency/security/recovery limitations above.

15. Final review hardening

Approval reuse now requires deep equality of the persisted approval tool/version/capability/input payload with the action envelope. Resume also rejects any saved tool version, capability, side-effect classification or risk drift. Authorization first verifies an enabled agent in the requesting tenant. Six regression cases protect those boundaries. Seven additional tests parse read-only per-migration verification SQL. These are targeted repairs; Runtime suspended/completed/failed transitions and model continuation remain intact.

Final source review checked staged additions as well as the tracked diff, whitespace, dependency lock, environment examples and image context. No temporary diagnostic artifact or generated node_modules/dist output is included. The staging acceptance runbook supplies all 22 requested checks and exact request bodies, plus first-target identities and durable evidence requirements. Live tests and activation remain unexecuted. READY FOR CONTROLLED STAGING: YES, subject to the documented isolated-environment prerequisites; this is not production approval.
