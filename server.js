#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDevshotClient } from './lib/devshot-client.js';
import { createDevshotMcpServer } from './lib/devshot-mcp.js';

try {
  const client = createDevshotClient();
  const server = createDevshotMcpServer({ client });
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
