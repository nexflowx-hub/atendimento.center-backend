const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { PolicyEngineService } = require('../dist/runtime/policy/policy-engine.service');
const { ToolAuthorizationService } = require('../dist/runtime/tools/tool-authorization.service');
const { ToolRunnerService } = require('../dist/runtime/tools/tool-runner.service');
const { RuntimeRunService } = require('../dist/runtime/runtime-run.service');
const { RuntimeActionService } = require('../dist/runtime/actions/runtime-action.service');
const { AgentQueueService } = require('../dist/execution-v2/agent-queue.service');
const { AgentExecutionWorkerService } = require('../dist/execution-v2/agent-execution-worker.service');
const { createAtlasRedis } = require('../dist/execution-v2/redis-connection');
const { Test } = require('@nestjs/testing');
const { ConfigModule } = require('@nestjs/config');
const { DatabaseModule } = require('../dist/database/database.module');
const { PrismaService } = require('../dist/database/prisma.service');
const tenant = { id: 'tenant', organizationId: 'org' };
const actor = { type: 'user', id: 'human' };

function policyFixture(sideEffect = 'reversible') {
  const definition = { code: 'write', version: '1', capability: 'task.write', sideEffect, defaultRisk: 'medium', timeoutMs: 1000 };
  const envelope = { id: 'action', runId: 'run', stepId: 'step', tool: definition.code, toolVersion: definition.version, capability: definition.capability, sideEffect, risk: definition.defaultRisk, target: { tenantId: tenant.id, organizationId: tenant.organizationId }, requestedBy: { agentId: 'agent' }, input: {}, timeoutMs: 1000 };
  const db = {
    toolDefinitionRecord: { findFirst: async () => definition },
    approvalRequest: { findFirst: async ({ where }) => { assert.deepEqual(where, { id: 'approval', organizationId: 'org', tenantId: 'tenant', runId: 'run', actionId: 'action', status: 'approved' }); return { id: 'approval', expiresAt: new Date(Date.now() + 60000), payload: { toolCode: 'write', toolVersion: '1', capability: 'task.write', input: {} } }; } },
    approvalDecision: { findFirst: async ({ where }) => { assert.equal(where.actorType, 'user'); return { decision: 'approved' }; } },
  };
  const authorization = { isAuthorized: async (...args) => { assert.deepEqual(args, ['tenant', 'agent', 'write']); return true; } };
  return { envelope, db, authorization, policy: new PolicyEngineService(db, { resolve: () => ({ definition }) }, authorization) };
}

test('side effects suspend until durable scoped human approval; read-only actions proceed', async () => {
  const f = policyFixture();
  assert.equal((await f.policy.evaluate(f.envelope)).result, 'approval_required');
  assert.equal((await f.policy.evaluate(f.envelope, { approvalRequestId: 'approval' })).result, 'allow');
  const read = policyFixture('none');
  assert.equal((await read.policy.evaluate(read.envelope)).result, 'allow');
});

for (const scenario of ['revoked', 'missing', 'expired', 'no-decision', 'integrity', 'persisted-integrity', 'no-org', 'changed-input']) {
  test(`policy fails closed: ${scenario}`, async () => {
    const f = policyFixture();
    if (scenario === 'revoked') f.authorization.isAuthorized = async () => false;
    if (scenario === 'missing') f.db.approvalRequest.findFirst = async () => null;
    if (scenario === 'expired') f.db.approvalRequest.findFirst = async () => ({ id: 'approval', expiresAt: new Date(0) });
    if (scenario === 'no-decision') f.db.approvalDecision.findFirst = async () => null;
    if (scenario === 'integrity') f.envelope.sideEffect = 'none';
    if (scenario === 'persisted-integrity') f.db.toolDefinitionRecord.findFirst = async () => ({ capability: 'other' });
    if (scenario === 'no-org') f.envelope.target.organizationId = null;
    if (scenario === 'changed-input') f.envelope.input = { taskId: 'different-task' };
    assert.equal((await f.policy.evaluate(f.envelope, { approvalRequestId: 'approval' })).result, 'deny');
  });
}

for (const scenario of ['approved', 'draft', 'foreign-org', 'paused', 'unassigned']) {
  test(`pack authorization respects lifecycle and scope: ${scenario}`, async () => {
    const db = {
      agent: { findFirst: async ({ where }) => { assert.deepEqual(where, { id: 'agent', tenantId: 'tenant', enabled: true }); return { id: 'agent' }; } },
      toolGrant: { findMany: async ({ where }) => { assert.equal(where.tenantId, tenant.id); assert.equal(where.status, 'active'); return [{ toolCode: 'explicit' }]; } },
      agentPackAssignment: { findFirst: async ({ where }) => { assert.deepEqual(where, { tenantId: tenant.id, agentId: 'agent', status: 'active' }); return scenario === 'unassigned' ? null : { packVersionId: 'version' }; } },
      tenant: { findUnique: async () => tenant },
      agentPackVersion: { findFirst: async ({ where }) => { assert.equal(where.status, 'approved'); return scenario === 'draft' ? null : { id: 'version', packId: 'pack' }; } },
      agentPack: { findFirst: async ({ where }) => { assert.equal(where.organizationId, tenant.organizationId); assert.equal(where.status, 'active'); return ['foreign-org', 'paused'].includes(scenario) ? null : { id: 'pack' }; } },
      agentPackTool: { findMany: async ({ where }) => { assert.equal(where.mode, 'allowed'); return [{ toolCode: 'pack-tool' }]; } },
    };
    const codes = await new ToolAuthorizationService(db).authorizedToolCodes('tenant', 'agent');
    assert.deepEqual(codes, scenario === 'approved' ? ['explicit', 'pack-tool'] : ['explicit']);
  });
}

test('ToolRunner refuses denied and approval-required proposals', async () => {
  let executions = 0;
  const runner = new ToolRunnerService({ resolve: () => ({ validate: x => x, execute: async () => ++executions }) });
  for (const result of ['deny', 'approval_required']) await assert.rejects(runner.execute({}, {}, { result }), /explicit allow/);
  assert.equal(executions, 0);
  assert.equal(await runner.execute({ input: {}, timeoutMs: 1000 }, {}, { result: 'allow' }), 1);
});

test('API queue construction and shutdown require neither Redis URL nor network', async () => {
  const service = new AgentQueueService({}, { get: () => { throw new Error('Redis config accessed at boot'); } });
  await service.onModuleDestroy();
});

test('Redis configuration rejects other logical DBs and validates /2 without connecting', () => {
  for (const url of [undefined, 'redis://127.0.0.1:6379/0', 'redis://127.0.0.1:6379/1', 'http://127.0.0.1/2']) {
    assert.throws(() => createAtlasRedis({ get: () => url }));
  }
  const redis = createAtlasRedis({ get: () => 'redis://127.0.0.1:6379/2' });
  assert.equal(redis.status, 'wait');
  assert.equal(redis.options.db, 2);
  redis.disconnect();
});

test('queue carries only the durable execution ID and persists request in canonical storage', async () => {
  let stored;
  const service = new AgentQueueService({ executionJob: { create: async ({ data }) => { stored = data; return { id: 'job', ...data }; } } }, {});
  service.queue = { add: async (name, payload, options) => { assert.deepEqual(payload, { executionJobId: 'job' }); assert.equal(options.attempts, 1); return { id: 'job' }; }, close: async () => {} };
  await service.enqueue(tenant, actor, { agentCode: 'atlas', input: 'private input' });
  assert.equal(stored.request.input, 'private input');
  await service.onModuleDestroy();
});

test('worker claims durable queued jobs once and preserves Runtime suspension metadata', async () => {
  let stored;
  let runs = 0;
  const db = {
    executionJob: {
      findUnique: async () => ({ id: 'job', tenantId: 'tenant', status: 'queued', actorType: 'user', actorId: 'human', request: { agentCode: 'atlas', input: 'input' } }),
      updateMany: async ({ where }) => { assert.equal(where.status, 'queued'); return { count: runs ? 0 : 1 }; },
      update: async ({ data }) => { stored = data; },
    }, tenant: { findUnique: async () => tenant },
  };
  const worker = new AgentExecutionWorkerService(db, { start: async () => { runs++; return { runId: 'run', status: 'suspended' }; } }, {});
  await worker.process({ id: 'bull', data: { executionJobId: 'job' } });
  assert.equal(stored.runId, 'run');
  assert.equal(stored.metadata.runtimeStatus, 'suspended');
  await assert.rejects(worker.process({ data: { executionJobId: 'job' } }), /not claimable/);
  assert.equal(runs, 1);
});

function runtimeFixture(actionResult) {
  const run = { id: 'run', traceId: 'trace', tenantId: 'tenant', organizationId: 'org', agentId: 'agent', agentVersionId: null, status: 'running', startedAt: new Date(), model: 'model', provider: 'mock', state: { messages: [{ role: 'user', content: 'input' }], turn: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: null } } };
  const events = [];
  let ordinal = 1;
  let calls = 0;
  const db = {
    runtimeRun: { findFirst: async () => run, update: async ({ data }) => { Object.assign(run, structuredClone(data)); return run; }, updateMany: async ({ where, data }) => { if (run.status !== where.status) return { count: 0 }; Object.assign(run, structuredClone(data)); return { count: 1 }; } },
    agent: { findFirst: async () => ({ id: 'agent', provider: 'mock', model: 'model', temperature: null }) },
    runtimeStep: { aggregate: async () => ({ _max: { ordinal } }), create: async ({ data }) => ({ id: 'step-' + ++ordinal, ...data }), update: async () => ({}), updateMany: async () => ({ count: 1 }) },
    runtimeEvent: { create: async ({ data }) => { events.push(data.eventType); return data; } },
    runtimeAction: { findFirst: async () => ({ id: 'action', status: 'completed', output: { done: true } }) },
    $transaction: async values => Promise.all(values),
  };
  const models = { supports: () => true, generate: async ({ messages }) => { calls++; if (calls > 1) assert.equal(messages.at(-1).role, 'tool'); return { provider: 'mock', model: 'model', content: calls === 1 ? '' : 'done', toolCalls: calls === 1 ? [{ id: 'call', name: 'write', arguments: {} }] : [], usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, costUsd: null }, latencyMs: 1 }; } };
  const service = new RuntimeRunService(db, models, { listGranted: async () => [{ code: 'write', description: 'write', inputSchema: {} }] }, { proposeAndExecute: async () => actionResult });
  return { service, run, events };
}

test('suspension persists pending approval and resume returns tool output to model before completing', async () => {
  const f = runtimeFixture({ actionId: 'action', approvalRequestId: 'approval', status: 'suspended' });
  const result = await f.service.executeLoop(tenant, 'run', actor);
  assert.equal(result.status, 'suspended');
  assert.equal(f.run.status, 'suspended');
  assert.equal(f.run.state.pendingToolCall.approvalRequestId, 'approval');
  assert.ok(f.events.includes('run.suspended'));
  const resumed = await f.service.resume(tenant, 'run', actor);
  assert.equal(resumed.status, 'completed');
  assert.equal(f.run.status, 'completed');
  assert.equal(f.run.state.pendingToolCall, undefined);
  assert.ok(f.events.includes('run.resumed'));
});

test('synchronous read-only tool loop completes without queue path', async () => {
  const f = runtimeFixture({ actionId: 'action', status: 'completed', output: { done: true } });
  assert.equal((await f.service.executeLoop(tenant, 'run', actor)).status, 'completed');
  assert.equal(f.run.state.usage.totalTokens, 10);
});

test('approved action refuses execution when another caller already claimed it', async () => {
  let executed = false;
  const db = {
    runtimeAction: { findFirst: async () => ({ id: 'action', runId: 'run', stepId: 'step', toolCode: 'write', toolVersion: '1', input: {}, capability: 'task.write', sideEffect: 'reversible', risk: 'medium' }), updateMany: async ({ where }) => { assert.equal(where.status, 'suspended'); return { count: 0 }; } },
    runtimeRun: { findFirst: async () => ({ id: 'run', tenantId: 'tenant', agentId: 'agent' }) },
  };
  const service = new RuntimeActionService(db, { resolve: () => ({ definition: { code: 'write', version: '1', capability: 'task.write', sideEffect: 'reversible', defaultRisk: 'medium' }, validate: x => x }) }, { evaluate: async () => ({ result: 'allow', policyIds: [] }) }, { execute: async () => { executed = true; } });
  service.recordPolicy = async () => {};
  await assert.rejects(service.resumeApprovedAction(tenant, 'action', 'approval', actor), /already claimed/);
  assert.equal(executed, false);
});

test('all new Nest modules resolve providers and guards without database/Redis access', async () => {
  const imports = [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true }), DatabaseModule,
    require('../dist/runtime/runtime.module').RuntimeModule,
    require('../dist/execution-v2/execution.module').ExecutionModule,
    require('../dist/group-os/group-os.module').GroupOsModule,
    require('../dist/knowledge/knowledge.module').KnowledgeModule,
    require('../dist/agent-packs/agent-packs.module').AgentPacksModule,
    require('../dist/executive/executive.module').ExecutiveModule,
  ];
  const module = await Test.createTestingModule({ imports }).overrideProvider(PrismaService).useValue({ toolDefinitionRecord: { upsert: async () => ({}) } }).compile();
  await module.init();
  await module.close();
});

test('disabled or foreign-tenant agent cannot retain explicit or pack grants', async () => {
  const service = new ToolAuthorizationService({ agent: { findFirst: async ({ where }) => {
    assert.deepEqual(where, { id: 'agent', tenantId: 'tenant', enabled: true });
    return null;
  } } });
  assert.deepEqual(await service.authorizedToolCodes('tenant', 'agent'), []);
});

for (const field of ['toolVersion', 'capability', 'sideEffect', 'risk']) {
  test(`approval resume rejects saved tool definition drift: ${field}`, async () => {
    let denied = false;
    const action = { id: 'action', runId: 'run', stepId: 'step', toolCode: 'write', toolVersion: '1', capability: 'task.write', sideEffect: 'reversible', risk: 'medium' };
    action[field] = 'changed';
    const db = {
      runtimeAction: { findFirst: async () => action, update: async ({ data }) => { assert.equal(data.status, 'denied'); denied = true; } },
      runtimeRun: { findFirst: async () => ({ id: 'run', tenantId: 'tenant' }) },
    };
    const service = new RuntimeActionService(db, { resolve: () => ({ definition: { version: '1', capability: 'task.write', sideEffect: 'reversible', defaultRisk: 'medium' } }) }, {}, {});
    await assert.rejects(service.resumeApprovedAction(tenant, 'action', 'approval', actor), /definition changed/);
    assert.equal(denied, true);
  });
}
