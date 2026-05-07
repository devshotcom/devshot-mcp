import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(import.meta.dirname, '../../.github/workflows/sync-mcp.yml');

test('CI sync workflow pushes the MCP package to the standalone repository', {
  skip: fs.existsSync(workflowPath) ? false : 'monorepo workflow is not present in the standalone package',
}, () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /git@github\.com:devshotcom\/devshot-mcp\.git/);
  assert.match(workflow, /tags:\n\s+- 'v\*'/);
  assert.doesNotMatch(workflow, /branches: \[main\]/);
  assert.match(workflow, /Verify release tag points to main/);
  assert.match(workflow, /SOURCE_COMMIT="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /node scripts\/generate-mcp-api-catalog\.mjs/);
  assert.match(workflow, /npm test --workspace @devshot\/mcp-server/);
  assert.match(workflow, /DEPLOY_TOKEN/);
  assert.doesNotMatch(workflow, /DEPLOY_KEY/);
  assert.match(workflow, /x-access-token:\$\{DEPLOY_TOKEN\}@github\.com\/devshotcom\/devshot-mcp\.git/);
  assert.match(workflow, /rsync -a --exclude='node_modules' apps\/mcp-server\/ mcp-repo\//);
  assert.match(workflow, /rsync -a --delete/);
  assert.match(workflow, /npm install --package-lock-only --ignore-scripts/);
});
