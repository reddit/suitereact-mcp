#!/usr/bin/env node

import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, relative } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const stateRoot = join(repoRoot, '.suitereact-testing', 'dev-sessions');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

function statePath(appName) {
  return join(stateRoot, `${appName}.json`);
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function proxyHealth() {
  try {
    const response = await fetch('http://127.0.0.1:3001/api/health', {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.service === 'suitereact-proxy' && body?.status === 'ok'
      ? body
      : null;
  } catch {
    return null;
  }
}

async function isExpectedProxy() {
  return Boolean(await proxyHealth());
}

async function proxyAllowsOrigin(origin) {
  const health = await proxyHealth();
  return Boolean(health?.allowedOrigins?.includes(origin));
}

function parseEnv(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')])
  );
}

function runLivePreflight(appName) {
  const result = spawnSync(
    process.execPath,
    ['deploy/doctor.js', '--live', '--app', appName],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );
  if (result.status !== 0) {
    throw new Error(
      'Live setup checks failed; fix the errors above and retry.'
    );
  }
}

async function verifyLiveRestlet(proxyToken) {
  const response = await fetch('http://127.0.0.1:3001/api/handle-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SuiteReact-Proxy-Token': proxyToken,
    },
    body: JSON.stringify({
      params: { actionProps: { action: 'getUserProps', elementValues: {} } },
      inputData: {},
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `NetSuite action-handler readiness failed (HTTP ${response.status}). Deploy and enable customdeploy_sr_rl_rct_action_handler for the configured TBA role, then retry.`
    );
  }
}

async function responds(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(check, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not become healthy within ${timeoutMs}ms`);
}

async function freePort(start = 5173) {
  for (let port = start; port < start + 100; port += 1) {
    const available = await portAvailable(port);
    if (available) return port;
  }
  throw new Error(`No free Vite port found from ${start} to ${start + 99}`);
}

async function portAvailable(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

function startDetached(command, args, options, logPath) {
  const logFd = openSync(logPath, 'a');
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  return child.pid;
}

function terminateOwned(processState) {
  if (!processState?.owned || !isAlive(processState.pid)) return;
  try {
    process.kill(-processState.pid, 'SIGTERM');
  } catch {
    try {
      process.kill(processState.pid, 'SIGTERM');
    } catch {
      // The process ended between the liveness check and signal.
    }
  }
}

async function readSession(appName) {
  const file = statePath(appName);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8'));
}

async function startSession(appName, args, { print = true } = {}) {
  const appDir = join(repoRoot, 'apps', appName);
  if (!existsSync(appDir)) fail(`App not found: apps/${appName}`);
  const live = args.includes('--live');
  if (live) runLivePreflight(appName);
  const existing = await readSession(appName);
  if (
    existing &&
    isAlive(existing.vite?.pid) &&
    (await responds(existing.vite.url)) &&
    (!live ||
      ((await isExpectedProxy()) &&
        (await proxyAllowsOrigin(existing.vite.url))))
  ) {
    const reused = {
      ...existing,
      proxy: live ? { ...existing.proxy, reused: true } : null,
      vite: { ...existing.vite, reused: true },
    };
    if (print) console.log(JSON.stringify(reused, null, 2));
    return reused;
  }

  if (existing) {
    terminateOwned(existing.vite);
    terminateOwned(existing.proxy);
  }

  await mkdir(stateRoot, { recursive: true });
  const session = {
    appName,
    startedAt: new Date().toISOString(),
    live,
    proxy: null,
    vite: null,
  };

  try {
    const requestedPort = Number(readArg(args, '--port', '5173'));
    const port = await freePort(requestedPort);
    const viteOrigin = `http://127.0.0.1:${port}`;
    if (live) {
      if (await isExpectedProxy()) {
        if (!(await proxyAllowsOrigin(viteOrigin))) {
          throw new Error(
            `The existing SuiteReact proxy does not allow ${viteOrigin}. Stop the process on port 3001 or add this origin to SUITEREACT_ALLOWED_ORIGINS.`
          );
        }
        session.proxy = {
          url: 'http://127.0.0.1:3001',
          pid: null,
          owned: false,
          reused: true,
        };
      } else {
        if (!(await portAvailable(3001))) {
          throw new Error(
            'Port 3001 is occupied by a service that is not the SuiteReact proxy'
          );
        }
        const proxyLog = join(stateRoot, `${appName}-proxy.log`);
        const pid = startDetached(
          'npm',
          ['run', 'server'],
          {
            cwd: repoRoot,
            env: {
              ...process.env,
              SUITEREACT_ALLOWED_ORIGINS: `${viteOrigin},http://localhost:${port}`,
            },
          },
          proxyLog
        );
        session.proxy = {
          url: 'http://127.0.0.1:3001',
          pid,
          owned: true,
          reused: false,
          log: relative(repoRoot, proxyLog),
        };
        await waitFor(isExpectedProxy, 'SuiteReact proxy');
      }
      const serverEnv = parseEnv(join(repoRoot, 'server', '.env'));
      await verifyLiveRestlet(serverEnv.SUITEREACT_PROXY_TOKEN);
    }

    const viteLog = join(stateRoot, `${appName}-vite.log`);
    const vitePid = startDetached(
      'npx',
      ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: appDir },
      viteLog
    );
    session.vite = {
      url: `http://127.0.0.1:${port}`,
      pid: vitePid,
      owned: true,
      reused: false,
      log: relative(repoRoot, viteLog),
    };
    await waitFor(() => responds(session.vite.url), `${appName} Vite server`);
    await writeFile(
      statePath(appName),
      `${JSON.stringify(session, null, 2)}\n`
    );
    if (print) console.log(JSON.stringify(session, null, 2));
    return session;
  } catch (error) {
    terminateOwned(session.vite);
    terminateOwned(session.proxy);
    throw error;
  }
}

async function stopSession(appName) {
  const session = await readSession(appName);
  if (!session) {
    console.log(
      JSON.stringify({ appName, stopped: false, reason: 'no session' })
    );
    return;
  }
  terminateOwned(session.vite);
  terminateOwned(session.proxy);
  await rm(statePath(appName), { force: true });
  console.log(
    JSON.stringify(
      {
        appName,
        stopped: true,
        viteOwned: Boolean(session.vite?.owned),
        proxyOwned: Boolean(session.proxy?.owned),
      },
      null,
      2
    )
  );
}

async function statusSession(appName) {
  const session = await readSession(appName);
  if (!session) fail(`No managed dev session for ${appName}`);
  console.log(
    JSON.stringify(
      {
        ...session,
        healthy: {
          vite: await responds(session.vite.url),
          proxy: session.live ? await isExpectedProxy() : null,
        },
      },
      null,
      2
    )
  );
}

async function runInSession(appName, args) {
  const separator = args.indexOf('--');
  if (separator === -1 || separator === args.length - 1) {
    fail(
      'Usage: dev-session.mjs run <app-name> [--live] -- <command> [args...]'
    );
  }
  const sessionArgs = args.slice(0, separator);
  const [command, ...commandArgs] = args.slice(separator + 1);
  const session = await startSession(appName, sessionArgs, { print: false });
  let child;
  const cleanup = async signal => {
    if (child && isAlive(child.pid)) child.kill(signal || 'SIGTERM');
    await stopSession(appName);
  };
  const onSignal = signal => {
    cleanup(signal).finally(() =>
      process.exit(128 + (signal === 'SIGINT' ? 2 : 15))
    );
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  try {
    const status = await new Promise((resolve, reject) => {
      child = spawn(command, commandArgs, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          SUITEREACT_VITE_URL: session.vite.url,
          ...(session.proxy ? { SUITEREACT_PROXY_URL: session.proxy.url } : {}),
        },
      });
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
    process.exitCode = status;
  } finally {
    await stopSession(appName);
  }
}

async function main() {
  const [command, appName, ...args] = process.argv.slice(2);
  if (!['start', 'stop', 'status', 'run'].includes(command) || !appName) {
    fail(
      'Usage: dev-session.mjs <start|stop|status|run> <app-name> [--live] [--port <port>]'
    );
  }

  if (command === 'start') await startSession(appName, args);
  if (command === 'stop') await stopSession(appName);
  if (command === 'status') await statusSession(appName);
  if (command === 'run') await runInSession(appName, args);
}

main().catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
