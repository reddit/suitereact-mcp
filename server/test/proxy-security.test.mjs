import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const token = 'test-only-proxy-token-value-123456';
const port = 32147;
const baseUrl = `http://127.0.0.1:${port}`;

function startProxyForHost(t, host) {
  const directory = mkdtempSync(join(tmpdir(), 'suitereact-proxy-host-'));
  const child = spawn(process.execPath, [resolve('server/dist/index.js')], {
    cwd: directory,
    env: {
      NODE_ENV: 'test',
      SUITEREACT_PROXY_PORT: '0',
      SUITEREACT_PROXY_TOKEN: token,
      ...(host === undefined ? {} : { SUITEREACT_PROXY_HOST: host }),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = once(child, 'exit');
  let stderr = '';
  const listening = new Promise(resolve => {
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.includes('Proxy server listening on')) resolve();
    });
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return { exited, listening, output: () => stderr };
}

test('proxy accepts the default and explicit loopback binds', async t => {
  for (const host of [undefined, '127.0.0.1', '::1']) {
    await t.test(host ?? 'default host', { timeout: 5000 }, async t => {
      const proxy = startProxyForHost(t, host);
      await Promise.race([
        proxy.listening,
        proxy.exited.then(() => assert.fail(proxy.output())),
      ]);
      const urlHost = host === '::1' ? '[::1]' : '127.0.0.1';
      assert.ok(proxy.output().includes(`http://${urlHost}:`));
    });
  }
});

test('proxy rejects wildcard, interface, and hostname binds before listening', async t => {
  for (const host of [
    '0.0.0.0',
    '::',
    '192.0.2.10',
    '2001:db8::1',
    '::ffff:0.0.0.0',
    'localhost',
    'example.invalid',
    '127.0.0.1.example.invalid',
  ]) {
    await t.test(host, { timeout: 5000 }, async t => {
      const proxy = startProxyForHost(t, host);
      const [exitCode] = await proxy.exited;
      assert.equal(exitCode, 1);
      assert.match(
        proxy.output(),
        /SUITEREACT_PROXY_HOST must be 127\.0\.0\.1 or ::1/
      );
      assert.equal(proxy.output().includes('Proxy server listening on'), false);
    });
  }
});

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        const body = await response.json();
        assert.deepEqual(body.allowedOrigins, ['http://127.0.0.1:5173']);
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Proxy did not become healthy');
}

test('proxy refuses to start without a strong token', async () => {
  const child = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUITEREACT_PROXY_TOKEN: '',
    },
    stdio: 'ignore',
  });
  const [exitCode] = await once(child, 'exit');
  assert.notEqual(exitCode, 0);
});

test('proxy requires a token and rejects unconfigured origins', async t => {
  const child = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      SUITEREACT_PROXY_HOST: '127.0.0.1',
      SUITEREACT_PROXY_PORT: String(port),
      SUITEREACT_PROXY_TOKEN: token,
      SUITEREACT_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    },
    stdio: 'ignore',
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });

  await waitForHealth();

  const unauthorized = await fetch(`${baseUrl}/api/handle-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://127.0.0.1:5173',
    },
    body: JSON.stringify({}),
  });
  assert.equal(unauthorized.status, 401);

  const hostileOrigin = await fetch(`${baseUrl}/api/handle-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.invalid',
      'X-SuiteReact-Proxy-Token': token,
    },
    body: JSON.stringify({}),
  });
  assert.equal(hostileOrigin.ok, false);
  assert.equal(hostileOrigin.headers.has('access-control-allow-origin'), false);

  const invalidRequest = await fetch(`${baseUrl}/api/handle-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://127.0.0.1:5173',
      'X-SuiteReact-Proxy-Token': token,
    },
    body: JSON.stringify({}),
  });
  assert.equal(invalidRequest.status, 400);
});
