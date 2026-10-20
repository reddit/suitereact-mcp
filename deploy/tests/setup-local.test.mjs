import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const apps = [
  'approval-manager',
  'data-viewer',
  'doc-spaces',
  'invoice-pdf',
  'suiteql-bot',
];

function runSetup(root) {
  return spawnSync(
    process.execPath,
    ['deploy/setup-local.mjs', '--root', root],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
}

function envValue(content, name) {
  return content.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1] || '';
}

test('local setup creates secure matching configuration and is idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suitereact-setup-'));
  const first = runSetup(root);
  assert.equal(first.status, 0, first.stderr);

  const serverPath = join(root, 'server/.env');
  const server = await readFile(serverPath, 'utf8');
  const token = envValue(server, 'SUITEREACT_PROXY_TOKEN');
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await stat(serverPath)).mode & 0o777, 0o600);

  const mcpPath = join(root, 'mcp/.env');
  const mcp = await readFile(mcpPath, 'utf8');
  assert.equal(envValue(mcp, 'OPENAI_API_KEY'), '');
  assert.equal((await stat(mcpPath)).mode & 0o777, 0o600);

  for (const app of apps) {
    const appPath = join(root, `apps/${app}/.env.development.local`);
    const content = await readFile(appPath, 'utf8');
    assert.equal(envValue(content, 'VITE_PROXY_SERVER_TOKEN'), token);
    assert.equal((await stat(appPath)).mode & 0o777, 0o600);
  }

  const second = runSetup(root);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /kept\s+server\/\.env/);
  assert.equal(await readFile(serverPath, 'utf8'), server);

  await chmod(serverPath, 0o644);
  const secured = runSetup(root);
  assert.equal(secured.status, 0, secured.stderr);
  assert.match(secured.stdout, /secured\s+server\/\.env \(permissions 0600\)/);
  assert.equal((await stat(serverPath)).mode & 0o777, 0o600);
});

test('doctor directs incomplete local configuration to setup', async () => {
  const doctor = await readFile('deploy/doctor.js', 'utf8');
  assert.match(
    doctor,
    /Run npm run setup to create ignored local configuration safely/
  );
});

test('external setup paths retain live and OAuth readiness guardrails', async () => {
  const doctor = await readFile('deploy/doctor.js', 'utf8');
  assert.match(doctor, /npm 10 or newer is required/);
  assert.match(doctor, /\['NETSUITE_ACCOUNT_ID', 'NETSUITE_CLIENT_ID'\]/);
  assert.match(doctor, /const checkDeploy = requestedModes\.has\('--deploy'\)/);

  const devSession = await readFile('deploy/dev-session.mjs', 'utf8');
  assert.match(devSession, /verifyLiveRestlet/);
  assert.match(devSession, /SUITEREACT_ALLOWED_ORIGINS/);
  assert.match(devSession, /'--live', '--app', appName/);

  const oauth = await readFile('mcp/src/auth/oauth-flow.ts', 'utf8');
  assert.match(oauth, /rundll32/);
  assert.match(oauth, /Open this URL if the browser does not launch/);
  assert.doesNotMatch(oauth, /return to Cursor/);
});

test('local setup refuses inconsistent existing configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suitereact-setup-'));
  assert.equal(runSetup(root).status, 0);
  const serverPath = join(root, 'server/.env');
  const server = await readFile(serverPath, 'utf8');
  const appPath = join(root, 'apps/data-viewer/.env.development.local');
  await writeFile(
    appPath,
    'VITE_PROXY_SERVER_BASE_URL=http://localhost:3001\nVITE_PROXY_SERVER_TOKEN=different-token-value-long-enough\n',
    'utf8'
  );

  const rerun = runSetup(root);
  assert.equal(rerun.status, 1);
  assert.match(rerun.stderr, /Setup made no changes/);
  assert.match(rerun.stderr, /does not match the token setup would use/);
  assert.equal(await readFile(serverPath, 'utf8'), server);
});
