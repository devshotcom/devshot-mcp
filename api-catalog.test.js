import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVSHOT_API_ENDPOINTS, listDevshotApiEndpoints } from './lib/api-catalog.js';

test('generated API catalog covers the current release API surface', () => {
  assert.ok(DEVSHOT_API_ENDPOINTS.length > 80);
  assert.deepEqual(
    DEVSHOT_API_ENDPOINTS.find((endpoint) => endpoint.path === '/api/servers/[id]/pool/base-image')?.methods,
    ['GET', 'POST'],
  );
  assert.deepEqual(
    DEVSHOT_API_ENDPOINTS.find((endpoint) => endpoint.path === '/api/servers/[id]/vms/[name]/forwards')?.methods,
    ['DELETE', 'GET', 'POST'],
  );
  assert.deepEqual(
    DEVSHOT_API_ENDPOINTS.find((endpoint) => endpoint.path === '/api/workspaces/[id]/chat/[threadId]/send')?.methods,
    ['POST'],
  );
});

test('listDevshotApiEndpoints returns a mutable copy of the frozen catalog', () => {
  const list = listDevshotApiEndpoints();

  list[0].methods.push('POST');

  assert.notDeepEqual(list[0].methods, DEVSHOT_API_ENDPOINTS[0].methods);
  assert.ok(Object.isFrozen(DEVSHOT_API_ENDPOINTS));
  assert.ok(Object.isFrozen(DEVSHOT_API_ENDPOINTS[0]));
  assert.ok(Object.isFrozen(DEVSHOT_API_ENDPOINTS[0].methods));
});
