import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listDevshotApiEndpoints } from './api-catalog.js';
import { DevshotApiError } from './devshot-client.js';

export const DEVSHOT_MCP_SERVER_NAME = 'devshot';
export const DEVSHOT_MCP_SERVER_VERSION = '1.0.0';

const UUID = z.string().uuid();
const VM_NAME = z.string().regex(/^(pool|dom0|domu|qemu|bake)-[0-9a-f]{8}$/);
const STORAGE_NAME = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/);
const SERVER_NAME = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const API_PATH = z.string().regex(/^\/api\//);
const API_METHOD = z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function successResult(value) {
  return {
    content: [{ type: 'text', text: jsonText(value) }],
    structuredContent: value,
  };
}

function errorResult(error) {
  if (error instanceof DevshotApiError) {
    const payload = {
      error: error.message,
      status: error.status,
      url: error.url,
      details: error.details,
    };
    return {
      isError: true,
      content: [{ type: 'text', text: jsonText(payload) }],
      structuredContent: payload,
    };
  }
  throw error;
}

function wrapTool(handler) {
  return async (input) => {
    try {
      return successResult(await handler(input));
    } catch (error) {
      return errorResult(error);
    }
  };
}

function pickDefined(entries) {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined)
  );
}

export const DEVSHOT_TOOL_NAMES = [
  'list_servers',
  'get_server',
  'create_server',
  'update_server',
  'delete_server',
  'list_vms',
  'claim_vm',
  'exec_vm',
  'destroy_vm',
  'get_firewall_status',
  'get_security_status',
  'list_security_events',
  'list_api_endpoints',
  'api_call',
];

export function registerDevshotTools(server, client) {
  server.registerTool(
    'list_servers',
    {
      title: 'List DevShot Servers',
      description: 'List the DevShot servers visible to the configured API key.',
      inputSchema: {},
    },
    wrapTool(() => client.request('/api/servers')),
  );

  server.registerTool(
    'get_server',
    {
      title: 'Get DevShot Server',
      description: 'Fetch a single DevShot server by UUID.',
      inputSchema: { server_id: UUID },
    },
    wrapTool(({ server_id }) => client.request(`/api/servers/${server_id}`)),
  );

  server.registerTool(
    'create_server',
    {
      title: 'Create DevShot Server',
      description: 'Create a new server and return the HMAC secret and docker command payload.',
      inputSchema: {
        name: SERVER_NAME,
        pool_size: z.number().int().min(0).max(20).optional(),
        autostart_domus: z.number().int().min(0).max(20).optional(),
        target: z.string().min(1).optional(),
      },
    },
    wrapTool((input) => client.request('/api/servers', { method: 'POST', body: input })),
  );

  server.registerTool(
    'update_server',
    {
      title: 'Update DevShot Server',
      description: 'Update mutable server settings like name, pool size, host, and fingerprint mode.',
      inputSchema: z.object({
        server_id: UUID,
        name: SERVER_NAME.optional(),
        pool_size: z.number().int().min(0).max(20).optional(),
        autostart_domus: z.number().int().min(0).max(20).optional(),
        host: z.string().min(1).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        fingerprint_mode: z.enum(['manual', 'auto']).optional(),
        install_target: z.string().min(1).optional(),
      }).refine(
        (value) => Object.keys(value).some((key) => key !== 'server_id' && value[key] !== undefined),
        { message: 'At least one mutable field must be provided.' },
      ),
    },
    wrapTool(({ server_id, ...updates }) =>
      client.request(`/api/servers/${server_id}`, {
        method: 'PATCH',
        body: updates,
      })),
  );

  server.registerTool(
    'delete_server',
    {
      title: 'Delete DevShot Server',
      description: 'Delete a DevShot server record by UUID.',
      inputSchema: { server_id: UUID },
    },
    wrapTool(({ server_id }) =>
      client.request(`/api/servers/${server_id}`, { method: 'DELETE' })),
  );

  server.registerTool(
    'list_vms',
    {
      title: 'List DevShot VMs',
      description: 'List VMs on a DevShot server. Optionally restrict to tunnel-only or pool-only inventory.',
      inputSchema: {
        server_id: UUID,
        source: z.enum(['all', 'tunnel', 'pool']).optional(),
      },
    },
    wrapTool(({ server_id, source }) =>
      client.request(`/api/servers/${server_id}/vms`, {
        query: source && source !== 'all' ? { source } : undefined,
      })),
  );

  server.registerTool(
    'claim_vm',
    {
      title: 'Claim DevShot VM',
      description: 'Claim a pool VM, optionally choosing a specific server or storage profile.',
      inputSchema: {
        server_id: UUID.optional(),
        storage: STORAGE_NAME.optional(),
      },
    },
    wrapTool(({ server_id, storage }) =>
      client.request('/api/claim', {
        method: 'POST',
        body: pickDefined({ server_id, storage }),
      })),
  );

  server.registerTool(
    'exec_vm',
    {
      title: 'Exec On DevShot VM',
      description: 'Run a shell command inside a DevShot VM.',
      inputSchema: {
        vm: VM_NAME,
        command: z.string().min(1).max(4096),
      },
    },
    wrapTool(({ vm, command }) =>
      client.request(`/api/vms/${vm}/exec`, {
        method: 'POST',
        body: { command },
      })),
  );

  server.registerTool(
    'destroy_vm',
    {
      title: 'Destroy DevShot VM',
      description: 'Destroy a DevShot VM by name.',
      inputSchema: { vm: VM_NAME },
    },
    wrapTool(({ vm }) => client.request(`/api/vms/${vm}`, { method: 'DELETE' })),
  );

  server.registerTool(
    'get_firewall_status',
    {
      title: 'Get DevShot Firewall Status',
      description: 'Read firewall state and rules for a DevShot server.',
      inputSchema: { server_id: UUID },
    },
    wrapTool(({ server_id }) => client.request(`/api/servers/${server_id}/firewall`)),
  );

  server.registerTool(
    'get_security_status',
    {
      title: 'Get DevShot Security Status',
      description: 'Read the security summary for a DevShot server.',
      inputSchema: { server_id: UUID },
    },
    wrapTool(({ server_id }) => client.request(`/api/servers/${server_id}/security`)),
  );

  server.registerTool(
    'list_security_events',
    {
      title: 'List DevShot Security Events',
      description: 'Fetch paginated security events for a DevShot server.',
      inputSchema: {
        server_id: UUID,
        severity: z.string().min(1).optional(),
        vm_name: z.string().min(1).optional(),
        event_type: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    wrapTool(({ server_id, severity, vm_name, event_type, limit, offset }) =>
      client.request(`/api/servers/${server_id}/security/events`, {
        query: pickDefined({
          severity,
          vmName: vm_name,
          eventType: event_type,
          limit,
          offset,
        }),
      })),
  );

  server.registerTool(
    'list_api_endpoints',
    {
      title: 'List DevShot API Endpoints',
      description: 'List the DevShot /api/* endpoints exposed by the current release, including supported HTTP methods.',
      inputSchema: {},
    },
    wrapTool(() => ({ endpoints: listDevshotApiEndpoints() })),
  );

  server.registerTool(
    'api_call',
    {
      title: 'Call DevShot API Endpoint',
      description: 'Call any DevShot /api/* endpoint with the configured API key. Use list_api_endpoints first when the exact path is unknown.',
      inputSchema: {
        method: API_METHOD.default('GET'),
        path: API_PATH,
        body: z.record(z.unknown()).optional(),
      },
    },
    wrapTool(({ method = 'GET', path, body }) => {
      const normalizedMethod = String(method).toUpperCase();
      return client.requestApi(path, pickDefined({
        method: normalizedMethod,
        body: normalizedMethod === 'GET' ? undefined : body,
      }));
    }),
  );
}

export function createDevshotMcpServer({
  client,
  name = DEVSHOT_MCP_SERVER_NAME,
  version = DEVSHOT_MCP_SERVER_VERSION,
} = {}) {
  if (!client || typeof client.request !== 'function' || typeof client.requestApi !== 'function') {
    throw new Error('A DevShot API client is required.');
  }

  const server = new McpServer({ name, version });
  registerDevshotTools(server, client);
  return server;
}
