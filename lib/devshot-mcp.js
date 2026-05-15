import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listDevshotApiEndpoints } from './api-catalog.js';
import { DevshotApiError } from './devshot-client.js';

export const DEVSHOT_MCP_SERVER_NAME = 'devshot';
export const DEVSHOT_MCP_SERVER_VERSION = '1.0.0';

const UUID = z.string().uuid();
const VM_NAME = z.string().regex(/^(?:(?:pool|dom0|domu|qemu|bake)-[0-9a-f]{8}|pool-[a-z]{3,15}-[a-z]{3,15}-[a-z]{3,15})$/);
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
  'computer_use',
  'desktop_screenshot',
  'android_use',
  'android_screenshot',
  'terminal_use',
  'browser_use',
  'application_use',
  'api_call',
];

// Spec 055 — AI desktop control. Schema matches Anthropic's
// `computer_20250124` so Claude clients consume the tool natively.
const COMPUTER_ACTIONS = z.enum([
  'screenshot',
  'mouse_move',
  'left_click',
  'left_click_drag',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'hold_key',
  'scroll',
  'wait',
  'cursor_position',
]);

// Spec 057 — AI Android control. Superset of COMPUTER_ACTIONS: same
// Anthropic schema so the same MCP client logic works for both surfaces,
// plus `back`/`home`/`recents` system-button helpers. Touch-only semantics
// (no hover); mouse_move and middle_click are documented no-ops on the
// server side rather than schema errors.
const ANDROID_ACTIONS = z.enum([
  'screenshot',
  'mouse_move',
  'left_click',
  'left_click_drag',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'hold_key',
  'scroll',
  'wait',
  'cursor_position',
  'back',
  'home',
  'recents',
]);

// Spec 058 — AI Terminal/Browser/Application control. Each scenario
// has its own action vocabulary; the schemas only share `wait` for
// rate-limiting. Terminal drives a persistent tmux session; Browser
// reuses every computer_use action plus Chromium-specific verbs;
// Application drives the workload's HTTP API directly.
const TERMINAL_ACTIONS = z.enum([
  'screenshot',
  'type',
  'key',
  'run',
  'wait',
  'cursor_position',
]);
// Browser shares every computer_use action with Desktop (same Xvnc
// :0) and adds Chromium-specific verbs. Listed flat so Zod sees a
// proper string-literal tuple rather than a runtime spread.
const BROWSER_ACTIONS = z.enum([
  'screenshot',
  'mouse_move',
  'left_click',
  'left_click_drag',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'hold_key',
  'scroll',
  'wait',
  'cursor_position',
  'navigate',
  'back',
  'forward',
  'reload',
  'new_tab',
  'close_tab',
  'current_url',
]);
const APPLICATION_ACTIONS = z.enum([
  'screenshot',
  'request',
  'health',
  'wait',
]);
const HTTP_METHOD = z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

const COORD = z.tuple([z.number().int().min(0).max(16384), z.number().int().min(0).max(16384)]);

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
    'computer_use',
    {
      title: 'Drive DevShot Desktop VM',
      description:
        'Drive a DevShot desktop VM like a human: screenshot, mouse, keyboard, scroll. ' +
        'Schema matches Anthropic computer_20250124. Most visual actions return a ' +
        'follow-up screenshot in the same response so the model can see the result.',
      inputSchema: {
        vm: VM_NAME,
        action: COMPUTER_ACTIONS,
        coordinate: COORD.optional(),
        start_coordinate: COORD.optional(),
        text: z.string().max(2048).optional(),
        duration: z.number().min(0).max(5).optional(),
        scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
        scroll_amount: z.number().int().min(1).max(100).optional(),
      },
    },
    wrapTool(({ vm, ...action }) =>
      client.request(`/api/vms/${vm}/desktop/action`, {
        method: 'POST',
        body: pickDefined(action),
      })),
  );

  server.registerTool(
    'desktop_screenshot',
    {
      title: 'Screenshot DevShot Desktop VM',
      description: 'Capture a PNG screenshot of a DevShot desktop VM and return it as base64.',
      inputSchema: { vm: VM_NAME },
    },
    wrapTool(({ vm }) =>
      client.request(`/api/vms/${vm}/desktop/action`, {
        method: 'POST',
        body: { action: 'screenshot' },
      })),
  );

  // Spec 057 — AI Android control. Mirrors computer_use but routes to
  // /api/vms/:vm/android/action, which translates the same Anthropic
  // schema into adb commands against the QEMU Android-x86 guest.
  // left_click = tap, left_click_drag = swipe, scroll = swipe, etc.
  server.registerTool(
    'android_use',
    {
      title: 'Drive DevShot Android VM',
      description:
        'Drive a DevShot Android VM with touch + adb input: tap (left_click), swipe ' +
        '(left_click_drag), scroll, type, keyevent, plus back/home/recents system buttons. ' +
        'Schema mirrors Anthropic computer_20250124 so the same MCP client logic works for ' +
        'both desktop and Android. Visual actions return a follow-up screenshot.',
      inputSchema: {
        vm: VM_NAME,
        action: ANDROID_ACTIONS,
        coordinate: COORD.optional(),
        start_coordinate: COORD.optional(),
        text: z.string().max(2048).optional(),
        duration: z.number().min(0).max(5).optional(),
        scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
        scroll_amount: z.number().int().min(1).max(100).optional(),
      },
    },
    wrapTool(({ vm, ...action }) =>
      client.request(`/api/vms/${vm}/android/action`, {
        method: 'POST',
        body: pickDefined(action),
      })),
  );

  server.registerTool(
    'android_screenshot',
    {
      title: 'Screenshot DevShot Android VM',
      description: 'Capture a PNG screenshot of a DevShot Android VM and return it as base64.',
      inputSchema: { vm: VM_NAME },
    },
    wrapTool(({ vm }) =>
      client.request(`/api/vms/${vm}/android/action`, {
        method: 'POST',
        body: { action: 'screenshot' },
      })),
  );

  // Spec 058 — AI Terminal control. Drives a persistent tmux session
  // inside the VM (target name `devshot-ai-<session_id>`) so multiple
  // brains can each own a session without stomping each other.
  server.registerTool(
    'terminal_use',
    {
      title: 'Drive DevShot Terminal VM',
      description:
        'Drive a DevShot terminal VM via tmux: capture scrollback (screenshot), type, send keys ' +
        '(Enter, C-c, M-x …), or run a command. State persists across calls via session_id. ' +
        'screenshot returns text (the captured pane), not a PNG.',
      inputSchema: {
        vm: VM_NAME,
        action: TERMINAL_ACTIONS,
        session_id: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
        text: z.string().max(4096).optional(),
        duration: z.number().min(0).max(5).optional(),
        lines: z.number().int().min(1).max(5000).optional(),
      },
    },
    wrapTool(({ vm, ...action }) =>
      client.request(`/api/vms/${vm}/terminal/action`, {
        method: 'POST',
        body: pickDefined(action),
      })),
  );

  // Spec 058 — AI Browser control. Reuses every computer_use action
  // (clicks, type, scroll — they target the shared Xvnc :0 with the
  // Desktop scenario) and adds Chromium-specific verbs: navigate,
  // back/forward/reload, new_tab, close_tab, current_url.
  server.registerTool(
    'browser_use',
    {
      title: 'Drive DevShot Browser VM',
      description:
        'Drive a DevShot browser VM (Chromium kiosk on shared Xvnc :0): full computer_use ' +
        'surface plus navigate(url), back/forward/reload, new_tab/close_tab, current_url. ' +
        'Visual actions return a follow-up screenshot.',
      inputSchema: {
        vm: VM_NAME,
        action: BROWSER_ACTIONS,
        coordinate: COORD.optional(),
        start_coordinate: COORD.optional(),
        text: z.string().max(2048).optional(),
        url: z.string().max(2048).optional(),
        duration: z.number().min(0).max(5).optional(),
        scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
        scroll_amount: z.number().int().min(1).max(100).optional(),
      },
    },
    wrapTool(({ vm, ...action }) =>
      client.request(`/api/vms/${vm}/browser/action`, {
        method: 'POST',
        body: pickDefined(action),
      })),
  );

  // Spec 058 — AI Application control. Application VMs host HTTP
  // workloads (n8n, flowise, …); the AI surface is HTTP-shaped, not
  // pixel-shaped. `request` is the workhorse; `screenshot` returns the
  // body of GET '/' (or a chosen path) as plain text.
  server.registerTool(
    'application_use',
    {
      title: 'Drive DevShot Application VM',
      description:
        'Drive a DevShot application VM via its HTTP API: request(method,path,body,headers), ' +
        'health(HEAD), screenshot(GET → body). The host is always 127.0.0.1:<port> inside the ' +
        'VM — only path/method/body/headers are AI-controlled.',
      inputSchema: {
        vm: VM_NAME,
        action: APPLICATION_ACTIONS,
        port: z.number().int().min(1).max(65_535).optional(),
        method: HTTP_METHOD.optional(),
        path: z.string().max(2048).optional(),
        body: z.union([z.string(), z.record(z.unknown())]).optional(),
        headers: z.record(z.string()).optional(),
        duration: z.number().min(0).max(5).optional(),
      },
    },
    wrapTool(({ vm, ...action }) =>
      client.request(`/api/vms/${vm}/application/action`, {
        method: 'POST',
        body: pickDefined(action),
      })),
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
