import test from 'node:test';
import assert from 'node:assert/strict';
import { DevshotApiError } from './lib/devshot-client.js';
import { createDevshotMcpServer, DEVSHOT_TOOL_NAMES, registerDevshotTools } from './lib/devshot-mcp.js';

function makeServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, schema, handler) {
      tools.set(name, { schema, handler });
    },
  };
}

test('registerDevshotTools exposes the expected DevShot MCP tools', () => {
  const server = makeServer();
  const client = {
    request: async () => ({ ok: true }),
    requestApi: async () => ({ status: 200, body: { ok: true } }),
  };

  registerDevshotTools(server, client);

  assert.deepEqual([...server.tools.keys()], DEVSHOT_TOOL_NAMES);
});

test('createDevshotMcpServer instantiates the real MCP server with the registered tools', () => {
  const server = createDevshotMcpServer({
    client: {
      request: async () => ({ ok: true }),
      requestApi: async () => ({ status: 200, body: { ok: true } }),
    },
  });

  assert.ok(server);
});

test('list_vms forwards the optional source filter to the DevShot API', async () => {
  const server = makeServer();
  const calls = [];
  const client = {
    async request(path, init) {
      calls.push({ path, init });
      return { vms: [] };
    },
  };

  registerDevshotTools(server, client);
  const result = await server.tools.get('list_vms').handler({
    server_id: '11111111-1111-4111-8111-111111111111',
    source: 'pool',
  });

  assert.deepEqual(calls, [{
    path: '/api/servers/11111111-1111-4111-8111-111111111111/vms',
    init: { query: { source: 'pool' } },
  }]);
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /"vms": \[\]/);
});

test('claim_vm only sends defined fields', async () => {
  const server = makeServer();
  const calls = [];
  const client = {
    async request(path, init) {
      calls.push({ path, init });
      return { ok: true, vm: { name: 'pool-deadbeef' } };
    },
  };

  registerDevshotTools(server, client);
  await server.tools.get('claim_vm').handler({
    storage: 'workspace-cache',
  });

  assert.deepEqual(calls, [{
    path: '/api/claim',
    init: {
      method: 'POST',
      body: { storage: 'workspace-cache' },
    },
  }]);
});

test('exec_vm maps command execution onto the VM exec API route', async () => {
  const server = makeServer();
  const calls = [];
  const client = {
    async request(path, init) {
      calls.push({ path, init });
      return { ok: true, output: 'Linux' };
    },
  };

  registerDevshotTools(server, client);
  await server.tools.get('exec_vm').handler({
    vm: 'pool-deadbeef',
    command: 'uname -s',
  });

  assert.deepEqual(calls, [{
    path: '/api/vms/pool-deadbeef/exec',
    init: {
      method: 'POST',
      body: { command: 'uname -s' },
    },
  }]);
});

test('list_api_endpoints returns the generated DevShot API catalog', async () => {
  const server = makeServer();
  const client = {
    async request() {
      return { ok: true };
    },
    async requestApi() {
      return { status: 200, body: { ok: true } };
    },
  };

  registerDevshotTools(server, client);
  const result = await server.tools.get('list_api_endpoints').handler({});

  assert.equal(result.isError, undefined);
  assert.ok(Array.isArray(result.structuredContent.endpoints));
  assert.ok(result.structuredContent.endpoints.length > 80);
  assert.ok(result.structuredContent.endpoints.some((endpoint) =>
    endpoint.path === '/api/servers/[id]/pool/base-image'
      && endpoint.methods.includes('POST')));
  assert.ok(result.structuredContent.endpoints.some((endpoint) =>
    endpoint.path === '/api/workspaces/[id]/chat/[threadId]/send'
      && endpoint.methods.includes('POST')));
});

test('api_call maps arbitrary /api requests onto the generic API client', async () => {
  const server = makeServer();
  const calls = [];
  const client = {
    async request() {
      return { ok: true };
    },
    async requestApi(path, init) {
      calls.push({ path, init });
      return { status: 201, body: { id: 'workspace-1' } };
    },
  };

  registerDevshotTools(server, client);
  const result = await server.tools.get('api_call').handler({
    method: 'POST',
    path: '/api/workspaces',
    body: { name: 'Launch' },
  });

  assert.deepEqual(calls, [{
    path: '/api/workspaces',
    init: {
      method: 'POST',
      body: { name: 'Launch' },
    },
  }]);
  assert.deepEqual(result.structuredContent, {
    status: 201,
    body: { id: 'workspace-1' },
  });
});

test('DevShot API failures are returned as MCP tool errors', async () => {
  const server = makeServer();
  const client = {
    async request() {
      throw new DevshotApiError('Forbidden', {
        status: 403,
        url: 'https://console.devshot.com/api/servers',
        details: { error: 'Forbidden' },
      });
    },
  };

  registerDevshotTools(server, client);
  const result = await server.tools.get('list_servers').handler({});

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /"status": 403/);
  assert.match(result.content[0].text, /"error": "Forbidden"/);
});
