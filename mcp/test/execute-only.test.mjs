import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const mcpRoot = fileURLToPath(new URL('../', import.meta.url));
const toolName = 'execute_suiteql_query';
const requestOptions = { timeout: 5000 };

async function fixture(t, env = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'suiteql-execute-only-'));
  const serverRoot = path.join(root, 'mcp');
  const cwd = path.join(root, 'empty-workspace');
  const entry = path.join(serverRoot, 'dist/demo/execute-only.js');
  const requestFile = path.join(root, 'request.json');
  const authFile = path.join(root, 'auth.json');
  const f = {
    entry,
    cwd,
    requestFile,
    authFile,
    env: {
      SUITEQL_DEMO_TEST_REQUEST: requestFile,
      SUITEQL_DEMO_TEST_AUTH: authFile,
      ...env,
    },
    close: async () => {},
  };
  t.after(async () => {
    try {
      await f.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await mkdir(cwd, { recursive: true });
  for (const file of ['demo/execute-only.js', 'tools/suiteql.js', 'types.js']) {
    const destination = path.join(serverRoot, 'dist', file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(mcpRoot, 'dist', file), destination);
  }
  await writeFile(
    path.join(serverRoot, 'package.json'),
    JSON.stringify({ type: 'module' })
  );
  await symlink(
    path.join(mcpRoot, 'node_modules'),
    path.join(serverRoot, 'node_modules'),
    'junction'
  );
  await writeFile(
    path.join(serverRoot, '.env'),
    'NETSUITE_ACCOUNT_ID=demo_account\n'
  );
  await writeFile(
    path.join(cwd, '.env'),
    'NETSUITE_ACCOUNT_ID=wrong_working_directory\n'
  );

  // Stub the external boundary in the fixture, never the real token cache or network.
  const authDir = path.join(serverRoot, 'dist/auth');
  await mkdir(authDir, { recursive: true });
  await writeFile(
    path.join(authDir, 'netsuiteFetch.js'),
    `import { writeFileSync } from 'node:fs';
export async function netsuiteFetch(url, init) {
  writeFileSync(process.env.SUITEQL_DEMO_TEST_REQUEST,
    JSON.stringify({ url, method: init.method, body: JSON.parse(init.body) }));
  const status = Number(process.env.SUITEQL_DEMO_TEST_STATUS || 200);
  return new Response(status === 200
    ? JSON.stringify({ items: [{ id: 'demo-row' }], count: 1, hasMore: false })
    : 'Fixture query rejected', { status });
}
`
  );
  await writeFile(
    path.join(authDir, 'token-manager.js'),
    `import { writeFileSync } from 'node:fs';
export async function ensureAuthenticated() {
  writeFileSync(process.env.SUITEQL_DEMO_TEST_AUTH,
    JSON.stringify({ accountId: process.env.NETSUITE_ACCOUNT_ID }));
  if (process.env.SUITEQL_DEMO_TEST_AUTH_ERROR) {
    throw new Error('Fixture authentication unavailable');
  }
  return 'fixture-only';
}
`
  );
  return f;
}

async function connect(t, env) {
  const f = await fixture(t, env);
  const client = new Client({ name: 'execute-only-test', version: '1.0.0' });
  const protocolErrors = [];
  client.onerror = error => protocolErrors.push(error);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [f.entry],
    cwd: f.cwd,
    env: f.env,
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  f.close = async () => {
    await client.close();
    assert.deepEqual(
      protocolErrors,
      [],
      'stdout must contain only MCP messages'
    );
  };
  await client.connect(transport, requestOptions);
  return { ...f, client, stderr: () => stderr };
}

const call = (client, args) =>
  client.callTool(
    { name: toolName, arguments: args },
    undefined,
    requestOptions
  );
const data = result => JSON.parse(result.content[0].text);

test('advertises only the neutral execution tool without authentication', async t => {
  const f = await connect(t);
  const { tools } = await f.client.listTools({}, requestOptions);
  assert.deepEqual(
    tools.map(tool => tool.name),
    [toolName]
  );
  assert.doesNotMatch(
    tools[0].description,
    /USE FIRST|assistant|skill|guidance/i
  );
  assert.deepEqual(Object.keys(tools[0].inputSchema.properties).sort(), [
    'offset',
    'query',
    'row_limit',
  ]);
  assert.deepEqual(tools[0].inputSchema.required, ['query']);
  assert.equal(f.client.getServerCapabilities().resources, undefined);
  assert.equal(f.client.getServerCapabilities().prompts, undefined);
  assert.equal(existsSync(f.authFile), false);
  assert.equal(existsSync(f.requestFile), false);
});

test('delegates execution and keeps shared query diagnostics off stdout', async t => {
  const f = await connect(t);
  const result = data(
    await call(f.client, {
      query: 'SELECT id\nFROM demo_records ORDER BY id',
      row_limit: 2,
      offset: 4,
    })
  );
  const request = JSON.parse(await readFile(f.requestFile, 'utf8'));
  assert.equal(request.method, 'POST');
  assert.equal(
    request.url,
    'https://demo-account.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?offset=4'
  );
  assert.equal(
    request.body.q,
    'SELECT id FROM demo_records WHERE RowNum <= 2 ORDER BY id'
  );
  assert.deepEqual(result.items, [{ id: 'demo-row' }]);
  assert.equal(result._debug.finalQuery, request.body.q);
  assert.match(f.stderr(), /Original SuiteQL query:/);
  assert.match(f.stderr(), /Normalized SuiteQL query:/);
});

test('preserves the shared executor error response', async t => {
  const f = await connect(t, { SUITEQL_DEMO_TEST_STATUS: '400' });
  const result = data(
    await call(f.client, { query: 'SELECT id FROM demo_records' })
  );
  assert.equal(result.error, 'Error processing SuiteQL query');
  assert.match(
    result.details,
    /NetSuite API request failed: 400 Fixture query rejected/
  );
  assert.equal(result._debug.originalQuery, 'SELECT id FROM demo_records');
});

test('rejects invalid inputs and unavailable tools before execution', async t => {
  const f = await connect(t);
  const invalid = await call(f.client, { query: 42 });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /query/);
  const unavailable = await f.client.callTool(
    { name: 'suiteql_query_assistant', arguments: {} },
    undefined,
    requestOptions
  );
  assert.equal(unavailable.isError, true);
  assert.match(unavailable.content[0].text, /not found/);
  assert.equal(existsSync(f.requestFile), false);
  assert.equal(existsSync(f.authFile), false);
});

test('auth-only uses the shared helper and exits without starting MCP', async t => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, [f.entry, '--auth-only'], {
    cwd: f.cwd,
    env: f.env,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /NetSuite authentication is ready/);
  assert.deepEqual(JSON.parse(await readFile(f.authFile, 'utf8')), {
    accountId: 'demo_account',
  });
  assert.equal(existsSync(f.requestFile), false);
});

test('auth-only reports failures on stderr with a failing exit code', async t => {
  const f = await fixture(t, { SUITEQL_DEMO_TEST_AUTH_ERROR: '1' });
  const result = spawnSync(process.execPath, [f.entry, '--auth-only'], {
    cwd: f.cwd,
    env: f.env,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Fixture authentication unavailable/);
  assert.equal(existsSync(f.requestFile), false);
});
