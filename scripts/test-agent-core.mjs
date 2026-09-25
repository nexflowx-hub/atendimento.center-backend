import { createHmac, randomUUID } from 'crypto';

const baseUrl = (process.env.ATC_AGENT_BASE_URL ?? 'https://api.atendimento.center/api/v1').replace(/\/$/, '');
const secret = process.env.MYTRAINX_AGENT_SHARED_SECRET;
const userId = process.env.MYTRAINX_TEST_USER_ID;
const otherUserId = process.env.MYTRAINX_TEST_OTHER_USER_ID;
const agent = process.env.MYTRAINX_TEST_AGENT ?? 'coach_x';
const message = process.env.MYTRAINX_TEST_MESSAGE ?? 'Qual meu treino hoje?';

if (!secret) throw new Error('MYTRAINX_AGENT_SHARED_SECRET is required.');
if (!userId) throw new Error('MYTRAINX_TEST_USER_ID is required.');

function signedHeaders(method, url, principalUserId, scope = 'agent:access') {
  const pathname = new URL(url).pathname;
  const service = 'mytrainx';
  const timestamp = Math.floor(Date.now() / 1000);
  const requestId = `req_${randomUUID()}`;
  const scopes = scope.split(/[ ,]+/).filter(Boolean).sort().join(' ');
  const canonical = [
    method.toUpperCase(),
    pathname,
    service,
    principalUserId,
    String(timestamp),
    scopes,
    requestId,
  ].join('\n');
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-mtx-service': service,
    'x-mtx-user-id': principalUserId,
    'x-mtx-timestamp': String(timestamp),
    'x-mtx-scope': scopes,
    'x-mtx-request-id': requestId,
    'x-mtx-signature': signature,
  };
}

async function requestJson(method, path, principalUserId, body) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: signedHeaders(method, url, principalUserId),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${text}`);
  }
  return payload;
}

async function main() {
  console.log('B1 acceptance: create conversation');
  const conversation = await requestJson(
    'POST',
    `/agents/${agent}/conversations`,
    userId,
    { channel: 'web', title: 'B1 acceptance' },
  );

  if (!conversation?.id) throw new Error('Conversation id missing.');
  console.log(`conversation_id=${conversation.id}`);

  if (otherUserId) {
    const path = `/agents/${agent}/conversations/${conversation.id}`;
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: signedHeaders('GET', url, otherUserId),
    });
    console.log(`cross_user_http=${response.status}`);
    if (response.status !== 404) {
      throw new Error('Cross-user isolation test failed: expected HTTP 404.');
    }
  }

  console.log('B1 acceptance: stream message');
  const path = `/agents/${agent}/conversations/${conversation.id}/messages`;
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: signedHeaders('POST', url, userId),
    body: JSON.stringify({ message }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Message stream failed: HTTP ${response.status} ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    process.stdout.write(decoder.decode(chunk, { stream: true }));
  }

  console.log('\nB1 acceptance stream completed.');
  console.log(
    `Inspect: GET /agents/${agent}/conversations/${conversation.id} to verify AgentRun + toolCalls.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
