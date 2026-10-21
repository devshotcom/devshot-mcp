import test from 'node:test';
import assert from 'node:assert/strict';
import { DevshotApiError } from './lib/devshot-client.js';
import { callProjectTool, createProjectMcpServer, isProjectKey, listProjectTools, projectForwarder } from './lib/project-mcp.js';

test('a dsp_ key selects project mode; an account key does not', () => {
  assert.equal(isProjectKey(`dsp_${'a'.repeat(64)}`), true);
  assert.equal(isProjectKey(`ds_${'a'.repeat(64)}`), false);
  assert.equal(isProjectKey(undefined), false);
});

test('the tool list is the hosted endpoint\'s, so the bridge never lags behind it', async () => {
  const calls = [];
  const forward = projectForwarder({
    request: async (path, init) => {
      calls.push({ path, init });
      return { jsonrpc: '2.0', id: init.body.id, result: { tools: [{ name: 'request_upload', inputSchema: { type: 'object' } }, { name: 'screenshot', inputSchema: { type: 'object' } }] } };
    },
  });
  const { tools } = await listProjectTools(forward);
  assert.deepEqual(tools.map((t) => t.name), ['request_upload', 'screenshot']);
  assert.equal(calls[0].path, '/api/mcp');
  assert.equal(calls[0].init.body.method, 'tools/list');
  assert.ok(createProjectMcpServer({ client: { request: async () => ({}) } }));
});

test('tools forward to the hosted project endpoint as tools/call, image content included', async () => {
  const calls = [];
  const forward = projectForwarder({
    request: async (path, init) => {
      calls.push({ path, init });
      return { jsonrpc: '2.0', id: init.body.id, result: { content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }, { type: 'text', text: '{"ok":true}' }] } };
    },
  });
  const result = await callProjectTool(forward, 'screenshot', { path: '/garten/' });
  assert.deepEqual(result.content[0], { type: 'image', data: 'AAAA', mimeType: 'image/png' });
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.body.params, { name: 'screenshot', arguments: { path: '/garten/' } });
});

test('a refused key surfaces as a tool error with the endpoint\'s code and hint', async () => {
  const forward = projectForwarder({
    // What devshot-client throws for the endpoint's 401: the body's error object.
    request: async () => { throw new DevshotApiError({ code: -32001 }, { status: 401, details: { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'This project key expired after 7 days without use.', data: { code: 'KEY_EXPIRED', hint: 'Tell the user…', reconnect_url: 'https://devshot.com/studio?project=p' } } } }); },
  });
  const result = await callProjectTool(forward, 'project_status', {});
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.code, 'KEY_EXPIRED');
  assert.equal(body.reconnect_url, 'https://devshot.com/studio?project=p');
  assert.match(body.message, /7 days/);
});
