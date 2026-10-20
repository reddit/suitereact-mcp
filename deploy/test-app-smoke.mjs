#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const appName = args.find(arg => !arg.startsWith('--'));

function readArg(name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

if (!appName) {
  console.error(
    'Usage: npm run test:app -- <app-name> --url <vite-url> [--live] [--workflow-dir <path>] [--spec <path>]'
  );
  process.exit(1);
}

const repoRoot = process.cwd();
const url = readArg(
  '--url',
  process.env.SUITEREACT_VITE_URL || 'http://localhost:5173'
);
const live = args.includes('--live');
const proxyUrl = process.env.SUITEREACT_PROXY_URL || 'http://localhost:3001';
const workflowDirArg = readArg('--workflow-dir');
const workflowDir = workflowDirArg ? resolve(repoRoot, workflowDirArg) : null;
const workflowId = workflowDir ? basename(workflowDir) : null;
const artifactRoot = join(repoRoot, '.suitereact-testing');
const screenshotDir = join(artifactRoot, 'screenshots');
const fallbackResultsDir = join(artifactRoot, 'test-results');
const defaultSpec = join(repoRoot, 'apps', appName, 'test', 'smoke.mjs');
const specPath = resolve(repoRoot, readArg('--spec', defaultSpec));
const resultFile = workflowDir
  ? join(workflowDir, 'test-results.json')
  : join(fallbackResultsDir, `${appName}-smoke.json`);

await mkdir(screenshotDir, { recursive: true });
await mkdir(workflowDir || fallbackResultsDir, { recursive: true });

let workflowState = null;
if (workflowDir && existsSync(join(workflowDir, 'workflow.json'))) {
  workflowState = JSON.parse(
    await readFile(join(workflowDir, 'workflow.json'), 'utf8')
  );
}

async function proxyIsHealthy() {
  if (!live) return false;
  try {
    const response = await fetch(`${proxyUrl.replace(/\/$/, '')}/api/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    const body = response.ok ? await response.json() : null;
    return body?.service === 'suitereact-proxy' && body?.status === 'ok';
  } catch {
    return false;
  }
}

const proxyRunning = await proxyIsHealthy();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleMessages = [];
const pageErrors = [];
const actionResponses = [];
const screenshots = [];
const snapshots = [];
const metrics = {};

page.on('console', message => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push({ type: message.type(), text: message.text() });
  }
});
page.on('pageerror', error => pageErrors.push(error.message));
page.on('response', response => {
  if (response.url().includes('/api/handle-action')) {
    actionResponses.push({
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      capturedAt: new Date().toISOString(),
    });
  }
});

const result = {
  schemaVersion: 1,
  appName,
  workflowId,
  capturedAt: new Date().toISOString(),
  passed: false,
  mode: live ? 'live-netsuite' : 'ui-smoke',
  viteUrl: url,
  proxyUrl: live ? proxyUrl : null,
  proxyRunning,
  spec: existsSync(specPath) ? relative(repoRoot, specPath) : null,
  dataLoaded: false,
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors,
  actionResponses,
  screenshots,
  snapshots,
  metrics,
  errors: [],
  notes: [],
};

async function screenshot(label) {
  const safeLabel = label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const name = `${appName}-${workflowId || 'standalone'}-${safeLabel}.png`;
  const path = join(screenshotDir, name);
  await page.screenshot({ path, fullPage: true });
  screenshots.push(relative(repoRoot, path));
  return path;
}

async function step(label, operation) {
  const started = performance.now();
  try {
    const detail = await operation();
    const durationMs = Math.round(performance.now() - started);
    snapshots.push({ label, passed: true, durationMs, detail });
    return detail;
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : String(error);
    snapshots.push({ label, passed: false, durationMs, error: message });
    throw error;
  }
}

let expectedConsoleErrors = [];

try {
  await step('render', async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => {});
    const root = page.locator('#root');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    const rootText = (await root.innerText({ timeout: 10_000 })).trim();
    if (!rootText) throw new Error('#root rendered with no visible text');
    return { rootTextLength: rootText.length };
  });

  if (existsSync(specPath)) {
    const specModule = await import(pathToFileURL(specPath).href);
    const runSmoke = specModule.runSmoke || specModule.default;
    if (typeof runSmoke !== 'function') {
      throw new Error(`${relative(repoRoot, specPath)} must export runSmoke()`);
    }
    const specResult =
      (await runSmoke({ page, live, step, screenshot, actionResponses })) || {};
    result.dataLoaded = Boolean(specResult.dataLoaded);
    expectedConsoleErrors = specResult.expectedConsoleErrors || [];
    Object.assign(metrics, specResult.metrics || {});
    result.notes.push(...(specResult.notes || []));
  }

  if (pageErrors.length > 0) {
    result.errors.push(`page errors: ${pageErrors.join('; ')}`);
  }
  const allConsoleErrors = consoleMessages
    .filter(message => message.type === 'error')
    .map(message => message.text);
  const isExpected = text =>
    expectedConsoleErrors.some(pattern => pattern.test(text));
  result.consoleErrors = allConsoleErrors.filter(text => !isExpected(text));
  const expectedSeen = allConsoleErrors.filter(isExpected);
  if (expectedSeen.length > 0) {
    result.notes.push(
      `Expected console errors from deliberate fixture failures: ${expectedSeen.join('; ')}`
    );
  }
  result.consoleWarnings = consoleMessages
    .filter(message => message.type === 'warning')
    .map(message => message.text);
  if (result.consoleErrors.length > 0) {
    result.errors.push(`console errors: ${result.consoleErrors.join('; ')}`);
  }

  if (live) {
    if (!proxyRunning) {
      result.errors.push(`SuiteReact proxy is not healthy at ${proxyUrl}`);
    }
    if (workflowState?.changeClass === 'server-action') {
      const directAction = workflowState.checks?.direct_action?.status;
      if (directAction !== 'passed') {
        result.errors.push(
          'local server code is not proven current: narrow deployment and direct action testing must pass before live UI testing'
        );
      }
    }
    if (actionResponses.length === 0) {
      result.errors.push(
        'live mode expected at least one /api/handle-action response'
      );
    }
    const failedResponses = actionResponses.filter(response => !response.ok);
    if (failedResponses.length > 0) {
      result.errors.push(
        `live mode saw failed /api/handle-action response(s): ${failedResponses
          .map(response => response.status)
          .join(', ')}`
      );
    }
  }

  await screenshot('final');
  result.passed = result.errors.length === 0;
} catch (error) {
  result.errors.push(error instanceof Error ? error.message : String(error));
  await screenshot('failure').catch(() => {});
} finally {
  await browser.close();
}

if (workflowDir && workflowState) {
  try {
    const checkName = live ? 'live_ui' : 'ui_smoke';
    workflowState.checks ||= {};
    workflowState.checks[checkName] = {
      status: result.passed ? 'passed' : 'failed',
      updatedAt: new Date().toISOString(),
      detail: `${result.mode}: ${result.snapshots.length} step(s), ${result.errors.length} error(s), ${relative(repoRoot, resultFile)}`,
    };
    workflowState.updatedAt = new Date().toISOString();
    await writeFile(
      join(workflowDir, 'workflow.json'),
      `${JSON.stringify(workflowState, null, 2)}\n`
    );
  } catch (error) {
    result.passed = false;
    result.errors.push(
      `Could not update workflow test evidence: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    { ...result, resultFile: relative(repoRoot, resultFile) },
    null,
    2
  )
);
process.exit(result.passed ? 0 : 1);
