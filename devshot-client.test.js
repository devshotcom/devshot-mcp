import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevshotClient, DevshotApiError, normalizeBaseUrl } from './lib/devshot-client.js';

test('normalizeBaseUrl trims trailing slashes and optional /api suffix', () => {
  assert.equal(normalizeBaseUrl('https://console.devshot.com///'), 'https://console.devshot.com');
  assert.equal(normalizeBaseUrl('https://console.devshot.com/api/'), 'https://console.devshot.com');
});

test('request sends bearer auth, JSON body, and query params', async () => {
  const calls = [];
  const client = createDevshotClient({
    apiKey: 'ds_test',
    baseUrl: 'https://console.devshot.com',
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await client.request('/api/claim', {
    method: 'POST',
    query: { source: 'pool' },
    body: { server_id: 'abc' },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://console.devshot.com/api/claim?source=pool');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer ds_test');
  assert.equal(calls[0].init.headers.get('content-type'), 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify({ server_id: 'abc' }));
});

test('request throws DevshotApiError with parsed API payload', async () => {
  const client = createDevshotClient({
    apiKey: 'ds_test',
    baseUrl: 'https://console.devshot.com',
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
      }),
  });

  await assert.rejects(
    () => client.request('/api/servers'),
    (error) => {
      assert.ok(error instanceof DevshotApiError);
      assert.equal(error.status, 401);
      assert.equal(error.message, 'Unauthorized');
      assert.deepEqual(error.details, { error: 'Unauthorized' });
      return true;
    },
  );
});
