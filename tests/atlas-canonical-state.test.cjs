const test = require('node:test');
const assert = require('node:assert/strict');
const { ExecutiveService } = require('../dist/executive/executive.service');
const { AgentPacksService } = require('../dist/agent-packs/agent-packs.service');
const { ToolAuthorizationService } = require('../dist/runtime/tools/tool-authorization.service');
const { searchKnowledge } = require('../dist/knowledge/knowledge-query');
const { OpenRouterProvider } = require('../dist/runtime/model/providers/openrouter.provider');
const { of } = require('rxjs');

test('Executive totals come from full canonical queries rather than capped display lists', async () => {
  const db = {};
  for (const name of ['businessUnit', 'branch', 'team', 'portfolioProject', 'portfolioTask', 'agent', 'agentPackAssignment', 'budget']) db[name] = { findMany: async () => [] };
  db.approvalRequest = { findMany: async () => Array(50).fill({}), count: async () => 80 };
  db.governanceDecision = { findMany: async () => Array(50).fill({}), count: async () => 90 };
  db.runtimeRun = { findMany: async () => Array(25).fill({ status: 'completed' }), groupBy: async () => [{ status: 'completed', _count: { _all: 100 } }] };
  db.executionJob = { findMany: async () => [], groupBy: async () => [{ status: 'failed', _count: { _all: 60 } }] };
  db.usageRecord = { groupBy: async () => [] };
  const brief = await new ExecutiveService(db).brief({ id: 'tenant', organizationId: 'org' });
  assert.equal(brief.governance.pendingApprovalCount, 80);
  assert.equal(brief.governance.proposedDecisionCount, 90);
  assert.deepEqual(brief.runtime.runCounts, { completed: 100 });
  assert.deepEqual(brief.runtime.executionJobCounts, { failed: 60 });
});

test('unsupported pack constraints cannot be silently authorized', async () => {
  const packs = new AgentPacksService({});
  await assert.rejects(packs.addTool({}, 'version', { constraints: { projectId: 'restricted' } }, 'user'), /not supported/);
  const auth = new ToolAuthorizationService({
    agent: { findFirst: async () => ({ id: 'agent' }) },
    toolGrant: { findMany: async ({ where }) => { assert.deepEqual(where.constraints, { equals: {} }); return []; } },
    agentPackAssignment: { findFirst: async () => ({ packVersionId: 'version' }) },
    tenant: { findUnique: async () => ({ organizationId: 'org' }) },
    agentPackVersion: { findFirst: async () => ({ id: 'version', packId: 'pack' }) },
    agentPack: { findFirst: async () => ({ id: 'pack' }) },
    agentPackTool: { findMany: async ({ where }) => { assert.deepEqual(where.constraints, { equals: {} }); return []; } },
  });
  assert.deepEqual(await auth.authorizedToolCodes('tenant', 'agent'), []);
});

test('knowledge search binds organization for chunk, document, and source and parameterizes user input', async () => {
  const input = "'); drop table knowledge.chunks; --";
  let called = false;
  await searchKnowledge({ $queryRaw: async query => {
    called = true;
    assert.ok(query.values.includes(input));
    assert.ok(!query.text.includes(input));
    for (const alias of ['c', 'd', 's']) assert.ok(query.text.includes(alias + '.organization_id ='));
    return [];
  } }, { organizationId: 'org', query: input, limit: 100 });
  assert.equal(called, true);
});

test('provider translates canonical tool names and rejects unknown tool proposals without executing tools', async () => {
  let name = 'atlas__knowledge__search';
  const provider = new OpenRouterProvider({ post: (url, body) => {
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.tools[0].function.name, 'atlas__knowledge__search');
    return of({ data: { choices: [{ message: { content: null, tool_calls: [{ id: 'call', function: { name, arguments: '{"query":"hello"}' } }] } }], usage: { prompt_tokens: 1, completion_tokens: 2 } } });
  } }, { get: key => key === 'OPENROUTER_API_KEY' ? 'synthetic-test-value' : undefined });
  const request = { messages: [{ role: 'user', content: 'hello' }], tools: [{ code: 'atlas.knowledge.search', description: 'search', inputSchema: {} }] };
  assert.equal((await provider.generate(request)).toolCalls[0].name, 'atlas.knowledge.search');
  name = 'unknown';
  await assert.rejects(provider.generate(request), /unknown tool/);
});
