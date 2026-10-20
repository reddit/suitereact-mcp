import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyReleaseTag({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const ref = env.GITHUB_REF || '';
  if (
    env.GITHUB_REF_TYPE !== 'tag' ||
    !/^refs\/tags\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(ref)
  ) {
    throw new Error('Publication requires a version tag (vMAJOR.MINOR.PATCH).');
  }
  if (env.GITHUB_REF_PROTECTED !== 'true') {
    throw new Error(
      'Publication requires an enforced protection rule for the release tag.'
    );
  }
  const signers = env.RELEASE_ALLOWED_SIGNERS?.trim();
  if (!signers)
    throw new Error(
      'Configure RELEASE_ALLOWED_SIGNERS in the protected npm-publish environment.'
    );
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (git('cat-file', '-t', ref) !== 'tag')
    throw new Error('Release tags must be annotated and signed.');
  const head = git('rev-parse', 'HEAD');
  if (git('rev-parse', `${ref}^{commit}`) !== head || env.GITHUB_SHA !== head) {
    throw new Error(
      'The release tag, dispatched commit, and checkout must match.'
    );
  }
  if (
    !git('cat-file', 'tag', ref).includes('\n-----BEGIN SSH SIGNATURE-----\n')
  ) {
    throw new Error(
      'Release tags must carry an SSH signature from an allowed release signer.'
    );
  }
  const root = mkdtempSync(join(tmpdir(), 'suitereact-release-signers-'));
  try {
    const allowed = join(root, 'allowed_signers');
    writeFileSync(allowed, `${signers}\n`, { mode: 0o600 });
    git(
      '-c',
      'gpg.format=ssh',
      '-c',
      `gpg.ssh.allowedSignersFile=${allowed}`,
      'verify-tag',
      ref
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return head;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const head = verifyReleaseTag();
    process.stdout.write(`Verified protected release tag at ${head}\n`);
  } catch (error) {
    process.stderr.write(`Release verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
