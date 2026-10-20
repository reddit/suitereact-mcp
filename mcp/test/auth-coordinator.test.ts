import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { OAuthCoordinator } from '../src/auth/auth-coordinator.js';

function fixture(options: { now?: () => number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'suitereact-oauth-'));
  const lockFile = join(root, 'auth.lock');
  const failureFile = join(root, 'auth.failure');
  return {
    lockFile,
    failureFile,
    coordinator: new OAuthCoordinator({
      lockFile,
      failureFile,
      cooldownMs: 1_000,
      leaseMs: 2_000,
      ...options,
    }),
  };
}

function writeLease(
  lockFile: string,
  lease: { id: string; pid: number; expires_at: number }
) {
  mkdirSync(lockFile, { mode: 0o700 });
  writeFileSync(join(lockFile, `${lease.id}.json`), JSON.stringify(lease), {
    mode: 0o600,
  });
}

function readLease(lockFile: string) {
  return JSON.parse(
    readFileSync(join(lockFile, readdirSync(lockFile)[0]), 'utf8')
  );
}

test('shares one browser authentication attempt within a process', async () => {
  const { coordinator } = fixture();
  let attempts = 0;
  let finish!: (value: string) => void;
  const authenticate = () => {
    attempts += 1;
    return new Promise<string>(resolve => {
      finish = resolve;
    });
  };

  const first = coordinator.run(authenticate);
  const second = coordinator.run(authenticate);
  assert.equal(attempts, 1);
  finish('authenticated');
  assert.equal(await first, 'authenticated');
  assert.equal(await second, 'authenticated');
});

test('blocks another process while an OAuth lease is active', async () => {
  const { coordinator, lockFile, failureFile } = fixture();
  writeLease(lockFile, {
    id: 'other',
    pid: process.pid,
    expires_at: Date.now() + 60_000,
  });
  const otherProcess = new OAuthCoordinator({ lockFile, failureFile });

  await assert.rejects(
    otherProcess.run(async () => 'should not run'),
    /already in progress in another MCP process/
  );
  await assert.rejects(
    coordinator.run(async () => 'should not run'),
    /already in progress in another MCP process/
  );
});

test('one global callback lease coordinates different account cooldowns', async () => {
  const { lockFile, failureFile } = fixture();
  const otherFailureFile = join(
    tmpdir(),
    `other-account-${Date.now()}.failure`
  );
  let finish!: (value: string) => void;
  const firstAccount = new OAuthCoordinator({ lockFile, failureFile });
  const secondAccount = new OAuthCoordinator({
    lockFile,
    failureFile: otherFailureFile,
  });
  const first = firstAccount.run(
    () =>
      new Promise<string>(resolve => {
        finish = resolve;
      })
  );

  await assert.rejects(
    secondAccount.run(async () => 'second account'),
    /already in progress in another MCP process/
  );
  finish('first account');
  assert.equal(await first, 'first account');
});

test('owns the callback lease before running reauthentication side effects', async () => {
  const { coordinator, lockFile } = fixture();
  const result = await coordinator.run(async () => {
    const lease = readLease(lockFile);
    assert.equal(lease.pid, process.pid);
    return 'owned';
  });
  assert.equal(result, 'owned');
  assert.throws(() => readFileSync(lockFile, 'utf8'), /ENOENT/);
});

test('records failures and lets explicit authentication bypass cooldown', async () => {
  const now = 10_000;
  const { coordinator, lockFile, failureFile } = fixture({ now: () => now });
  await assert.rejects(
    coordinator.run(async () => {
      throw new Error('denied');
    }),
    /denied/
  );

  const failure = JSON.parse(readFileSync(failureFile, 'utf8'));
  assert.equal(failure.retry_after, 11_000);
  assert.equal(statSync(failureFile).mode & 0o777, 0o600);
  await assert.rejects(
    coordinator.run(async () => 'automatic retry'),
    /OAuth is paused after a recent failure/
  );
  assert.equal(
    await coordinator.run(async () => 'explicit retry', {
      ignoreCooldown: true,
    }),
    'explicit retry'
  );
  assert.throws(() => readFileSync(lockFile, 'utf8'), /ENOENT/);
});

test('automatic authentication resumes after the cooldown', async () => {
  let now = 30_000;
  const { coordinator } = fixture({ now: () => now });
  await assert.rejects(
    coordinator.run(async () => {
      throw new Error('denied');
    }),
    /denied/
  );
  now = 31_001;
  assert.equal(
    await coordinator.run(async () => 'automatic retry'),
    'automatic retry'
  );
});

test('recovers an expired cross-process lease', async () => {
  const now = 20_000;
  const { coordinator, lockFile } = fixture({ now: () => now });
  writeLease(lockFile, { id: 'stale', pid: 2147483647, expires_at: now - 1 });

  assert.equal(await coordinator.run(async () => 'recovered'), 'recovered');
});

test('server startup stays quiet while authenticated requests remain lazy', () => {
  const server = readFileSync('mcp/src/server.ts', 'utf8');
  assert.doesNotMatch(server, /authenticate\(\)\.catch/);
  assert.doesNotMatch(server, /tool\.disable\(\)/);

  const tokens = readFileSync('mcp/src/auth/token-manager.ts', 'utf8');
  assert.match(tokens, /if \(!tokens\)[\s\S]*await runInteractiveAuth\(\)/);
  assert.match(
    tokens,
    /lockFile: path\.join\(os\.homedir\(\), '\.netsuite-mcp-auth\.lock'\)/
  );
  assert.match(
    tokens,
    /if \(options\.clearTokensBeforeAuth\) clearTokens\(\);[\s\S]*runOAuthFlow/
  );
});

test('an expired lease still blocks while its owning process is alive', async () => {
  const { coordinator, lockFile } = fixture();
  writeLease(lockFile, { id: 'live', pid: process.pid, expires_at: 0 });
  await assert.rejects(
    coordinator.run(async () => 'must not run'),
    /already in progress/
  );
  assert.equal(readLease(lockFile).id, 'live');
});

test('legacy and malformed locks fail closed without deleting them', async () => {
  const { coordinator, lockFile } = fixture();
  writeFileSync(lockFile, '{}');
  await assert.rejects(
    coordinator.run(async () => 'must not run'),
    /legacy OAuth lock/
  );
  assert.equal(readFileSync(lockFile, 'utf8'), '{}');
  rmSync(lockFile);
  mkdirSync(lockFile);
  writeFileSync(join(lockFile, 'bad.json'), '{}');
  await assert.rejects(
    coordinator.run(async () => 'must not run'),
    /lock is unreadable/
  );
  assert.equal(readFileSync(join(lockFile, 'bad.json'), 'utf8'), '{}');
});

test(
  'stale recovery cannot unlink a newer lease acquired by a competing process',
  { timeout: 15_000 },
  async t => {
    const { lockFile, failureFile } = fixture();
    writeLease(lockFile, { id: 'stale', pid: 2147483647, expires_at: 0 });
    const worker = (pause: boolean) => {
      const child = fork(
        new URL('./fixtures/auth-coordinator-worker.ts', import.meta.url),
        [
          lockFile,
          failureFile,
          join(lockFile, 'stale.json'),
          pause ? 'pause' : '',
        ],
        {
          execArgv: ['--import', 'tsx'],
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        }
      );
      t.after(() => child.kill());
      const events: Array<{ event: string; message?: string }> = [];
      const waiting: Array<
        (event: { event: string; message?: string }) => void
      > = [];
      child.on('message', event => {
        const next = waiting.shift();
        if (next) next(event as { event: string });
        else events.push(event as { event: string });
      });
      const next = () =>
        events.length
          ? Promise.resolve(events.shift()!)
          : new Promise<{ event: string; message?: string }>(resolve =>
              waiting.push(resolve)
            );
      return { child, next };
    };
    const staleReader = worker(true);
    assert.equal((await staleReader.next()).event, 'stale-observed');
    const winner = worker(false);
    assert.equal((await winner.next()).event, 'acquired');
    const active = readLease(lockFile);
    assert.equal(active.pid, winner.child.pid);
    staleReader.child.stdin!.write('x');
    const result = await staleReader.next();
    assert.equal(result.event, 'denied');
    assert.match(result.message!, /already in progress/);
    assert.equal(readLease(lockFile).id, active.id);
    winner.child.send('finish');
    assert.equal((await winner.next()).event, 'released');
    assert.throws(() => statSync(lockFile), /ENOENT/);
  }
);
