#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const phases = new Set([
  'planning',
  'coding',
  'verifying',
  'ready_to_commit',
  'committed',
  'deployed',
  'blocked',
]);
const outcomes = new Set(['pending', 'passed', 'failed', 'partial']);
const checkStatuses = new Set([
  'pending',
  'passed',
  'failed',
  'not_run',
  'unverified',
]);
const allowedTransitions = {
  planning: new Set(['coding', 'blocked']),
  coding: new Set(['verifying', 'blocked']),
  verifying: new Set(['ready_to_commit', 'blocked']),
  ready_to_commit: new Set(['committed', 'blocked']),
  committed: new Set(['deployed', 'blocked']),
  deployed: new Set(),
  blocked: new Set(['coding', 'verifying']),
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 && !allowFailure) {
    fail(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

function timestampId(date = new Date()) {
  return `wf-${date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15)}`;
}

function repoPath(path) {
  const absolute = isAbsolute(path) ? normalize(path) : resolve(repoRoot, path);
  const result = relative(repoRoot, absolute).replaceAll('\\', '/');
  if (!result || result === '.' || result.startsWith('../')) {
    fail(`Path must be a file inside the repository: ${path}`);
  }
  if (result === '.workflows' || result.startsWith('.workflows/')) {
    fail(
      `Workflow artifacts are ephemeral and cannot be owned or staged: ${result}`
    );
  }
  return result;
}

function workflowFile(path) {
  if (basename(path) === 'workflow.json') return path;
  return join(path, 'workflow.json');
}

async function readState(path) {
  const file = workflowFile(path);
  if (!existsSync(file)) fail(`Workflow state not found: ${file}`);
  return { file, state: JSON.parse(await readFile(file, 'utf8')) };
}

async function saveState(file, state) {
  state.updatedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

function porcelainPath(line) {
  const value = /^[ MADRCU?!]{2} /.test(line)
    ? line.slice(3).trim()
    : /^[MADRCU] /.test(line)
      ? line.slice(2).trim()
      : line.trim();
  const renamedPath = value.includes(' -> ')
    ? value.split(' -> ').at(-1)
    : value;
  return renamedPath?.replace(/^"|"$/g, '') || '';
}

function classify(state, files) {
  if (!state.initialAppExists) return 'new-app';
  if (
    files.some(
      file => file.startsWith('suitereact/') || file.startsWith('mcp/')
    )
  ) {
    return 'shared-library';
  }
  if (
    files.some(
      file =>
        file.startsWith('sdf/') ||
        file.startsWith(`apps/${state.appName}/suitelet/`) ||
        file.startsWith(`apps/${state.appName}/utils/`)
    )
  ) {
    return 'server-action';
  }
  if (
    files.length > 0 &&
    files.every(file =>
      [
        'deploy.override',
        'manifest.override',
        'deploy.xml',
        'manifest.xml',
      ].includes(file)
    )
  ) {
    return 'deployment';
  }
  return 'ui-only';
}

async function init(args) {
  const appName = args[0];
  const goal = readArg(args, '--goal');
  if (!appName || !goal) {
    fail(
      'Usage: workflow-state.mjs init <app-name> --goal <text> [--workflow-id <id>] [--target-branch <branch>] [--deploy <environment>]'
    );
  }
  const workflowId = readArg(args, '--workflow-id', timestampId());
  if (!/^wf-\d{8}-\d{6}$/.test(workflowId))
    fail(`Invalid workflow ID: ${workflowId}`);
  const startingBranch = git(['branch', '--show-current']);
  if (!startingBranch)
    fail(
      'Workflows require a named Git branch; detached HEAD is not supported.'
    );
  const targetBranch = readArg(args, '--target-branch', startingBranch);
  const environment = readArg(args, '--deploy');
  const directory = join(repoRoot, '.workflows', appName, workflowId);
  if (existsSync(join(directory, 'workflow.json')))
    fail(`Workflow already exists: ${directory}`);
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  const state = {
    schemaVersion: 1,
    appName,
    workflowId,
    goal,
    phase: 'planning',
    outcome: 'pending',
    changeClass: existsSync(join(repoRoot, 'apps', appName))
      ? 'ui-only'
      : 'new-app',
    startedAt: now,
    updatedAt: now,
    startingBranch,
    targetBranch,
    initialAppExists: existsSync(join(repoRoot, 'apps', appName)),
    startingChanges: git(['status', '--short']).split('\n').filter(Boolean),
    preExistingOwnedFiles: [],
    ownedFiles: [],
    checks: {},
    iteration: 0,
    commitSha: null,
    notes: [],
    deployment: {
      requested: Boolean(environment),
      environment,
      status: environment ? 'pending' : 'not_requested',
      deployedFiles: [],
    },
  };
  await writeFile(join(directory, 'request.txt'), `${goal.trim()}\n`);
  await saveState(join(directory, 'workflow.json'), state);
  console.log(
    JSON.stringify(
      { workflowDir: relative(repoRoot, directory), ...state },
      null,
      2
    )
  );
}

async function transition(args) {
  const [path, phase] = args;
  if (!path || !phases.has(phase))
    fail(`Invalid phase. Expected one of: ${[...phases].join(', ')}`);
  const { file, state } = await readState(path);
  if (phase !== state.phase && !allowedTransitions[state.phase]?.has(phase)) {
    fail(`Invalid workflow transition: ${state.phase} -> ${phase}`);
  }
  const outcome = readArg(args, '--outcome');
  if (outcome && !outcomes.has(outcome)) fail(`Invalid outcome: ${outcome}`);
  state.phase = phase;
  if (outcome) state.outcome = outcome;
  const note = readArg(args, '--note');
  if (note) state.notes = [...(state.notes || []), note];
  await saveState(file, state);
  console.log(JSON.stringify(state, null, 2));
}

async function iteration(args) {
  const [path] = args;
  if (!path) fail('Usage: workflow-state.mjs iteration <workflow-dir>');
  const { file, state } = await readState(path);
  if (state.iteration >= 4) fail('Verification iteration limit reached (4).');
  state.iteration += 1;
  await saveState(file, state);
  console.log(
    JSON.stringify(
      { iteration: state.iteration, remaining: 4 - state.iteration },
      null,
      2
    )
  );
}

async function deployment(args) {
  const [path, status, ...rest] = args;
  if (!path || !['validated', 'deployed', 'failed'].includes(status)) {
    fail(
      'Usage: workflow-state.mjs deployment <workflow-dir> <validated|deployed|failed> [--files <file>...]'
    );
  }
  const { file, state } = await readState(path);
  if (!state.deployment.requested) fail('Workflow did not request deployment.');
  const filesIndex = rest.indexOf('--files');
  const deployedFiles = filesIndex === -1 ? [] : rest.slice(filesIndex + 1);
  state.deployment.status = status;
  if (deployedFiles.length > 0) state.deployment.deployedFiles = deployedFiles;
  if (status === 'deployed') {
    if (state.phase !== 'committed')
      fail('Deployment can complete only after the workflow is committed.');
    state.phase = 'deployed';
    state.outcome = 'passed';
  }
  if (status === 'failed') state.outcome = 'failed';
  await saveState(file, state);
  console.log(JSON.stringify(state.deployment, null, 2));
}

async function own(args) {
  const [path, ...paths] = args;
  if (!path || paths.length === 0)
    fail('Usage: workflow-state.mjs own <workflow-dir> <file>...');
  const { file, state } = await readState(path);
  const requested = paths.filter(arg => !arg.startsWith('--')).map(repoPath);
  const startingFiles = new Set(
    (state.startingChanges || []).map(porcelainPath)
  );
  const preExisting = requested.filter(filePath => startingFiles.has(filePath));
  if (preExisting.length > 0 && !args.includes('--allow-existing')) {
    fail(
      `Refusing ownership of files dirty before workflow start: ${preExisting.join(', ')}. ` +
        'Inspect them and rerun with --allow-existing only when the workflow intentionally owns those edits.'
    );
  }
  state.ownedFiles = [
    ...new Set([...(state.ownedFiles || []), ...requested]),
  ].sort();
  state.preExistingOwnedFiles = [
    ...new Set([...(state.preExistingOwnedFiles || []), ...preExisting]),
  ].sort();
  state.changeClass = classify(state, state.ownedFiles);
  await saveState(file, state);
  console.log(
    JSON.stringify(
      { ownedFiles: state.ownedFiles, changeClass: state.changeClass },
      null,
      2
    )
  );
}

async function pipeline(args) {
  const [path] = args;
  if (!path) fail('Usage: workflow-state.mjs pipeline <workflow-dir>');
  const { state } = await readState(path);
  const stages = {
    'new-app': [
      'scaffold',
      'app-build',
      'sdf-build',
      'review',
      'ui-smoke',
      'docs',
    ],
    'ui-only': ['app-build', 'review', 'ui-smoke'],
    'server-action': ['server-build', 'review', 'ui-smoke'],
    'shared-library': [
      'library-build',
      'affected-app-builds',
      'review',
      'ui-smoke',
    ],
    deployment: ['validate', 'dry-run'],
  }[state.changeClass];
  const required = [...stages];
  const evidence = [];
  if (state.changeClass === 'server-action') {
    if (state.deployment.requested) {
      required.splice(
        2,
        0,
        'narrow-validate',
        'narrow-deploy',
        'direct-action'
      );
      evidence.push('direct_action: passed before live UI');
    } else {
      evidence.push('server_live: unverified');
    }
  }
  if (state.deployment.requested)
    required.push('validate', 'dry-run', 'deploy');
  console.log(
    JSON.stringify(
      {
        changeClass: state.changeClass,
        deployment: state.deployment,
        stages: [...new Set(required)],
        evidence,
      },
      null,
      2
    )
  );
}

async function classifyCommand(args) {
  const [path, ...paths] = args;
  if (!path)
    fail('Usage: workflow-state.mjs classify <workflow-dir> [file]...');
  const { file, state } = await readState(path);
  const files = paths.length > 0 ? paths.map(repoPath) : state.ownedFiles || [];
  if (files.length === 0) {
    fail(
      'No owned files recorded; classify after recording workflow ownership.'
    );
  }
  state.changeClass = classify(state, files);
  await saveState(file, state);
  console.log(
    JSON.stringify({ changeClass: state.changeClass, files }, null, 2)
  );
}

async function check(args) {
  const [path, name, status] = args;
  if (!path || !name || !checkStatuses.has(status)) {
    fail(
      `Usage: workflow-state.mjs check <workflow-dir> <name> <${[...checkStatuses].join('|')}> [--detail <text>]`
    );
  }
  const { file, state } = await readState(path);
  state.checks[name] = {
    status,
    updatedAt: new Date().toISOString(),
    ...(readArg(args, '--detail') ? { detail: readArg(args, '--detail') } : {}),
  };
  await saveState(file, state);
  console.log(JSON.stringify(state.checks[name], null, 2));
}

function branchOwner(targetBranch) {
  const lines = git(['worktree', 'list', '--porcelain']).split('\n');
  let worktree = null;
  for (const line of lines) {
    if (line.startsWith('worktree ')) worktree = line.slice('worktree '.length);
    if (line === `branch refs/heads/${targetBranch}`) return worktree;
  }
  return null;
}

async function stage(args) {
  const [path] = args;
  if (!path) fail('Usage: workflow-state.mjs stage <workflow-dir>');
  const { state } = await readState(path);
  const currentBranch = git(['branch', '--show-current']);
  if (currentBranch !== state.targetBranch) {
    const owner = branchOwner(state.targetBranch);
    fail(
      `Refusing to stage on ${currentBranch}; workflow target is ${state.targetBranch}.` +
        (owner ? ` Target branch is checked out at ${owner}.` : '') +
        ' Run the workflow in the target worktree, or commit on the current branch and explicitly cherry-pick that SHA into the target branch.'
    );
  }
  if (!state.ownedFiles?.length)
    fail('No owned files recorded; refusing broad staging.');
  git(['add', '--', ...state.ownedFiles]);
  verifyOwnedStage(state);
  console.log(
    JSON.stringify(
      { branch: currentBranch, stagedFiles: stagedFiles() },
      null,
      2
    )
  );
}

function stagedFiles() {
  return git(['diff', '--cached', '--name-only', '--'])
    .split('\n')
    .filter(Boolean)
    .sort();
}

function verifyOwnedStage(state) {
  const owned = new Set(state.ownedFiles || []);
  const staged = stagedFiles();
  const extras = staged.filter(file => !owned.has(file));
  const workflowArtifacts = staged.filter(
    file => file === '.workflows' || file.startsWith('.workflows/')
  );
  if (extras.length || workflowArtifacts.length) {
    fail(
      `Staged files exceed workflow ownership: ${[...new Set([...extras, ...workflowArtifacts])].join(', ')}`
    );
  }
  if (staged.length === 0) fail('No owned changes are staged.');
  return staged;
}

async function verifyStage(args) {
  const [path] = args;
  if (!path) fail('Usage: workflow-state.mjs verify-stage <workflow-dir>');
  const { state } = await readState(path);
  console.log(
    JSON.stringify({ stagedFiles: verifyOwnedStage(state) }, null, 2)
  );
}

async function finalizeCommit(args) {
  const [path] = args;
  const sha = readArg(args, '--sha', git(['rev-parse', 'HEAD']));
  if (!path)
    fail(
      'Usage: workflow-state.mjs finalize-commit <workflow-dir> [--sha <sha>]'
    );
  const { file, state } = await readState(path);
  if (state.phase !== 'ready_to_commit') {
    fail(
      `Cannot finalize commit from workflow phase ${state.phase}; expected ready_to_commit.`
    );
  }
  const currentBranch = git(['branch', '--show-current']);
  if (currentBranch !== state.targetBranch) {
    fail(
      `Commit branch ${currentBranch} does not match workflow target ${state.targetBranch}.`
    );
  }
  state.phase = 'committed';
  state.outcome = 'passed';
  state.commitSha = sha;
  await saveState(file, state);
  console.log(JSON.stringify({ phase: state.phase, commitSha: sha }, null, 2));
}

async function show(args) {
  const [path] = args;
  if (!path) fail('Usage: workflow-state.mjs show <workflow-dir>');
  const { state } = await readState(path);
  console.log(JSON.stringify(state, null, 2));
}

const [command, ...args] = process.argv.slice(2);
const commands = {
  init,
  transition,
  iteration,
  own,
  classify: classifyCommand,
  pipeline,
  check,
  deployment,
  stage,
  'verify-stage': verifyStage,
  'finalize-commit': finalizeCommit,
  show,
};
if (!commands[command]) {
  fail(`Usage: workflow-state.mjs <${Object.keys(commands).join('|')}> ...`);
}
await commands[command](args);
