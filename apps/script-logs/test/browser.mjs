import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadModule } from '../../../deploy/tests/helpers/load-suitescript.mjs';
import smoke from './smoke.mjs';
import enhancements from './enhancements.mjs';

// Intercept before navigation: the production app now immediately requests live logs.
const evidence = process.argv[2];
const url = process.env.SUITEREACT_VITE_URL;
if (!url || !evidence)
  throw new Error('Run through dev:test with an evidence directory.');
const options = loadModule('apps/script-logs/test/fixtures/options.ts');
const logs = loadModule('apps/script-logs/test/fixtures/logs.ts', {
  './options': options,
});
const fixtures = { ...logs, failure: null };
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
// Far from any plausible account zone, so browser-local date math is visible.
const page = await browser.newPage({ timezoneId: 'Pacific/Kiritimati' });
const report = {
  passed: false,
  schemaVersion: 1,
  appName: 'script-logs',
  capturedAt: new Date().toISOString(),
  mode: 'ui-smoke',
  viteUrl: url,
  proxyRunning: false,
  dataLoaded: false,
  consoleWarnings: [],
  pageErrors: [],
  snapshots: [],
  metrics: {},
  notes: [
    'All API responses intercepted before navigation; no live or authorization claim.',
  ],
  checks: [],
  screenshots: [],
  actionResponses: [],
  errors: [],
  consoleErrors: [],
};
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') report.consoleErrors.push(message.text());
});
await page.route('**/api/handle-action', async route => {
  const { params, inputData: input } = route.request().postDataJSON();
  const action = params?.actionProps?.action;
  let data;
  let status = 200;
  if (action === 'listScriptLogTable') {
    await new Promise(resolve => setTimeout(resolve, 180));
    if (fixtures.failure) {
      status = fixtures.failure === 'permission' ? 403 : 500;
      data = {
        error:
          fixtures.failure === 'permission'
            ? 'SCRIPT_LOG_PERMISSION_DENIED'
            : 'SCRIPT_LOG_QUERY_ERROR',
      };
    } else if (fixtures.tableLimit != null) {
      // Simulates logs expiring: only the first tableLimit results remain.
      const all = logs.listDemoLogTable({ ...input, page: 0, pageSize: 1e6 });
      const kept = all.rows.slice(0, fixtures.tableLimit);
      const start = input.page * input.pageSize;
      data = {
        ...all,
        rows: kept.slice(start, start + input.pageSize),
        total: kept.length,
        hasMore: start + input.pageSize < kept.length,
      };
    } else data = logs.listDemoLogTable(input);
  } else if (action === 'getScriptLogDetail') {
    if (fixtures.detailFailure) {
      status = 403;
      data = { error: 'SCRIPT_LOG_PERMISSION_DENIED' };
    } else data = logs.getDemoDetail(input.id);
  } else if (
    action === 'searchScriptLogScripts' ||
    action === 'searchScriptLogDeployments'
  ) {
    const candidates =
      action === 'searchScriptLogScripts'
        ? options.demoScripts
        : options.demoDeployments;
    data = {
      options: candidates
        .filter(
          item =>
            (!input.script || item.script === input.script) &&
            `${item.value} ${item.label} ${item.scriptId}`
              .toLowerCase()
              .includes(input.search.toLowerCase())
        )
        .map(item => {
          const parent = options.demoScripts.find(
            parent => parent.value === item.script
          );
          return {
            ...item,
            scriptLabel: parent?.label,
            parentScriptId: parent?.scriptId,
          };
        }),
      hasMore: false,
    };
  } else {
    report.errors.push(`Unexpected action ${action}`);
    status = 500;
    data = {};
  }
  report.actionResponses.push({
    action,
    status,
    url: route.request().url(),
    ok: status === 200,
    capturedAt: new Date().toISOString(),
  });
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
});
await page.route('**/*.netsuite.com/**', route => {
  report.errors.push('Unexpected account request blocked');
  return route.abort();
});
const screenshot = async label => {
  const file = path.join(evidence, label + '.png');
  // Layout captures exclude transient toasts; clipboard contents are asserted separately.
  await page.screenshot({
    path: file,
    fullPage: true,
    animations: 'disabled',
    style: '.MuiSnackbar-root { visibility: hidden !important; }',
  });
  report.screenshots.push(file);
};
const step = async (label, run) => {
  const start = performance.now();
  await run();
  report.snapshots.push({
    label,
    passed: true,
    durationMs: Math.round(performance.now() - start),
  });
  console.log('PASS ' + label);
};
try {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const banner = document.createElement('div');
      banner.textContent =
        'TEST FIXTURES · INTERCEPTED RESPONSES · NO ACCOUNT DATA';
      Object.assign(banner.style, {
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: '9999',
        background: '#172135',
        color: 'white',
        fontSize: '10px',
        padding: '3px',
        textAlign: 'center',
        pointerEvents: 'none',
      });
      document.body.append(banner);
    });
  });
  await page.goto(url);
  await smoke({
    page,
    step,
    screenshot,
    live: false,
    actionResponses: report.actionResponses,
    fixtures,
  });
  await enhancements({
    page,
    step,
    screenshot,
    fixtures,
    actionResponses: report.actionResponses,
  });
  const unexpected = report.consoleErrors.filter(
    message =>
      !/^Failed to load resource: the server responded with a status of (403|500) \(/.test(
        message
      )
  );
  assert.deepEqual(unexpected, []);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.pageErrors, []);
  report.expectedHttpErrors = report.consoleErrors;
  report.consoleErrors = unexpected;
  report.passed = true;
} catch (error) {
  report.errors.push(error.message);
  console.error(error.message);
  await screenshot('intercepted-failure');
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    path.join(evidence, 'test-results.json'),
    JSON.stringify(report, null, 2)
  );
}
