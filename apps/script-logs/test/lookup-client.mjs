import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Browser-only evidence: every API response below is intercepted synthetic data.
const url = process.env.SUITEREACT_VITE_URL || process.argv[2];
const evidence = process.argv[3];
if (!url || !evidence)
  throw new Error('Usage: lookup-client.mjs <vite-url> <evidence-dir>');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = {
  synthetic: true,
  passed: false,
  checks: [],
  errors: [],
  lookupRequests: [],
  maxConcurrent: 0,
};
const requests = [];
const consoleErrors = [];
let inFlight = 0;
let releaseSlow;
let recovered = false;
const option = {
  value: '700',
  label: 'Demo invoice processor',
  scriptId: 'customscript_demo_invoice_processor',
};
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
await page.route('**/api/handle-action', async route => {
  const body = route.request().postDataJSON();
  const action = body.params?.actionProps?.action;
  const input = body.inputData;
  requests.push({ action, input });
  const respond = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  if (action === 'listScriptLogTable')
    return respond({
      rows: [],
      total: 0,
      hasMore: false,
      capped: false,
      anchor: null,
    });
  if (action === 'searchScriptLogDeployments')
    return respond({
      options: [
        {
          value: '800',
          label: 'Demo invoice deployment',
          scriptId: 'customdeploy_demo_invoice',
          script: '700',
          scriptLabel: option.label,
          parentScriptId: option.scriptId,
        },
      ],
      hasMore: false,
    });
  if (action !== 'searchScriptLogScripts') {
    report.errors.push(`Unexpected action: ${action}`);
    return respond({}, 500);
  }
  inFlight += 1;
  report.maxConcurrent = Math.max(report.maxConcurrent, inFlight);
  report.lookupRequests.push(input.search);
  if (input.search === 'slow')
    await new Promise(resolve => {
      releaseSlow = resolve;
    });
  inFlight -= 1;
  if (input.search === 'denied' && !recovered)
    return respond({ error: 'SCRIPT_LOG_PERMISSION_DENIED' }, 403);
  if (input.search === 'broken')
    return respond({ error: 'SCRIPT_LOG_QUERY_ERROR' }, 500);
  if (input.search === 'missing')
    return respond({ options: [], hasMore: false });
  if (input.search === 'broad')
    return respond({
      options: Array.from({ length: 20 }, (_, i) => ({
        ...option,
        value: String(700 + i),
        label: `Demo script ${i}`,
      })),
      hasMore: true,
    });
  return respond({
    options: [
      {
        ...option,
        label: input.search === 'slow' ? 'Obsolete response' : option.label,
      },
    ],
    hasMore: false,
  });
});

try {
  await page.goto(url);
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.textContent =
      'INTERCEPTED TEST RESPONSES · SYNTHETIC DATA · NO ACCOUNT CALLS';
    Object.assign(banner.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      zIndex: '9999',
      background: '#172135',
      color: 'white',
      padding: '12px',
      textAlign: 'center',
    });
    document.body.append(banner);
  });
  const script = page.getByRole('combobox', { name: 'Script', exact: true });
  const deployment = page.getByRole('combobox', {
    name: 'Deployment',
    exact: true,
  });
  const waitForTerm = term =>
    page.waitForResponse(
      response =>
        response.url().includes('/api/handle-action') &&
        response.request().postDataJSON()?.inputData?.search === term
    );
  assert.ok(await deployment.isEnabled());
  await script.fill('i');
  await page.waitForTimeout(400);
  assert.equal(report.lookupRequests.length, 0);
  await script.fill('in');
  await page.waitForTimeout(100);
  const first = waitForTerm('inv');
  await script.fill('inv');
  await first;
  await page.getByRole('option').waitFor();
  assert.deepEqual(report.lookupRequests, ['inv']);
  report.checks.push('minimum length and debounce');

  await script.fill('slow');
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Looking up scripts"]')
  );
  const slowIssued = Date.now();
  while (!releaseSlow && Date.now() - slowIssued < 3000)
    await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(releaseSlow);
  await script.fill('fresh');
  await page.waitForTimeout(400);
  assert.equal(report.lookupRequests.at(-1), 'slow');
  const fresh = waitForTerm('fresh');
  releaseSlow();
  await fresh;
  await page.getByRole('option').filter({ hasText: option.label }).waitFor();
  assert.equal(
    await page.getByText('Obsolete response', { exact: true }).count(),
    0
  );
  assert.equal(report.maxConcurrent, 1);
  report.checks.push('one active lookup, obsolete responses ignored');

  await script.press('ArrowDown');
  await script.press('Enter');
  await page.getByRole('button', { name: 'Search logs', exact: true }).click();
  await page.getByText(/Showing:.*Demo invoice processor/).waitFor();
  assert.equal(
    requests.filter(request => request.action === 'listScriptLogTable').at(-1)
      .input.script,
    '700'
  );
  assert.equal(await script.inputValue(), option.label);
  report.checks.push(
    'selected internal ID submitted; name retained in visible lookup'
  );

  await deployment.fill('invoice');
  await page
    .getByRole('option')
    .filter({ hasText: 'Demo invoice deployment' })
    .click();
  await page.getByRole('button', { name: 'Search logs', exact: true }).click();
  await page.getByText(/Showing:.*Demo invoice deployment/).waitFor();
  assert.equal(
    requests
      .filter(request => request.action === 'searchScriptLogDeployments')
      .at(-1).input.script,
    '700'
  );
  assert.equal(
    requests.filter(request => request.action === 'listScriptLogTable').at(-1)
      .input.deployment,
    '800'
  );
  assert.equal(
    requests.filter(request => request.action === 'listScriptLogTable').at(-1)
      .input.script,
    '700'
  );
  report.checks.push(
    'live-mode deployment lookup scopes to parent and submits actual deployment ID'
  );

  await script.focus();
  await page.getByRole('button', { name: 'Clear script', exact: true }).click();
  await script.fill('broad');
  await page
    .getByText('Showing the first 20 matches. Keep typing to narrow the list.')
    .waitFor();
  assert.equal(await page.getByRole('option').count(), 20);
  await page.screenshot({
    path: path.join(evidence, 'intercepted-lookup-bounded.png'),
  });
  await script.fill('missing');
  await page.getByText('No matches', { exact: true }).waitFor();
  assert.equal(await page.getByRole('option').count(), 0);
  report.checks.push('bounded matches and empty state');

  await script.fill('denied');
  await page.getByText(/Script lookup denied/).waitFor();
  assert.equal(await page.getByRole('option').count(), 0);
  recovered = true;
  await page
    .getByRole('button', { name: 'Retry script lookup', exact: true })
    .click();
  await page.getByRole('option').filter({ hasText: option.label }).waitFor();
  await script.fill('broken');
  await page.getByText(/Script lookup failed/).waitFor();
  assert.equal(await page.getByRole('option').count(), 0);
  await page.screenshot({
    path: path.join(evidence, 'intercepted-lookup-error.png'),
  });
  assert.equal(
    await page.getByRole('button', { name: 'Synthetic demo' }).count(),
    0
  );
  assert.equal(await page.getByRole('option').count(), 0);
  report.checks.push(
    'permission denial, retry, query error without fixture fallback'
  );
  const unexpected = consoleErrors.filter(
    message =>
      !/^Failed to load resource: the server responded with a status of (403|500) \(/.test(
        message
      )
  );
  assert.deepEqual(unexpected, []);
  assert.equal(consoleErrors.length, 2);
  assert.deepEqual(report.errors, []);
  report.expectedHttpErrors = [403, 500];
  report.passed = true;
} catch (error) {
  report.errors.push(error.message);
  await page.screenshot({
    path: path.join(evidence, 'intercepted-failure.png'),
  });
  process.exitCode = 1;
} finally {
  releaseSlow?.();
  await browser.close();
  await writeFile(
    path.join(evidence, 'lookup-client.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
}
