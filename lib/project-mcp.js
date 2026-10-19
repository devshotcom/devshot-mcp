import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DevshotApiError } from './devshot-client.js';
import { DEVSHOT_MCP_SERVER_NAME, DEVSHOT_MCP_SERVER_VERSION } from './devshot-mcp.js';

// Project mode: DEVSHOT_API_KEY is a project key (dsp_…). The key opens ONE
// Studio project, so these tools take no VM argument — the console resolves
// the project's current VM on every call. Each tool forwards to the hosted
// project MCP endpoint (POST /api/mcp), which owns scope and policy; this stdio
// server is only a bridge for clients that cannot speak HTTP MCP.

export const PROJECT_KEY_PREFIX = 'dsp_';

export function isProjectKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith(PROJECT_KEY_PREFIX);
}

export const PROJECT_TOOL_NAMES = ['project_status', 'start_vm', 'exec', 'read_file', 'write_file'];

const PROJECT_PATH = z.string().min(1).max(2048);

function pickDefined(entries) {
  return Object.fromEntries(Object.entries(entries || {}).filter(([, value]) => value !== undefined));
}

function errorResult(error) {
  if (!(error instanceof DevshotApiError)) throw error;
  const payload = { error: error.message, status: error.status };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function registerProjectTools(server, client) {
  let seq = 0;
  const forward = (name) => async (input) => {
    try {
      const body = await client.request('/api/mcp', {
        method: 'POST',
        body: { jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: pickDefined(input) } },
      });
      if (body?.error) throw new DevshotApiError(body.error.message || 'DevShot MCP call failed', { status: 400, details: body.error });
      const result = body?.result || {};
      return {
        content: Array.isArray(result.content) ? result.content : [{ type: 'text', text: '' }],
        ...(result.isError ? { isError: true } : {}),
      };
    } catch (error) {
      return errorResult(error);
    }
  };

  server.registerTool('project_status', {
    title: 'Project status',
    description: 'Show the DevShot Studio project this key belongs to and whether its VM is running.',
    inputSchema: {},
  }, forward('project_status'));

  server.registerTool('start_vm', {
    title: 'Start project VM',
    description: 'Start the project VM if none is running. Other tools start it on demand too.',
    inputSchema: {},
  }, forward('start_vm'));

  server.registerTool('exec', {
    title: 'Run command',
    description: 'Run a shell command in the project VM, in the project directory.',
    inputSchema: {
      command: z.string().min(1).max(131072),
      timeout_seconds: z.number().int().min(5).max(300).optional(),
    },
  }, forward('exec'));

  server.registerTool('read_file', {
    title: 'Read file',
    description: 'Read a text file; path is relative to the project root.',
    inputSchema: {
      path: PROJECT_PATH,
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).optional(),
    },
  }, forward('read_file'));

  server.registerTool('write_file', {
    title: 'Write file',
    description: 'Create or replace a text file; path is relative to the project root.',
    inputSchema: { path: PROJECT_PATH, content: z.string() },
  }, forward('write_file'));
}

export function createProjectMcpServer({
  client,
  name = DEVSHOT_MCP_SERVER_NAME,
  version = DEVSHOT_MCP_SERVER_VERSION,
} = {}) {
  if (!client || typeof client.request !== 'function') throw new Error('A DevShot API client is required.');
  const server = new McpServer({ name, version });
  registerProjectTools(server, client);
  return server;
}
