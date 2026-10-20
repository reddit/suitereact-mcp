#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const defaultProxyUrl =
  process.env.SUITEREACT_PROXY_URL || 'http://localhost:3001';

function writeOutput(value) {
  process.stdout.write(`${value}\n`);
}

function writeError(value) {
  process.stderr.write(`${value}\n`);
}

function usage() {
  writeOutput(`Usage:
  npm run test:action -- <action-name> [options]
  npm run test:action -- --list

Options:
  --data <json>          Inline JSON object passed to the action
  --data-file <path>     Read the action input from a JSON file
  --stdin                Read the action input as JSON from stdin
  --proxy-url <url>      Proxy base URL (default: ${defaultProxyUrl})
  --timeout <ms>         Request timeout (default: 120000)
  --output <path>        Write the full result artifact to this path
  --workflow-dir <path>  Record direct_action evidence in workflow.json
  --no-save              Do not write a result artifact
  --json                 Print the full result envelope as JSON
  --list                 List locally exported action functions
  --help                 Show this help

Examples:
  npm run test:action -- getUserProps
  npm run test:action -- getTableRowsFromSuiteql --data '{"query":"SELECT 1 AS value"}'
  npm run test:action -- generateInvoicePdfs --data-file .suitereact-testing/action-payloads/generateInvoicePdfs.json`);
}

function fail(message) {
  writeError(`Action test error: ${message}`);
  process.exitCode = 1;
}

function optionValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    action: '',
    data: undefined,
    dataFile: undefined,
    stdin: false,
    proxyUrl: defaultProxyUrl,
    timeoutMs: 120_000,
    output: undefined,
    workflowDir: undefined,
    save: true,
    json: false,
    list: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--data':
        options.data = optionValue(args, index, arg);
        index += 1;
        break;
      case '--data-file':
        options.dataFile = optionValue(args, index, arg);
        index += 1;
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--proxy-url':
        options.proxyUrl = optionValue(args, index, arg);
        index += 1;
        break;
      case '--timeout':
        options.timeoutMs = Number(optionValue(args, index, arg));
        index += 1;
        break;
      case '--output':
        options.output = optionValue(args, index, arg);
        index += 1;
        break;
      case '--workflow-dir':
        options.workflowDir = optionValue(args, index, arg);
        index += 1;
        break;
      case '--no-save':
        options.save = false;
        break;
      case '--json':
        options.json = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
        if (options.action) throw new Error(`Unexpected argument: ${arg}`);
        options.action = arg;
    }
  }

  const inputModes = [
    options.data !== undefined,
    !!options.dataFile,
    options.stdin,
  ];
  if (inputModes.filter(Boolean).length > 1) {
    throw new Error('Use only one of --data, --data-file, or --stdin');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout must be a positive number');
  }
  return options;
}

async function discoverActions() {
  const actionsDir = path.join(repoRoot, 'sdf', 'actions');
  const indexSource = await readFile(path.join(actionsDir, 'index.ts'), 'utf8');
  const moduleNames = Array.from(
    indexSource.matchAll(/export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g),
    match => match[1]
  );
  const actionNames = new Set();

  for (const moduleName of moduleNames) {
    const source = await readFile(
      path.join(actionsDir, `${moduleName}.ts`),
      'utf8'
    );
    for (const match of source.matchAll(
      /export\s+(?:async\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*)/g
    )) {
      actionNames.add(match[1]);
    }
  }
  return [...actionNames].sort((left, right) => left.localeCompare(right));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readInput(options) {
  let source = '{}';
  let sourceLabel = 'default input';

  if (options.data !== undefined) {
    source = options.data;
    sourceLabel = '--data';
  } else if (options.dataFile) {
    const inputPath = path.resolve(process.cwd(), options.dataFile);
    source = await readFile(inputPath, 'utf8');
    sourceLabel = inputPath;
  } else if (options.stdin) {
    source = await readStdin();
    sourceLabel = 'stdin';
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON from ${sourceLabel}: ${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`Action input from ${sourceLabel} must be a JSON object`);
  }
  return parsed;
}

function parseResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /(authorization|password|secret|token|consumer.?key)/i.test(key)
        ? '[REDACTED]'
        : redactSecrets(entry),
    ])
  );
}

function preview(value, depth = 0) {
  if (typeof value === 'string') {
    return value.length > 2_000
      ? `${value.slice(0, 2_000)}... [${value.length - 2_000} chars omitted]`
      : value;
  }
  if (Array.isArray(value)) {
    const entries = value.slice(0, 20).map(entry => preview(entry, depth + 1));
    if (value.length > 20) entries.push(`[${value.length - 20} items omitted]`);
    return entries;
  }
  if (value && typeof value === 'object') {
    if (depth >= 8) return '[nested value omitted]';
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        preview(entry, depth + 1),
      ])
    );
  }
  return value;
}

function artifactPath(action, output) {
  if (output) return path.resolve(process.cwd(), output);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = action.replace(/[^A-Za-z0-9_-]/g, '-');
  return path.join(
    repoRoot,
    '.suitereact-testing',
    'action-results',
    `${slug}-${timestamp}.json`
  );
}

async function saveArtifact(result, output) {
  const target = artifactPath(result.action, output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path.relative(repoRoot, target);
}

async function recordWorkflowCheck(workflowDir, result, savedTo) {
  const workflowFile = path.join(
    path.resolve(process.cwd(), workflowDir),
    'workflow.json'
  );
  const state = JSON.parse(await readFile(workflowFile, 'utf8'));
  state.checks ||= {};
  state.checks.direct_action = {
    status: result.ok ? 'passed' : 'failed',
    updatedAt: new Date().toISOString(),
    detail: `${result.action}: ${result.httpStatus || 'no HTTP status'} in ${result.durationMs}ms${savedTo ? ` (${savedTo})` : ''}`,
  };
  state.updatedAt = new Date().toISOString();
  await writeFile(workflowFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function invokeAction(options, action, inputData) {
  const proxyUrl = options.proxyUrl.replace(/\/$/, '');
  const endpoint = `${proxyUrl}/api/handle-action`;
  const startedAt = new Date().toISOString();
  const started = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        params: { actionProps: { action } },
        inputData,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const responseText = await response.text();
    return {
      action,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      proxyUrl,
      ok: response.ok,
      httpStatus: response.status,
      request: { inputData: redactSecrets(inputData) },
      response: parseResponse(responseText),
      error: response.ok
        ? null
        : `RESTlet request returned HTTP ${response.status}`,
    };
  } catch (error) {
    const timedOut =
      error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      action,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      proxyUrl,
      ok: false,
      httpStatus: null,
      request: { inputData: redactSecrets(inputData) },
      response: null,
      error: timedOut
        ? `Request timed out after ${options.timeoutMs}ms`
        : `${error?.message || error}. Is the proxy running at ${proxyUrl}?`,
    };
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    usage();
    return;
  }

  if (options.help) {
    usage();
    return;
  }

  let actions;
  try {
    actions = await discoverActions();
  } catch (error) {
    fail(`Could not inspect sdf/actions: ${error.message}`);
    return;
  }

  if (options.list) {
    writeOutput(actions.join('\n'));
    return;
  }
  if (!options.action) {
    fail('Provide an action name or use --list');
    usage();
    return;
  }

  const action = actions.find(
    candidate => candidate.toLowerCase() === options.action.toLowerCase()
  );
  if (!action) {
    fail(
      `Action "${options.action}" is not exported by sdf/actions/index.ts. Run with --list to inspect available actions.`
    );
    return;
  }

  let inputData;
  try {
    inputData = await readInput(options);
  } catch (error) {
    fail(error.message);
    return;
  }

  const result = await invokeAction(options, action, inputData);
  let savedTo = null;
  let workflowEvidenceError = null;
  if (options.save) {
    try {
      savedTo = await saveArtifact(result, options.output);
    } catch (error) {
      result.ok = false;
      result.error = `${result.error ? `${result.error}; ` : ''}Could not save result: ${error.message}`;
    }
  }
  if (options.workflowDir) {
    try {
      await recordWorkflowCheck(options.workflowDir, result, savedTo);
    } catch (error) {
      workflowEvidenceError = `Could not update workflow evidence: ${error.message}`;
    }
  }

  if (options.json) {
    writeOutput(
      JSON.stringify({ ...result, savedTo, workflowEvidenceError }, null, 2)
    );
  } else {
    writeOutput(
      `${result.ok ? 'PASS' : 'FAIL'} ${action} (${result.durationMs}ms${result.httpStatus ? `, HTTP ${result.httpStatus}` : ''})`
    );
    if (savedTo) writeOutput(`Result: ${savedTo}`);
    if (result.error) writeError(`Error: ${result.error}`);
    if (workflowEvidenceError) writeError(`Error: ${workflowEvidenceError}`);
    writeOutput(JSON.stringify(preview(result.response), null, 2));
  }
  if (!result.ok || workflowEvidenceError) process.exitCode = 1;
}

await main();
