// Intercepted browser test: SUITEREACT_VITE_URL=http://localhost:5292/ node apps/approval-manager/test/browser.mjs <evidence-dir>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

import {
  answerSuiteql,
  createData,
  failIds,
  stallsLikeNetSuite,
} from './fixtures.mjs';

const url = process.env.SUITEREACT_VITE_URL;
const evidence = process.argv[2];
if (!url || !evidence)
  throw new Error('Set SUITEREACT_VITE_URL and pass an evidence directory.');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const SELF_APPROVAL_DENIED =
  'You cannot approve a transaction you created or that is for you. Ask another approver.';

async function open({
  width = 1440,
  height = 900,
  failQueue,
  failAmounts,
  hangQueue,
  timeoutMs,
  timezoneId,
  journalCount,
  controls = {},
} = {}) {
  const page = await browser.newPage({
    viewport: { width, height },
    acceptDownloads: true,
    ...(timezoneId ? { timezoneId } : {}),
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const data = createData({ journalCount });
  const approved = new Set();
  const stalled = [];
  const queries = [];
  if (timeoutMs)
    await page.addInitScript(ms => {
      window.__approvalManagerQueryTimeoutMs = ms;
    }, timeoutMs);
  await page.route('**/api/handle-action', async route => {
    const { params, inputData } = route.request().postDataJSON();
    const action = params?.actionProps?.action;
    let body = {};
    if (action === 'getTableRowsFromSuiteql') {
      const isCount = /COUNT\(\*\)/i.test(inputData.query);
      if (
        stallsLikeNetSuite(inputData.query) ||
        (hangQueue && !isCount && inputData.query.includes(`'${hangQueue}'`))
      ) {
        stalled.push(inputData.query);
        return; // never answered, like the RESTlet that dies mid-query
      }
      if (
        controls.failLaterPage &&
        inputData.query.includes("'Journal'") &&
        /t\.id > \d+/.test(inputData.query)
      )
        body = { error: 'SSS_REQUEST_TIME_EXCEEDED: page two timed out' };
      else if (failAmounts && /GROUP BY tl\.transaction/i.test(inputData.query))
        body = { error: 'SSS_USAGE_LIMIT_EXCEEDED: usage limit exceeded' };
      else if (failQueue && inputData.query.includes(`'${failQueue}'`))
        body = { error: 'SSS_SEARCH_TIMEOUT: query exceeded the time limit' };
      else body = answerSuiteql(data, inputData.query, approved);
      queries.push(inputData.query);
      if (
        controls.holdRefresh &&
        inputData.query.includes("'Journal'") &&
        !/COUNT\(\*\)/i.test(inputData.query) &&
        !/GROUP BY/i.test(inputData.query)
      ) {
        // Stale read: the response is computed now and delivered later.
        controls.held = true;
        await controls.holdRefresh;
      }
      if (
        controls.delayAmounts &&
        /GROUP BY tl\.transaction/i.test(inputData.query)
      )
        await new Promise(resolve => setTimeout(resolve, 4000));
    } else if (action === 'resolveRecordUrls') {
      body = {
        templates: Object.fromEntries(
          inputData.recordTypes.map(t => [
            t,
            `https://example.invalid/app/accounting/transactions/${t}.nl?id=`,
          ])
        ),
      };
    } else if (action === 'approveTransaction') {
      if (failIds.has(inputData.id)) {
        // The dev proxy's shape for a RESTlet ACTION_DENIED response.
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              success: false,
              error: 'ACTION_DENIED',
              message: SELF_APPROVAL_DENIED,
            },
          }),
        });
        return;
      } else {
        approved.add(inputData.id);
        body = { success: true };
      }
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(url);
  return { page, errors, stalled, queries };
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.log(`✗ ${name}\n  ${error.message}`);
  }
}

const tab = (page, label) =>
  page.getByRole('tab', { name: new RegExp(`^${label}`) });

await check(
  'pending journals load rows without a correlated subquery and fill amounts from lines',
  async () => {
    const { page, errors, stalled } = await open();
    await page.getByText('42 journal entries pending').waitFor();
    await page
      .locator('.MuiDataGrid-row[data-id="9000"]')
      .getByText('USD 1,250.00')
      .waitFor();
    await page
      .getByText(/^USD\s[\d,.]+ · GBP\s[\d,.]+ · EUR\s[\d,.]+$/)
      .waitFor();
    assert.deepEqual(stalled, [], 'no query should stall');
    assert.deepEqual(errors, []);
    await page.close();
  }
);

await check(
  'a failed amount lookup keeps rows usable and the dialog says totals are incomplete',
  async () => {
    const { page } = await open({ failAmounts: true });
    await page.getByText('42 journal entries pending').waitFor();
    const row = page.locator('.MuiDataGrid-row[data-id="9000"]');
    await row.getByText('Unavailable').waitFor();
    await row.locator('input[type=checkbox]').check();
    await page.getByText('1 without amount').waitFor();
    await page.getByRole('button', { name: 'Approve 1 selected' }).click();
    await page
      .getByRole('dialog')
      .getByText(/Totals exclude 1 transaction whose amount/)
      .waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${evidence}/desktop-amount-unavailable.png`,
    });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.close();
  }
);

await check(
  'a stalled queue times out into a retryable error without blocking other queues',
  async () => {
    const { page } = await open({ hangQueue: 'Journal', timeoutMs: 1500 });
    await page
      .getByText("Couldn't load journal entries")
      .waitFor({ timeout: 10000 });
    await page.getByText(/didn't respond within 2 seconds/).waitFor();
    await page.getByRole('button', { name: 'Retry' }).waitFor();
    assert.match(await tab(page, 'Invoices').innerText(), /7/);
    await page.screenshot({ path: `${evidence}/desktop-timeout.png` });
    await page.close();
  }
);

await check(
  'queues load with live counts and journals hide the empty Name column',
  async () => {
    const { page, errors } = await open();
    await page.getByText('42 journal entries pending').waitFor();
    assert.match(await tab(page, 'Journal Entries').innerText(), /42/);
    await page.getByText(/^7$/).waitFor();
    assert.match(await tab(page, 'Purchase Orders').innerText(), /3/);
    assert.equal(
      await page.getByRole('columnheader', { name: 'Name' }).count(),
      0
    );
    await page.getByRole('columnheader', { name: 'Amount' }).waitFor();
    assert.equal(
      await page.getByText('JE-10420').count(),
      1,
      'transaction number shown'
    );
    await page.screenshot({ path: `${evidence}/desktop-initial.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
);

await check(
  'approval requires confirmation and keeps failures selected',
  async () => {
    const { page } = await open();
    await page.getByText('42 journal entries pending').waitFor();
    const boxes = page.locator('.MuiDataGrid-row input[type=checkbox]');
    for (const id of ['9000', '9001', '9003'])
      await page
        .locator(`.MuiDataGrid-row[data-id="${id}"] input[type=checkbox]`)
        .check();
    await page.getByText('3 selected').waitFor();
    await page.screenshot({ path: `${evidence}/desktop-selected.png` });
    await page.getByRole('button', { name: 'Approve 3 selected' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Approve 3 journal entries?').waitFor();
    await page.waitForFunction(
      () => document.activeElement?.textContent === 'Cancel',
      null,
      { timeout: 3000 }
    );
    await page.screenshot({ path: `${evidence}/desktop-confirm.png` });
    await dialog
      .getByRole('button', { name: 'Approve 3 journal entries' })
      .click();
    await dialog.getByText('2 approved, 1 failed').waitFor();
    await dialog.getByText(SELF_APPROVAL_DENIED, { exact: true }).waitFor();
    await page.screenshot({ path: `${evidence}/desktop-partial-failure.png` });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await page.getByText('1 selected').waitFor();
    assert.equal(
      await page
        .locator('.MuiDataGrid-row[data-id="9003"] input[type=checkbox]')
        .isChecked(),
      true
    );
    assert.match(await tab(page, 'Journal Entries').innerText(), /40/);
    await page.getByRole('button', { name: /Approved this session/ }).click();
    await page.getByText('Approved this session', { exact: true }).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.getByRole('listitem').count(), 2);
    await page.screenshot({ path: `${evidence}/desktop-session-log.png` });
    await page.getByRole('button', { name: 'Close approval log' }).click();
    await boxes.first().waitFor();
    await page.close();
  }
);

await check(
  'select all counts every row and cancel approves nothing',
  async () => {
    const { page } = await open();
    await page.getByText('42 journal entries pending').waitFor();
    await page.getByRole('checkbox', { name: /select all/i }).check();
    await page.getByText('42 selected').waitFor();
    await page.getByRole('button', { name: 'Approve 42 selected' }).click();
    await page.getByRole('dialog').getByText('and 36 more').waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByText('42 selected').waitFor();
    assert.match(await tab(page, 'Journal Entries').innerText(), /42/);
    await page.close();
  }
);

await check('empty queue explains itself', async () => {
  const { page } = await open();
  await tab(page, 'Expense Reports').click();
  await page.getByText('No expense reports waiting for approval').waitFor();
  await page.screenshot({ path: `${evidence}/desktop-empty.png` });
  await page.close();
});

await check(
  'a failed queue shows the error with retry and does not affect other queues',
  async () => {
    const { page } = await open({ failQueue: 'Purchase Order' });
    await page.getByText('42 journal entries pending').waitFor();
    await tab(page, 'Purchase Orders').click();
    await page.getByText("Couldn't load purchase orders").waitFor();
    await page.getByText(/SSS_SEARCH_TIMEOUT/).waitFor();
    await page.getByRole('button', { name: 'Retry' }).waitFor();
    await page.screenshot({ path: `${evidence}/desktop-error.png` });
    await page.close();
  }
);

await check(
  'mobile layout keeps the queue usable without page overflow',
  async () => {
    const { page, errors } = await open({ width: 390, height: 844 });
    await page.getByText('42 journal entries pending').waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${evidence}/mobile-initial.png` });
    await page
      .locator('.MuiDataGrid-row[data-id="9000"] input[type=checkbox]')
      .check();
    await page.getByRole('button', { name: 'Approve 1 selected' }).click();
    await page
      .getByRole('dialog')
      .getByText('Approve 1 journal entry?')
      .waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${evidence}/mobile-confirm.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
);

await check(
  'a failed later page on first load leaves no partial rows to approve',
  async () => {
    const { page } = await open({
      journalCount: 5005,
      controls: { failLaterPage: true },
    });
    await page.getByText("Couldn't load journal entries").waitFor();
    await page.getByText(/page two timed out/).waitFor();
    assert.equal(await page.locator('.MuiDataGrid-row').count(), 0);
    await page.close();
  }
);

await check(
  'a failed refresh restores the last complete queue instead of partial pages',
  async () => {
    const controls = {};
    const { page } = await open({ journalCount: 5005, controls });
    await page
      .getByText('5,005 journal entries pending')
      .waitFor({ timeout: 20000 });
    controls.failLaterPage = true;
    await page.getByRole('button', { name: 'Refresh journal entries' }).click();
    await page.getByText(/Refresh failed: .*page two timed out/).waitFor();
    await page.getByText('5,005 journal entries pending').waitFor();
    await page.close();
  }
);

await check(
  'ISO date-only values keep their calendar day west of UTC',
  async () => {
    const { page } = await open({ timezoneId: 'America/Los_Angeles' });
    await page.getByText('42 journal entries pending').waitFor();
    await tab(page, 'Invoices').click();
    await page
      .locator('.MuiDataGrid-row[data-id="12000"]')
      .getByText('Sep 10, 2026')
      .waitFor();
    await page.close();
  }
);

await check('CSV export keeps each amount with its currency', async () => {
  const { page } = await open();
  await page
    .getByText(/^USD\s[\d,.]+ · GBP\s[\d,.]+ · EUR\s[\d,.]+$/)
    .waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export visible rows (CSV)' }).click(),
  ]);
  const csv = await readFile(await download.path(), 'utf8');
  const [header, ...lines] = csv
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  assert.match(header, /Amount.*Currency|Currency.*Amount/);
  assert.ok(
    lines.some(line => line.includes('JE-10420') && /USD/.test(line)),
    'USD row'
  );
  assert.ok(
    lines.some(line => line.includes('JE-10422') && /GBP/.test(line)),
    'GBP row'
  );
  await page.close();
});

await check(
  'the queue query normalizes trandate and invalid calendar dates are shown verbatim',
  async () => {
    const { page, queries } = await open({ timezoneId: 'America/Los_Angeles' });
    await page.getByText('42 journal entries pending').waitFor();
    assert.ok(
      queries.some(query =>
        query.includes("TO_CHAR(t.trandate, 'YYYY-MM-DD') AS trandate")
      ),
      'row query returns ISO trandate'
    );
    await tab(page, 'Invoices').click();
    const row = page.locator('.MuiDataGrid-row[data-id="12001"]');
    await row.getByText('23/09/2026').waitFor();
    assert.equal(await row.getByText(/2027/).count(), 0, 'no fabricated date');
    await page.close();
  }
);

await check(
  'two consecutive failed refreshes keep the last complete queue',
  async () => {
    const controls = {};
    const { page } = await open({ journalCount: 5005, controls });
    await page
      .getByText('5,005 journal entries pending')
      .waitFor({ timeout: 20000 });
    controls.failLaterPage = true;
    await page.getByRole('button', { name: 'Refresh journal entries' }).click();
    await page.getByText(/Refresh failed/).waitFor();
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.getByText(/Refresh failed/).waitFor();
    await page.waitForTimeout(500);
    await page.getByText('5,005 journal entries pending').waitFor();
    await page.close();
  }
);

await check(
  'a failed refresh restarts amount lookups it interrupted',
  async () => {
    const controls = { delayAmounts: true };
    const { page } = await open({ journalCount: 5005, controls });
    await page
      .getByText('5,005 journal entries pending')
      .waitFor({ timeout: 20000 });
    await page.getByText(/without amount/).waitFor();
    controls.failLaterPage = true;
    controls.delayAmounts = false;
    await page.getByRole('button', { name: 'Refresh journal entries' }).click();
    await page.getByText(/Refresh failed/).waitFor();
    await page
      .getByText(/^USD\s[\d,.]+ · GBP\s[\d,.]+ · EUR\s[\d,.]+$/)
      .waitFor({ timeout: 20000 });
    assert.equal(await page.getByText(/without amount/).count(), 0);
    await page.close();
  }
);

await check('CSV export follows the search, not the selection', async () => {
  const { page } = await open();
  await page.getByText('42 journal entries pending').waitFor();
  await page.getByLabel('Search this queue').fill('Reclass');
  await page.getByText(/1–9 of 9/).waitFor();
  // Select a row that matches the search: the grid's default would export only it.
  await page.locator('.MuiDataGrid-row input[type=checkbox]').first().check();
  await page.getByText('1 selected').waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export visible rows (CSV)' }).click(),
  ]);
  const csv = await readFile(await download.path(), 'utf8');
  const lines = csv
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .slice(1);
  assert.equal(lines.length, 9, `exported ${lines.length} rows`);
  assert.ok(lines.every(line => line.includes('Reclass')));
  await page.close();
});

await check('search matches columns hidden by layout', async () => {
  const { page } = await open();
  await page.getByText('42 journal entries pending').waitFor();
  await page.getByLabel('Search this queue').fill('GBP');
  await page.getByText(/1–10 of 10/).waitFor();
  await page.close();
  const mobile = await open({ width: 390, height: 844 });
  await mobile.page.getByText('42 journal entries pending').waitFor();
  await mobile.page.getByLabel('Search this queue').fill('Vendor credit');
  await mobile.page.getByText(/1–8 of 8/).waitFor();
  await mobile.page.close();
});

await check(
  'a refresh read before an approval never reinserts the approved row',
  async () => {
    const controls = {};
    const { page } = await open({ controls });
    await page.getByText('42 journal entries pending').waitFor();
    controls.holdRefresh = new Promise(resolve => (controls.release = resolve));
    await page.getByRole('button', { name: 'Refresh journal entries' }).click();
    for (let i = 0; i < 50 && !controls.held; i++)
      await page.waitForTimeout(100);
    assert.ok(controls.held, 'refresh response captured');
    await page
      .locator('.MuiDataGrid-row[data-id="9000"] input[type=checkbox]')
      .check();
    await page.getByRole('button', { name: 'Approve 1 selected' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Approve 1 journal entry' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Done' })
      .click();
    await page
      .locator('.MuiDataGrid-row[data-id="9000"]')
      .waitFor({ state: 'detached' });
    controls.holdRefresh = null;
    controls.release();
    await page.getByText('41 journal entries pending').waitFor();
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator('.MuiDataGrid-row[data-id="9000"]').count(),
      0
    );
    assert.match(await tab(page, 'Journal Entries').innerText(), /41/);
    await page.close();
  }
);

await browser.close();
const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
