import test from 'node:test';
import assert from 'node:assert/strict';
import { DevshotApiError } from './lib/devshot-client.js';
import { PROJECT_TOOL_NAMES, createProjectMcpServer, isProjectKey, registerProjectTools } from './lib/project-mcp.js';

function makeServer() {
  const tools = new Map();
  return { tools, registerTool(name, schema, handler) { tools.set(name, { schema, handler }); } };
}

test('a dsp_ key selects project mode; an account key does not', () => {
  assert.equal(isProjectKey(`dsp_${'a'.repeat(64)}`), true);
  assert.equal(isProjectKey(`ds_${'a'.repeat(64)}`), false);
  assert.equal(isProjectKey(undefined), false);
});

test('project mode exposes only project tools, none of which takes a VM', () => {
  const server = makeServer();
  registerProjectTools(server, { request: async () => ({}) });
  assert.deepEqual([...server.tools.keys()], PROJECT_TOOL_NAMES);
  for (const { schema } of server.tools.values()) {
    assert.deepEqual(Object.keys(schema.inputSchema).filter((k) => /vm|server|project/i.test(k)), []);
  }
  assert.ok(createProjectMcpServer({ client: { request: async () => ({}) } }));
});

test('tools forward to the hosted project endpoint as tools/call', async () => {
  const server = makeServer();
  const calls = [];
  registerProjectTools(server, {
    request: async (path, init) => {
      calls.push({ path, init });
      return { jsonrpc: '2.0', id: init.body.id, result: { content: [{ type: 'text', text: '{"output":"ok"}' }] } };
    },
  });
  const result = await server.tools.get('exec').handler({ command: 'pwd', timeout_seconds: undefined });
  assert.deepEqual(result, { content: [{ type: 'text', text: '{"output":"ok"}' }] });
  assert.equal(calls[0].path, '/api/mcp');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.body.params, { name: 'exec', arguments: { command: 'pwd' } });
});

test('a refused key surfaces as a tool error', async () => {
  const server = makeServer();
  registerProjectTools(server, {
    request: async () => { throw new DevshotApiError('This project key is invalid or was revoked.', { status: 401 }); },
  });
  const result = await server.tools.get('project_status').handler({});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /revoked/);
});
