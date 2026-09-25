# B1 Agent Core — Atendimento.Center ↔ MyTrainX Handoff

**Status:** implementation branch  
**Branch:** `feat/b1-agent-core`  
**PR:** #1  
**Boundary:** MyTrainX remains source of truth for fitness/domain data. Atendimento.Center owns agent execution, conversations, operational memory, tool tracing and channels.

## 1. Base URL / staging

Current API base after deployment:

```
https://api.atendimento.center/api/v1
```

A separate staging hostname is not provisioned yet. Until one exists, B1 should be deployed only in the controlled Atendimento.Center environment or tested locally/against a temporary deployment. Do not point MyTrainX production UI to the branch before B1 deployment and schema bootstrap complete.

## 2. Environment

Atendimento.Center server-only:

```
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4.1-mini

MYTRAINX_BASE_URL=https://mytrainx.fit
MYTRAINX_AGENT_SHARED_SECRET=
MYTRAINX_AGENT_SERVICE=atendimento-center
MYTRAINX_AGENT_GATEWAY_ALLOWED_SERVICE=mytrainx
MYTRAINX_AGENT_GATEWAY_SCOPE=agent:access
MYTRAINX_AGENT_GATEWAY_MAX_SKEW_SECONDS=90
MYTRAINX_TOOL_TIMEOUT_MS=12000
```

MyTrainX and Atendimento.Center must share the same `MYTRAINX_AGENT_SHARED_SECRET` for B1.

The secret is server-only. It must never be exposed to browser code, prompts, tools or logs.

## 3. Agent Gateway ingress auth

B1 introduces a signed MyTrainX -> Atendimento.Center gateway contract using the same HMAC algorithm family as the existing Atendimento.Center -> MyTrainX tool contract.

**Integration proposal introduced by B1:** the reviewed MyTrainX branch already verifies Atendimento.Center -> MyTrainX tool requests, but it does not yet contain the reciprocal MyTrainX -> Atendimento.Center signer. C1 must add that signer server-side in MyTrainX before the WebChat can call this gateway. This does not change the ownership/domain boundary.

Required headers:

```
x-mtx-service: mytrainx
x-mtx-user-id: <Supabase auth UUID>
x-mtx-timestamp: <unix seconds>
x-mtx-scope: agent:access
x-mtx-request-id: <unique request id>
x-mtx-signature: <hex HMAC-SHA256>
```

Canonical string:

```
<METHOD>
<PATHNAME>
mytrainx
<USER_ID>
<TIMESTAMP>
<SORTED_SCOPES>
<REQUEST_ID>
```

Scopes are sorted lexically and joined with one space.

The gateway rejects:
- missing/malformed headers;
- service other than `mytrainx`;
- non-UUID user IDs;
- timestamp drift > configured max (default 90 seconds);
- missing `agent:access`;
- invalid signature;
- replayed `request_id`.

**Important:** the authenticated principal user ID is stored by the server and is the only user ID used by tools. The model cannot choose another user.

## 4. Agent Registry schema

`Agent`

```
id UUID PK
key UNIQUE
name
description?
status active|inactive|archived
createdAt
updatedAt
```

Initial agent:

```
key = coach_x
name = Coach X
```

## 5. AgentVersion schema

```
id UUID PK
agentId FK
version INT
label?
provider
model
temperature
systemPrompt TEXT
skills JSON
safetyPolicy JSON
memoryPolicy JSON
channelPolicy JSON
active BOOL
createdAt
updatedAt

UNIQUE(agentId, version)
```

Coach X B1 skills:
- training
- recovery
- general_nutrition
- motivation

Axel/Luna/Pulse/Vita remain modes/skills, not separate persistent agents.

## 6. Conversation schema

`AgentConversation`

```
id UUID PK
productKey
userId
agentId
agentVersionId
channel web|whatsapp|instagram|facebook|api
title?
status active|cancelled|handed_off|closed
handoffState none|required|active|resolved
threadContext JSON?
summary TEXT?
lastMessageAt?
createdAt
updatedAt
```

All reads/writes are filtered by:
- `productKey`, derived from the authenticated service;
- authenticated `userId`;
- requested `agent`.

`threadContext` is conversation-local context supplied by the trusted MyTrainX server integration. It is not authoritative fitness/domain state and never replaces tools. Only the allowlisted string metadata keys `surface`, `locale`, `timezone`, `entrypoint` and `resourceId` are composed into the model prompt.

Cross-user conversation substitution returns not found.

## 7. Message schema

`AgentMessage`

```
id UUID PK
conversationId FK
role system|user|assistant|tool
content TEXT
status pending|streaming|completed|failed|cancelled
metadata JSON?
createdAt
updatedAt
```

## 8. AgentRun schema

```
id UUID PK
conversationId FK
agentVersionId FK
requestId UNIQUE
userMessageId?
assistantMessageId?
status queued|running|completed|failed|cancelled
provider
model
inputTokens?
outputTokens?
totalTokens?
estimatedCostUsd?
latencyMs?
errorCode?
errorMessage?
startedAt?
completedAt?
cancelledAt?
createdAt
updatedAt
```

Tool calls are children of a run.

## 9. Tool Registry

`ToolRegistry`

```
id UUID PK
key UNIQUE
description
method GET|POST
endpointPath
scopes JSON
inputSchema JSON?
enabled
createdAt
updatedAt
```

Permissions are explicit through `AgentVersionTool(agentVersionId, toolId, enabled)`.

Coach X B1 tools:

| Tool | Endpoint | Scope |
|---|---|---|
| get_user_profile | /api/internal/agent/profile | profile:read |
| get_entitlements | /api/internal/agent/entitlements | entitlements:read |
| get_current_program | /api/internal/agent/current-program | program:read |
| get_today_workout | /api/internal/agent/today-workout | workout:read |
| get_progress_summary | /api/internal/agent/progress-summary | progress:read |

The model receives zero user-id parameters for these tools.

### Outbound MyTrainX signing

Atendimento.Center signs exactly:

```
<METHOD>
<PATHNAME>
atendimento-center
<AUTHENTICATED_USER_ID>
<TIMESTAMP>
<SORTED_SCOPES>
<REQUEST_ID>
```

with `hex(HMAC-SHA256(MYTRAINX_AGENT_SHARED_SECRET, canonical))`.

Tool result payloads are passed transiently to the model but **not copied into Atendimento.Center durable storage**. The tool trace persists only status, duration, byte count and SHA-256 response hash.

## 10. Endpoints

```
POST /api/v1/agents/{agent}/conversations
GET  /api/v1/agents/{agent}/conversations
GET  /api/v1/agents/{agent}/conversations/{conversationId}
POST /api/v1/agents/{agent}/conversations/{conversationId}/messages
POST /api/v1/agents/{agent}/conversations/{conversationId}/cancel
```

### Create conversation

Request:

```json
{
  "channel": "web",
  "title": "optional",
  "context": {
    "surface": "/app/trainer",
    "locale": "pt-BR"
  }
}
```

### Send message

Request:

```json
{
  "message": "Qual meu treino hoje?"
}
```

Response content type:

```
text/event-stream
```

## 11. SSE contract

Supported event names:

```
run.started
message.started
response.delta
tool.started
tool.completed
response.completed
handoff.required
error
```

Examples:

```
event: run.started
data: {"run_id":"...","conversation_id":"...","agent":"coach_x","request_id":"..."}

event: message.started
data: {"run_id":"...","message_id":"...","role":"assistant"}

event: tool.started
data: {"run_id":"...","tool":"get_today_workout","model_call_id":"..."}

event: tool.completed
data: {"run_id":"...","tool":"get_today_workout","model_call_id":"...","tool_call_id":"..."}

event: response.delta
data: {"run_id":"...","message_id":"...","delta":"..."}

event: response.completed
data: {"run_id":"...","message_id":"...","conversation_id":"...","usage":{...}}
```

Cancellation/error:

```
event: error
data: {"run_id":"...","code":"RUN_CANCELLED","message":"Agent run cancelled.","retryable":false}
```

`handoff.required` is reserved in B1 and will be emitted when the handoff policy/runtime is wired to Chatwoot.

## 12. Error contract

Non-streaming endpoints:

```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "CONVERSATION_NOT_FOUND",
    "request_id": "req_..."
  }
}
```

Representative codes:

```
INVALID_AGENT_GATEWAY_HEADERS
AGENT_GATEWAY_SERVICE_NOT_ALLOWED
INVALID_AGENT_GATEWAY_USER
STALE_AGENT_GATEWAY_REQUEST
AGENT_GATEWAY_SCOPE_NOT_ALLOWED
INVALID_AGENT_GATEWAY_SIGNATURE
AGENT_GATEWAY_REPLAY_DETECTED
AGENT_NOT_FOUND
AGENT_VERSION_NOT_FOUND
CONVERSATION_NOT_FOUND
CONVERSATION_NOT_ACTIVE
CONVERSATION_RUN_ALREADY_ACTIVE
VALIDATION_ERROR
AGENT_INTERNAL_ERROR
```

SSE runtime failures use the `error` event rather than changing HTTP status after the stream starts.

## 13. Memory schema and policy

### Thread Context

Owner: Atendimento.Center.

Stored in the conversation/messages/summaries and optionally `threadContext`.

### Operational Durable Memory

`OperationalMemory`:

```
id
productKey
userId
agentKey?
key
value JSON
source
confidence
status active|superseded|revoked
expiresAt?
createdAt
updatedAt
```

### Memory Candidate

```
id
productKey
userId
conversationId
sourceMessageId?
key
value JSON
reason?
confidence
status pending|accepted|rejected
reviewedAt?
createdAt
```

B1 policy:

```
message
  -> no automatic durable write

candidate
  -> validation/policy
  -> accepted OR rejected
  -> only accepted candidates become OperationalMemory
```

Initial durable-memory allowlist is deliberately narrow:
- preferred_language
- preferred_response_style
- communication_preference
- reminder_preference

Authoritative goals, program state, workouts, progress and entitlements remain MyTrainX structured domain data and are not promoted into Atendimento.Center durable memory.

## 14. Deployment

1. Configure server ENV, especially matching `MYTRAINX_AGENT_SHARED_SECRET`.
2. Back up the Atendimento.Center operational database.
3. Update the backend branch/build.
4. Apply Prisma schema:

```bash
npx prisma generate
npx prisma db push
```

5. Rebuild/recreate backend container.
6. Bootstrap registry/tools:

```bash
docker exec atendimento-api node scripts/bootstrap-agent-core.mjs
```

Expected:

```json
{
  "success": true,
  "agent": "coach_x",
  "version": 1,
  "tools": [
    "get_user_profile",
    "get_entitlements",
    "get_current_program",
    "get_today_workout",
    "get_progress_summary"
  ]
}
```

7. Confirm health endpoint before integration.

## 15. Acceptance test

The repository includes:

```
scripts/test-agent-core.mjs
```

Required:

```bash
export ATC_AGENT_BASE_URL=https://api.atendimento.center/api/v1
export MYTRAINX_AGENT_SHARED_SECRET='...'
export MYTRAINX_TEST_USER_ID='<real MyTrainX Supabase UUID>'
# optional second valid UUID for cross-user isolation:
export MYTRAINX_TEST_OTHER_USER_ID='<another UUID>'

node scripts/test-agent-core.mjs
```

The harness:
1. signs and creates a Coach X conversation;
2. optionally verifies cross-user access returns HTTP 404;
3. sends `Qual meu treino hoje?`;
4. prints SSE;
5. expects the runtime path to invoke `get_today_workout`;
6. leaves persisted Conversation/AgentRun/ToolCall for inspection.

For B1, the phrase “Qual meu treino hoje?” is deterministically routed to `get_today_workout` before the final model response. No workout content is hardcoded.

## 16. Cancellation test

Start a message stream and, using a second signed request with a **new** request ID:

```
POST /api/v1/agents/coach_x/conversations/{conversationId}/cancel
```

Expected response:

```json
{"cancelled":true,"run_id":"..."}
```

The active model/tool AbortController is aborted and the run is persisted as `cancelled`. B1 serializes execution per conversation: a second concurrent message on the same thread is rejected with `CONVERSATION_RUN_ALREADY_ACTIVE`.

## 17. Current B1 limitations

Deliberately not part of B1:
- knowledge/RAG;
- mutation tools;
- Chatwoot handoff execution;
- WhatsApp agent routing;
- proactive messaging;
- multi-provider failover;
- voice/WebRTC;
- automatic memory extraction.

These build on the schemas/runtime introduced here rather than replacing them.
