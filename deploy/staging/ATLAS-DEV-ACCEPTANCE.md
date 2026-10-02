Atlas.Dev staging acceptance procedure

Execute only after explicit staging activation authorization. Nothing in this procedure was executed during integration. Follow README.md for isolated database preparation, protected environment, backup/restore rehearsal, image build, startup and rollback. Do not run the production deploy script. Record image digest, branch commit, migration checksums and evidence IDs in a private staging release record.

1. Database preparation: provision a separate PostgreSQL 14+ / Supabase Auth staging environment, approved upstream foundation and prerequisite upstream migrations, anon/authenticated roles and core.set_updated_at(). Confirm the private libpq service atlas-v2-staging points exclusively to it. Confirm application credentials have the intended private-schema privileges and RLS behavior. No Prisma db push or generated Prisma migration deployment.
2. Backup: use the README pg_dump command before any migration; rehearse pg_restore into a separate empty staging database. Record previous immutable application image, migration state and durable queued/running IDs. Keep the archive private.
3. Environment: supply ATLAS_STAGING_IMAGE, ATLAS_STAGING_DATABASE_URL, ATLAS_STAGING_SUPABASE_URL, ATLAS_STAGING_SUPABASE_ANON_KEY, ATLAS_STAGING_OPENROUTER_API_KEY and optionally ATLAS_STAGING_OPENROUTER_MODEL in the protected external file. The model key is required for the real task, with a small spending limit. Compose supplies PORT=8080, NODE_ENV=staging, isolated ATLAS_REDIS_URL=redis://redis:6379/2 and worker concurrency 1. Never print resolved configuration or tokens.
4. Migration order and verification: use the manifest order below and the matching read-only verification SQL immediately after each file. Stop on any false result, missing expected row, invalid FK/check/index/trigger definition, or unexpected privileges. Save catalog output privately. These SQL files expose schema metadata only, never credential values.

```bash
set -euo pipefail
export PGSERVICE=atlas-v2-staging
export PGAPPNAME=atlas-v2-staging-activation
while IFS= read -r migration; do
  psql -X --set=ON_ERROR_STOP=1 --single-transaction --file="database/migrations/$migration"
  psql -X --set=ON_ERROR_STOP=1 --file="database/verification/$migration"
done < <(node -e "for (const f of require('./database/atlas-v2-migration-order.json')) console.log(f)")
```

Exact order: Runtime slice1 → Group OS foundation → Runtime slice2 tools/policy → slice4 continuation state → slice5 ExecutionJob → slice6 Knowledge → Agent Packs. The manifest contains the complete filenames. Verify slice1 run/step/event FKs and RLS; Group OS portfolio/governance/finops/core structure, partial unique indexes and update triggers; slice2 definitions/grants/actions and run/step FKs; slice4 state jsonb NOT NULL default {}; slice5 job/run FK and queue/status indexes; slice6 source/document/chunk/project-memory FKs, stored simple tsvector and GIN; packs approved-version/assignment/binding FKs. Review all catalog constraints against the matching SQL. Rehearse replay in the same order and rerun verification; IF NOT EXISTS does not repair drift. Run the rollback-only generated-vector insert/search transaction from README.md as a separate behavioral check.

5. Atlas Internal requirements: create a staging Auth owner user using the staging Auth console. Record its UUID (not its token). In the isolated staging database, execute the following with psql variable owner_user_id set to that UUID. Existing conflicting organization/tenant identity must be investigated before reuse; do not silently repoint a tenant.

```sql
begin;
insert into core.organizations(slug,name,kind,status)
values ('atlas-internal','Atlas Internal','internal','active') on conflict (slug) do nothing;
insert into core.tenants(organization_id,slug,name,product,status)
select id,'atlas-internal-staging','Atlas Internal Staging','platform','active'
from core.organizations where slug='atlas-internal' on conflict (slug) do nothing;
select o.id as organization_id,t.id as tenant_id,o.name,o.kind,o.status,t.status,
       t.organization_id=o.id as must_be_true
from core.organizations o join core.tenants t on t.slug='atlas-internal-staging'
where o.slug='atlas-internal';
insert into core.memberships(tenant_id,auth_user_id,role,active)
select t.id, :'owner_user_id'::uuid,'owner',true from core.tenants t
join core.organizations o on o.id=t.organization_id and o.slug='atlas-internal'
where t.slug='atlas-internal-staging'
on conflict (tenant_id,auth_user_id) do nothing;
commit;
```

Require exactly one matching active internal organization/tenant and active owner membership before continuing. This setup deliberately creates no production connector/channel credentials.

6. Seed: review and execute database/seeds/20261001_atlas_internal_org_v1.sql once, transactionally. It requires the organization above and updates statuses on replay. GET /api/v1/group-os/structure and GET /api/v1/group-os/projects must show Technology (code TECH), Team Atlas.Dev (atlas-dev), Project ATLAS-GROUP-OS. Record their UUIDs as BU_ID, TEAM_ID and PROJECT_ID. The seed also creates other operating structure; it creates no agent or pack.
7. Redis /2: before the worker starts, inspect only this Compose project's Redis. `docker compose --env-file /tmp/atlas-v2-staging.env -f deploy/staging/docker-compose.yml exec -T redis redis-cli -n 2 ping` must return PONG. After enqueue, scan `bull:atlas.agent:*` on /2. Atlas keys must be absent on /0 and /1. Production configuration preserves Chatwoot /0 and Evolution /1; do not query or restart their production instances.
8. Backend startup: execute README's staging build and `up -d redis backend`. Use a new immutable image tag. First prove synchronous Runtime works while the worker remains stopped. This Compose starts staging Redis, but API providers initialize the queue lazily; missing Redis must not block synchronous execution.
9. Worker startup: after synchronous acceptance, execute README's `up -d --no-deps atlas_agent_worker`; keep concurrency 1. Reconcile any prior claimed actions/jobs before enabling it.
10. Health: GET http://127.0.0.1:18080/api/v1/health must succeed. Verify only staging service status and sanitized errors. Anonymous protected requests and insufficient-role mutations must fail. Use a second synthetic tenant/organization to verify cross-tenant run/job reads and pack assignment are denied.

For the remaining steps, use a protected HTTP client configuration containing the staging bearer token and X-Tenant-Slug: atlas-internal-staging. Never put tokens into shell history or evidence. Every path below is relative to http://127.0.0.1:18080/api/v1. A reproducible command template is `curl --fail-with-body --silent --show-error --config "$ATLAS_STAGING_HTTP_CONFIG" -H 'Content-Type: application/json' --request POST --data-binary @request.json http://127.0.0.1:18080/api/v1/PATH`. Protect request/response evidence with umask 077; substitute recorded UUIDs into JSON with a JSON-aware editor. GET requests omit POST/body. The configuration file is external to the checkout and never printed.

11. Runtime baseline: POST /agents with `{"code":"atlas-dev","name":"Atlas.Dev","mode":"tool_agent","provider":"openrouter","enabled":true,"temperature":0.2,"systemPrompt":"You are the Atlas.Dev staging engineering agent. Use only offered tools, obtain evidence before conclusions, and propose task status changes through trusted Runtime. Never claim execution without a tool result."}`. Record AGENT_ID. POST /runtime/runs with `{"agentCode":"atlas-dev","input":"Reply Atlas.Dev ready; perform no tool calls."}`. Require completed status and persisted run/steps/events. An unassigned/no-grant agent must expose no tools. Runtime does not consume pack instructions automatically; the explicit agent prompt is therefore necessary.
12. Read-only tool smoke: after step 17 assignment, POST /runtime/runs with `{"agentCode":"atlas-dev","input":"Use atlas.executive.brief with empty input, then summarize only its canonical totals."}`. Require a completed read-only action, policy allow, model continuation and unchanged business state. A model-only answer without a persisted tool action is a failed smoke test.
13. Governed side effect and ApprovalEngine: after step 20 delegation creates TASK_ID, POST /runtime/runs with `{"agentCode":"atlas-dev","input":"For the staging task TASK_ID, propose atlas.portfolio.update_task_status with taskId TASK_ID and status review. Call no other tool. Report the actual tool result after approval."}`. Replace both TASK_ID occurrences with the real UUID. Require suspended run/action and pending approval; task must remain ready. Owner/admin POST /runtime/approvals/APPROVAL_ID/decision with `{"decision":"approved","reason":"Controlled Atlas.Dev staging acceptance"}`. Require policy revalidation, exactly one task update to review, completed action, persisted human decision, trace and model continuation. Inspect GET /runtime/runs/RUN_ID for final status. Repeat decision must not execute again. In separate synthetic tasks test denial, expiry, revoked tool grant/assignment, changed definition/input and missing human decision; require no mutation. Do not edit live pending approval payloads to make them pass. A run hitting the bounded turn limit is failed acceptance, not completion.
14. Knowledge ingest/search: POST /group-os/knowledge/documents with `{"scopeType":"project","scopeId":"PROJECT_ID","kind":"staging-runbook","title":"Atlas.Dev acceptance evidence","content":"Atlas staging acceptance marker atlasdevacceptance. Task status changes require human approval.","metadata":{"purpose":"staging-only"}}`. GET /group-os/knowledge/search?q=atlasdevacceptance&scopeType=project&scopeId=PROJECT_ID must return matching chunks with canonical source/document IDs. Foreign organization search must return no matching evidence.
15. Project Operational Memory: POST /group-os/projects/PROJECT_ID/memory with `{"category":"staging_validation","fact":"Atlas.Dev acceptance is governed and requires trace evidence.","importance":50,"confidence":1,"sourceRef":"staging-acceptance"}`. GET the same path must return the fact in this project and organization. Relationship Memory remains a separate subsystem; do not ingest conversational contacts into this project store.
16. Pack creation/version: POST /group-os/agent-packs with `{"code":"atlas-dev","name":"Atlas.Dev","role":"Engineering","department":"Technology"}`; record PACK_ID. POST /group-os/agent-packs/PACK_ID/versions with `{"instructions":"Perform engineering tasks only through offered governed tools and cite canonical evidence."}`; record VERSION_ID. Add each tool with POST /group-os/agent-pack-versions/VERSION_ID/tools and `{"toolCode":"TOOL_CODE","constraints":{}}`: atlas.runtime.inspect_run, atlas.knowledge.search, atlas.executive.brief, atlas.portfolio.update_task_status. Nonempty constraints are unsupported and must fail closed. No tools are authorized by this draft.
17. Review/approval/assignment: POST /group-os/agent-pack-versions/VERSION_ID/review with `{"evaluationStatus":"passed"}`; then POST /group-os/agent-pack-versions/VERSION_ID/approve with `{}`; then POST /group-os/agents/AGENT_ID/pack-assignment/VERSION_ID with `{}`. GET /group-os/agents/AGENT_ID/pack-assignment must show approved version, active assignment and active pack in this tenant's organization. There is no separate active-version state: approved version plus active pack/assignment is the authorization condition. Draft, paused/retired or foreign packs must authorize nothing. Explicit ToolGrant is independently supported: POST /runtime/tool-grants with {"agentCode":"atlas-dev","toolCode":"atlas.runtime.inspect_run"}, verify the scoped active grant, and PATCH /runtime/tool-grants/GRANT_ID with {"status":"revoked"} after its isolated smoke test. Test explicit authorization before pack assignment so pack permissions cannot hide a revoked grant. Constraints remain empty.
18. Async execution: after worker startup, POST /runtime/jobs with `{"agentCode":"atlas-dev","input":"Use atlas.executive.brief with empty input and summarize its canonical totals."}`; record JOB_ID. Poll GET /runtime/jobs/JOB_ID to terminal state. Require job completed, its metadata.runtimeStatus completed, linked canonical run, read-only action and trace. Queue completion alone is insufficient: a failed Runtime may be represented by a completed queue job carrying runtimeStatus failed. Inspect queue payload for executionJobId only. Shutdown/restart tests use only staging worker and synthetic read-only jobs. Claimed jobs left running after crash require manual reconciliation; attempts 1 avoids blind side-effect replay.
19. Executive brief: GET /group-os/executive/brief and /group-os/executive/decision-queue; compare organization-scoped totals to SQL count/groupBy of canonical projects/tasks/approvals/jobs/runs and recorded usage. Display lists can be capped; totals must not be. Missing UsageRecords do not mean provider cost is zero.
20. Executive delegation: POST /group-os/executive/delegations with `{"projectId":"PROJECT_ID","assigneeType":"team","assigneeId":"TEAM_ID","title":"Atlas.Dev controlled Runtime acceptance","description":"Validate a governed staging task and retain canonical evidence.","riskLevel":"medium","approvalRequired":true}`. Record the created TASK_ID; require canonical ready task assigned to Atlas.Dev and delegation audit. Delegation creates a task; it does not automatically launch a model/queue job. Execute step 13 with Atlas.Dev agent to obtain the first real governed result. Use separate runs for knowledge search and executive brief to stay within bounded Runtime turns.
21. Audit/trace acceptance: GET /runtime/runs/RUN_ID and inspect the matching private database records with a tenant predicate, using psql variables run_id and tenant_id:

```sql
select id,status,trace_id,agent_id from ai.runtime_runs
where id=:'run_id'::uuid and tenant_id=:'tenant_id'::uuid;
select s.id,s.ordinal,s.kind,s.status from ai.runtime_steps s join ai.runtime_runs r on r.id=s.run_id
where r.id=:'run_id'::uuid and r.tenant_id=:'tenant_id'::uuid order by s.ordinal;
select a.id,a.tool_code,a.status,a.policy_result,a.approval_request_id
from ai.runtime_actions a join ai.runtime_runs r on r.id=a.run_id
where r.id=:'run_id'::uuid and r.tenant_id=:'tenant_id'::uuid;
select e.id,e.event_type from audit.runtime_events e join ai.runtime_runs r on r.id=e.run_id
where r.id=:'run_id'::uuid and r.tenant_id=:'tenant_id'::uuid order by e.created_at;
select p.id,p.status,d.decision,d.actor_type,d.actor_id
from governance.approval_requests p join governance.approval_decisions d on d.approval_request_id=p.id
where p.run_id=:'run_id'::uuid and p.tenant_id=:'tenant_id'::uuid;
```

Require proposal → envelope → policy approval_required → human decision → revalidated allow → tool result → model continuation, with shared run/action/approval references. Check audit.logs for the approval and delegation records using their recorded entity IDs. Record task before/after state, JOB_ID where applicable, trace ID, and canonical evidence. Do not publish raw prompts, tokens, private memory or headers. Stop acceptance on an unexplained missing link or mutation.
22. Rollback: execute README's exact staging-only stop and previous-image procedure; leave worker stopped until durable IDs are reconciled. For first activation without a prior image, leave staging backend/worker stopped. Preserve Redis volume and database. If schema/data recovery is needed, restore the private archive into a newly provisioned empty staging replacement with service atlas-v2-staging-restore, verify it with the previous image and change only protected staging endpoints. Never down -v, drop shared schemas, or blindly replay queue jobs. No production rollback action is part of this procedure.

Execution sequence for the first target: steps 1–8, 10–11, 14–17, 12, 19–20, 13, 15 with final trace evidence, then 9 and 18, finally 21. The numbered checklist retains the requested acceptance categories; dependencies determine actual execution order. Retain a reviewed backup and rollback path throughout. Production remains gated by live staging evidence, dependency advisory remediation/acceptance and crash-recovery limitations documented in the implementation report.
