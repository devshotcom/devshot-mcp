import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DevshotApiError } from './devshot-client.js';
import { DEVSHOT_MCP_SERVER_NAME, DEVSHOT_MCP_SERVER_VERSION } from './devshot-mcp.js';

// Project mode: DEVSHOT_API_KEY is a project key (dsp_…). The key opens ONE
// Studio project, so no tool takes a VM argument — the console resolves the
// project's current VM on every call. This stdio server is only a bridge for
// clients that cannot speak HTTP MCP: tools/list and tools/call are forwarded
// to the hosted project endpoint (POST /api/mcp), which owns the tool list,
// scope and policy. Proxying the list (spec 451) means the bridge offers
// exactly what the endpoint offers for this project — upload, screenshot,
// jobs, Shopware tools, the browser — without a release of its own.

export const PROJECT_KEY_PREFIX = 'dsp_';

export function isProjectKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith(PROJECT_KEY_PREFIX);
}

function errorResult(error) {
  if (!(error instanceof DevshotApiError)) throw error;
  // A refused HTTP request carries the JSON-RPC error in its body
  // ({ error: { message, data } }); a JSON-RPC error answer carries it directly.
  const rpc = error.details?.error && typeof error.details.error === 'object' ? error.details.error : error.details;
  const data = rpc?.data && typeof rpc.data === 'object' ? rpc.data : {};
  const message = typeof rpc?.message === 'string' ? rpc.message : String(error.message);
  const payload = { code: data.code || 'REQUEST_FAILED', message, status: error.status, ...data };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/** A forwarder for one JSON-RPC method of the hosted endpoint. */
export function projectForwarder(client) {
  let seq = 0;
  return async (method, params) => {
    const body = await client.request('/api/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: ++seq, method, params },
    });
    if (body?.error) throw new DevshotApiError(body.error.message || 'DevShot MCP call failed', { status: 400, details: body.error });
    return body?.result || {};
  };
}

export async function listProjectTools(forward) {
  const result = await forward('tools/list', {});
  return { tools: Array.isArray(result.tools) ? result.tools : [] };
}

export async function callProjectTool(forward, name, args) {
  try {
    const result = await forward('tools/call', { name, arguments: args || {} });
    return {
      content: Array.isArray(result.content) ? result.content : [{ type: 'text', text: '' }],
      ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
      ...(result.isError ? { isError: true } : {}),
    };
  } catch (error) {
    return errorResult(error);
  }
}

export function createProjectMcpServer({
  client,
  name = DEVSHOT_MCP_SERVER_NAME,
  version = DEVSHOT_MCP_SERVER_VERSION,
} = {}) {
  if (!client || typeof client.request !== 'function') throw new Error('A DevShot API client is required.');
  const forward = projectForwarder(client);
  const server = new Server({ name, version }, { capabilities: { tools: { listChanged: false } } });
  server.setRequestHandler(ListToolsRequestSchema, () => listProjectTools(forward));
  server.setRequestHandler(CallToolRequestSchema, (request) => callProjectTool(forward, request.params.name, request.params.arguments));
  return server;
}
