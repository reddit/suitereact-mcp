import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyReleaseTag } from '../verify-release-tag.mjs';

test('publication accepts only a protected, trusted signed tag at the dispatched checkout', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'suitereact-tag-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const key = join(cwd, 'release-key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  git('init', '-q');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('config', 'gpg.format', 'ssh');
  git('config', 'user.signingKey', key);
  git('commit', '--allow-empty', '-qm', 'release fixture');
  git('tag', '-s', 'v1.0.0', '-m', 'release');
  const env = {
    GITHUB_REF: 'refs/tags/v1.0.0',
    GITHUB_REF_TYPE: 'tag',
    GITHUB_REF_PROTECTED: 'true',
    GITHUB_SHA: git('rev-parse', 'HEAD'),
    RELEASE_ALLOWED_SIGNERS: `release@example.invalid ${readFileSync(`${key}.pub`, 'utf8').trim()}`,
  };
  assert.equal(verifyReleaseTag({ cwd, env }), env.GITHUB_SHA);
  for (const [override, message] of [
    [
      { GITHUB_REF_TYPE: 'branch', GITHUB_REF: 'refs/heads/main' },
      /version tag/,
    ],
    [{ GITHUB_REF: 'refs/tags/not-a-version' }, /version tag/],
    [{ GITHUB_REF_PROTECTED: 'false' }, /protection rule/],
    [{ RELEASE_ALLOWED_SIGNERS: '' }, /RELEASE_ALLOWED_SIGNERS/],
    [{ GITHUB_SHA: '0'.repeat(40) }, /must match/],
  ])
    assert.throws(
      () => verifyReleaseTag({ cwd, env: { ...env, ...override } }),
      message
    );

  git('tag', 'v1.0.1');
  assert.throws(
    () =>
      verifyReleaseTag({
        cwd,
        env: { ...env, GITHUB_REF: 'refs/tags/v1.0.1' },
      }),
    /annotated and signed/
  );
  git('tag', '-a', 'v1.0.2', '-m', 'unsigned');
  assert.throws(
    () =>
      verifyReleaseTag({
        cwd,
        env: { ...env, GITHUB_REF: 'refs/tags/v1.0.2' },
      }),
    /SSH signature/
  );
  const untrusted = join(cwd, 'untrusted-key');
  execFileSync('ssh-keygen', [
    '-q',
    '-t',
    'ed25519',
    '-N',
    '',
    '-f',
    untrusted,
  ]);
  git(
    '-c',
    `user.signingKey=${untrusted}`,
    'tag',
    '-s',
    'v1.0.3',
    '-m',
    'untrusted'
  );
  assert.throws(
    () =>
      verifyReleaseTag({
        cwd,
        env: { ...env, GITHUB_REF: 'refs/tags/v1.0.3' },
      }),
    /verify-tag/
  );
  git('commit', '--allow-empty', '-qm', 'different checkout');
  assert.throws(
    () =>
      verifyReleaseTag({
        cwd,
        env: { ...env, GITHUB_SHA: git('rev-parse', 'HEAD') },
      }),
    /must match/
  );
});

test('release verification precedes dependency code and both publish steps', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
  const gate = workflow.indexOf('run: node deploy/verify-release-tag.mjs');
  assert.ok(gate > 0 && gate < workflow.indexOf('run: npm ci'));
  for (const workspace of ['suitereact', 'mcp-server-netsuite']) {
    assert.ok(
      gate < workflow.indexOf(`run: npm publish --workspace=${workspace}`)
    );
  }
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(
    workflow,
    /RELEASE_ALLOWED_SIGNERS: \$\{\{ vars.RELEASE_ALLOWED_SIGNERS \}\}/
  );
});
