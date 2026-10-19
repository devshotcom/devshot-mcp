#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDevshotClient } from './lib/devshot-client.js';
import { createDevshotMcpServer } from './lib/devshot-mcp.js';
import { createProjectMcpServer, isProjectKey } from './lib/project-mcp.js';

try {
  const client = createDevshotClient();
  // A project key (dsp_…) opens one Studio project; an account key (ds_…) the
  // whole account API.
  const server = isProjectKey(client.apiKey)
    ? createProjectMcpServer({ client })
    : createDevshotMcpServer({ client });
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
