import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

async function fixture(t) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'skills test-'))
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'checkout');
  const home = path.join(root, 'home');
  const source = path.join(repo, '.agents/skills');
  await mkdir(home);
  await cp(path.join(repoRoot, '.agents/skills'), source, { recursive: true });
  await cp(
    path.join(repoRoot, 'link-skills.sh'),
    path.join(repo, 'link-skills.sh')
  );
  const names = (await readdir(source)).sort();
  assert.equal(names.length, 14);
  assert.ok(names.includes('suiteql-cookbook'));
  return {
    root,
    repo,
    home,
    source,
    names,
    run: (...args) =>
      spawnSync('bash', [path.join(repo, 'link-skills.sh'), ...args], {
        cwd: root,
        // Isolate the script's actual user-home destinations from the machine.
        env: { ...process.env, HOME: home },
        encoding: 'utf8',
      }),
  };
}

async function missing(file) {
  await assert.rejects(lstat(file), { code: 'ENOENT' });
}

async function verifyLinks(f, target) {
  assert.deepEqual((await readdir(target)).sort(), f.names);
  for (const name of f.names) {
    const installed = path.join(target, name);
    assert.ok((await lstat(installed)).isSymbolicLink());
    assert.equal(await realpath(installed), path.join(f.source, name));
    // Compare every companion resource as well as SKILL.md through the link.
    for (const file of await readdir(path.join(f.source, name), {
      recursive: true,
    })) {
      const original = path.join(f.source, name, file);
      if ((await lstat(original)).isFile()) {
        assert.deepEqual(
          await readFile(path.join(installed, file)),
          await readFile(original)
        );
      }
    }
  }
}

test('default install exposes the entire skill set once and is idempotent', async t => {
  const f = await fixture(t);
  for (let pass = 0; pass < 2; pass++) {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    await verifyLinks(f, path.join(f.home, '.agents/skills'));
    await missing(path.join(f.home, '.cursor'));
    await missing(path.join(f.home, '.codex'));
    await missing(path.join(f.home, '.claude'));
  }
  const sourceSkill = path.join(f.source, f.names[0], 'SKILL.md');
  await writeFile(sourceSkill, 'updated source');
  assert.equal(
    await readFile(
      path.join(f.home, '.agents/skills', f.names[0], 'SKILL.md'),
      'utf8'
    ),
    'updated source'
  );
});

test('old three-directory installs migrate to one live universal set', async t => {
  const f = await fixture(t);
  for (const directory of ['.agents', '.cursor', '.codex']) {
    const target = path.join(f.home, directory, 'skills');
    await mkdir(target, { recursive: true });
    for (const name of f.names) {
      // Old absolute source links are now dangling after the directory move.
      await symlink(
        path.join(f.repo, '.cursor/skills', name),
        path.join(target, name)
      );
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    await verifyLinks(f, path.join(f.home, '.agents/skills'));
    assert.deepEqual(await readdir(path.join(f.home, '.cursor/skills')), []);
    assert.deepEqual(await readdir(path.join(f.home, '.codex/skills')), []);
  }
});

test('copied skills and unrelated dangling links are preserved and reported', async t => {
  const f = await fixture(t);
  const target = path.join(f.home, '.agents/skills');
  const copied = path.join(target, f.names[0]);
  await mkdir(copied, { recursive: true });
  await writeFile(path.join(copied, 'SKILL.md'), 'local customization');
  const other = path.join(f.root, 'another checkout', f.names[1]);
  await symlink(other, path.join(target, f.names[1]));
  const legacy = path.join(f.home, '.cursor/skills', f.names[0]);
  await mkdir(path.dirname(legacy), { recursive: true });
  await symlink(path.join(f.repo, '.cursor/skills', f.names[0]), legacy);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Preserved existing installation/);
  assert.equal(
    await readFile(path.join(copied, 'SKILL.md'), 'utf8'),
    'local customization'
  );
  assert.equal(await readlink(path.join(target, f.names[1])), other);
  assert.equal(
    await readlink(legacy),
    path.join(f.repo, '.cursor/skills', f.names[0])
  );
});

test('unowned legacy installations survive cleanup and produce a conflict', async t => {
  const f = await fixture(t);
  const copied = path.join(f.home, '.cursor/skills', f.names[0]);
  await mkdir(copied, { recursive: true });
  await writeFile(path.join(copied, 'SKILL.md'), 'legacy customization');
  const target = path.join(f.home, '.codex/skills');
  await mkdir(target, { recursive: true });
  const other = path.join(f.root, 'unrelated');
  await symlink(other, path.join(target, f.names[1]));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Preserved additional installation/);
  await verifyLinks(f, path.join(f.home, '.agents/skills'));
  assert.equal(
    await readFile(path.join(copied, 'SKILL.md'), 'utf8'),
    'legacy customization'
  );
  assert.equal(await readlink(path.join(target, f.names[1])), other);
});

test('explicit harness destination is relative to caller and only touches that destination', async t => {
  const f = await fixture(t);
  const legacy = path.join(f.home, '.cursor/skills', f.names[0]);
  await mkdir(path.dirname(legacy), { recursive: true });
  const oldSource = path.join(f.repo, '.cursor/skills', f.names[0]);
  await symlink(oldSource, legacy);
  const target = path.join(f.root, 'custom client/.claude/skills');
  await mkdir(target, { recursive: true });
  await symlink(oldSource, path.join(target, f.names[0]));
  for (let pass = 0; pass < 2; pass++) {
    const result = f.run('--target-dir', 'custom client/.claude/skills');
    assert.equal(result.status, 0, result.stderr);
    await verifyLinks(f, target);
    await missing(path.join(f.home, '.agents'));
    assert.equal(await readlink(legacy), oldSource);
  }
});

test('aliased discovery roots do not remove the newly installed links', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.home, '.agents/skills'), { recursive: true });
  await symlink(path.join(f.home, '.agents'), path.join(f.home, '.cursor'));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  await verifyLinks(f, path.join(f.home, '.agents/skills'));
});

test('source directory targets, including aliases, are rejected without changing skills', async t => {
  const f = await fixture(t);
  const alias = path.join(f.root, 'source alias');
  await symlink(f.source, alias);
  const originalTree = (await readdir(f.source, { recursive: true })).sort();
  for (const target of [
    f.source,
    alias,
    path.join(f.source, f.names[0]),
    path.join(f.source, 'unexpected/nested'),
    `${path.relative(f.root, f.source)}/unexpected/../nested`,
    `${alias}/unexpected/./nested/`,
    `${f.repo}/.agents/../.agents/skills/unexpected`,
  ]) {
    const result = f.run('--target-dir', target);
    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(
      (await readdir(f.source, { recursive: true })).sort(),
      originalTree,
      `rejected target must not change the source: ${target}`
    );
  }
  for (const name of f.names) {
    assert.ok((await lstat(path.join(f.source, name))).isDirectory());
    assert.ok((await lstat(path.join(f.source, name, 'SKILL.md'))).isFile());
  }
});

test('external targets with missing components and dot segments create only the final destination', async t => {
  const f = await fixture(t);
  const result = f.run('--target-dir', 'discarded/../external/./skills/');
  assert.equal(result.status, 0, result.stderr);
  await missing(path.join(f.root, 'discarded'));
  await verifyLinks(f, path.join(f.root, 'external/skills'));
});

test('invalid arguments and help do not install skills', async t => {
  const f = await fixture(t);
  for (const args of [
    ['--target-dir'],
    ['--target-dir', ''],
    ['--target-dir', '--help'],
    ['--unknown'],
  ]) {
    assert.equal(f.run(...args).status, 2);
  }
  assert.equal(f.run('--help').status, 0);
  assert.deepEqual(await readdir(f.home), []);
});
