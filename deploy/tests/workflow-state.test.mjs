import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = resolve('deploy/workflow-state.mjs');

function run(cwd, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    expectedStatus,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function repository() {
  const cwd = await mkdtemp(join(tmpdir(), 'suitereact-workflow-'));
  await mkdir(join(cwd, 'apps', 'sample', 'src'), { recursive: true });
  await mkdir(join(cwd, 'sdf', 'actions'), { recursive: true });
  await writeFile(join(cwd, '.gitignore'), '.workflows/\n');
  await writeFile(
    join(cwd, 'apps', 'sample', 'src', 'App.tsx'),
    'export {};\n'
  );
  await writeFile(join(cwd, 'sdf', 'actions', 'sample.ts'), 'export {};\n');
  await writeFile(join(cwd, 'unrelated.txt'), 'initial\n');
  git(cwd, ['init', '-b', 'feature']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'initial']);
  return cwd;
}

test('initializes canonical state and classifies owned server files', async () => {
  const cwd = await repository();
  run(cwd, [
    'init',
    'sample',
    '--goal',
    'improve action',
    '--workflow-id',
    'wf-20260710-120000',
  ]);
  const workflowDir = '.workflows/sample/wf-20260710-120000';
  run(cwd, ['own', workflowDir, 'sdf/actions/sample.ts']);
  const state = JSON.parse(
    await readFile(join(cwd, workflowDir, 'workflow.json'))
  );
  assert.equal(state.phase, 'planning');
  assert.equal(state.changeClass, 'server-action');
  assert.deepEqual(state.ownedFiles, ['sdf/actions/sample.ts']);
  const pipeline = JSON.parse(run(cwd, ['pipeline', workflowDir]).stdout);
  assert.match(pipeline.evidence[0], /unverified/);
});

test('requires explicit ownership of pre-existing changes', async () => {
  const cwd = await repository();
  await writeFile(join(cwd, 'unrelated.txt'), 'user edit\n');
  run(cwd, [
    'init',
    'sample',
    '--goal',
    'change UI',
    '--workflow-id',
    'wf-20260710-120001',
  ]);
  const workflowDir = '.workflows/sample/wf-20260710-120001';
  const refused = run(cwd, ['own', workflowDir, 'unrelated.txt'], 1);
  assert.match(refused.stderr, /dirty before workflow start/);
  run(cwd, ['own', workflowDir, 'unrelated.txt', '--allow-existing']);
  const state = JSON.parse(
    await readFile(join(cwd, workflowDir, 'workflow.json'))
  );
  assert.deepEqual(state.preExistingOwnedFiles, ['unrelated.txt']);
});

test('stages exact owned files and rejects unrelated staged changes', async () => {
  const cwd = await repository();
  run(cwd, [
    'init',
    'sample',
    '--goal',
    'change UI',
    '--workflow-id',
    'wf-20260710-120002',
  ]);
  const workflowDir = '.workflows/sample/wf-20260710-120002';
  await writeFile(
    join(cwd, 'apps', 'sample', 'src', 'App.tsx'),
    'export const changed = true;\n'
  );
  run(cwd, ['own', workflowDir, 'apps/sample/src/App.tsx']);
  run(cwd, ['stage', workflowDir]);
  assert.equal(
    git(cwd, ['diff', '--cached', '--name-only']),
    'apps/sample/src/App.tsx'
  );

  await writeFile(join(cwd, 'unrelated.txt'), 'user edit\n');
  git(cwd, ['add', 'unrelated.txt']);
  const refused = run(cwd, ['verify-stage', workflowDir], 1);
  assert.match(refused.stderr, /unrelated.txt/);
});

test('refuses staging on a different target branch', async () => {
  const cwd = await repository();
  run(cwd, [
    'init',
    'sample',
    '--goal',
    'change UI',
    '--workflow-id',
    'wf-20260710-120003',
    '--target-branch',
    'main',
  ]);
  const workflowDir = '.workflows/sample/wf-20260710-120003';
  await writeFile(
    join(cwd, 'apps', 'sample', 'src', 'App.tsx'),
    'export const changed = true;\n'
  );
  run(cwd, ['own', workflowDir, 'apps/sample/src/App.tsx']);
  const refused = run(cwd, ['stage', workflowDir], 1);
  assert.match(refused.stderr, /workflow target is main/);
});

test('enforces transitions, iteration limits, and deployment ordering', async () => {
  const cwd = await repository();
  run(cwd, [
    'init',
    'sample',
    '--goal',
    'ship UI',
    '--workflow-id',
    'wf-20260710-120004',
    '--deploy',
    'SB1',
  ]);
  const workflowDir = '.workflows/sample/wf-20260710-120004';
  assert.match(
    run(cwd, ['transition', workflowDir, 'committed'], 1).stderr,
    /Invalid workflow transition/
  );
  for (const phase of ['coding', 'verifying', 'ready_to_commit']) {
    run(cwd, ['transition', workflowDir, phase]);
  }
  assert.match(
    run(cwd, ['deployment', workflowDir, 'deployed'], 1).stderr,
    /only after the workflow is committed/
  );
  for (let index = 0; index < 4; index += 1)
    run(cwd, ['iteration', workflowDir]);
  assert.match(run(cwd, ['iteration', workflowDir], 1).stderr, /limit reached/);
});

test('returns conditional pipelines for new, UI, server, and shared changes', async () => {
  const cwd = await repository();

  run(cwd, [
    'init',
    'new-app',
    '--goal',
    'create app',
    '--workflow-id',
    'wf-20260710-120005',
  ]);
  const newPipeline = JSON.parse(
    run(cwd, ['pipeline', '.workflows/new-app/wf-20260710-120005']).stdout
  );
  assert.deepEqual(newPipeline.stages, [
    'scaffold',
    'app-build',
    'sdf-build',
    'review',
    'ui-smoke',
    'docs',
  ]);

  run(cwd, [
    'init',
    'sample',
    '--goal',
    'change UI',
    '--workflow-id',
    'wf-20260710-120006',
  ]);
  run(cwd, [
    'own',
    '.workflows/sample/wf-20260710-120006',
    'apps/sample/src/App.tsx',
  ]);
  const uiPipeline = JSON.parse(
    run(cwd, ['pipeline', '.workflows/sample/wf-20260710-120006']).stdout
  );
  assert.deepEqual(uiPipeline.stages, ['app-build', 'review', 'ui-smoke']);

  run(cwd, [
    'init',
    'sample',
    '--goal',
    'ship action',
    '--workflow-id',
    'wf-20260710-120007',
    '--deploy',
    'SB1',
  ]);
  run(cwd, [
    'own',
    '.workflows/sample/wf-20260710-120007',
    'sdf/actions/sample.ts',
  ]);
  const serverPipeline = JSON.parse(
    run(cwd, ['pipeline', '.workflows/sample/wf-20260710-120007']).stdout
  );
  assert.ok(serverPipeline.stages.includes('narrow-validate'));
  assert.ok(serverPipeline.stages.includes('direct-action'));
  assert.ok(serverPipeline.stages.includes('deploy'));

  run(cwd, [
    'init',
    'sample',
    '--goal',
    'change library',
    '--workflow-id',
    'wf-20260710-120008',
  ]);
  run(cwd, [
    'own',
    '.workflows/sample/wf-20260710-120008',
    'suitereact/src/index.ts',
  ]);
  const sharedPipeline = JSON.parse(
    run(cwd, ['pipeline', '.workflows/sample/wf-20260710-120008']).stdout
  );
  assert.deepEqual(sharedPipeline.stages, [
    'library-build',
    'affected-app-builds',
    'review',
    'ui-smoke',
  ]);
});
