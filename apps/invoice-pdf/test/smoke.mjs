import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { BlobReader, ZipReader } = await import(
  require.resolve('@zip.js/zip.js')
);

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'
).toString('base64');
const CURRENCIES = ['USD', 'AUD', 'CAD', 'EUR', 'INR'];
const CUSTOMERS = [
  'Northwind Analytics, Inc. (sample)',
  'Acme Robotics (sample)',
  'Globex Corporation International Holdings (sample)',
  'Initech (sample)',
  'Umbrella Supply Co. (sample)',
];
const INVOICES = Array.from({ length: 137 }, (_, i) => ({
  id: 900000 + i,
  tranid:
    i === 3
      ? 'INV/2026/0003'
      : i === 7
        ? 'INV-1006'
        : i === 8
          ? 'INV-1006 (2)'
          : `INV-${1000 + i}`,
  trandate:
    i === 1 ? '23/09/2026' : `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
  customer: CUSTOMERS[i % CUSTOMERS.length],
  status: ['Open', 'Paid In Full', 'Pending Approval'][i % 3],
  amount: i % 11 === 0 ? -125.5 : Math.round((1000 + i * 137.31) * 100) / 100,
  currency: CURRENCIES[i % CURRENCIES.length],
  duedate:
    i === 1 ? '2026-02-30' : `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
  memo: `Sample memo ${i}`,
}));

async function zipEntries(download) {
  const bytes = await readFile(await download.path());
  const reader = new ZipReader(new BlobReader(new Blob([bytes])));
  const names = (await reader.getEntries()).map(entry => entry.filename);
  await reader.close();
  return names;
}

async function runFixtureSmoke({ page, step, screenshot }) {
  const state = {
    generate: [],
    queries: [],
    failIds: new Set(),
    inFlight: 0,
    peak: 0,
    busyOnce: new Set(),
  };
  let failSearch = false;
  await page.route('**/api/handle-action', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
        },
      });
      return;
    }
    const body = route.request().postDataJSON();
    const action = body.params.actionProps.action;
    const input = body.inputData;
    let data;
    if (action === 'getTableRowsFromSuiteql') {
      state.queries.push(input.query);
      const tranFilter = /UPPER\(t\.tranid\) LIKE UPPER\('%(.*?)%'\)/.exec(
        input.query
      )?.[1];
      const matching = tranFilter
        ? INVOICES.filter(inv => inv.tranid.includes(tranFilter))
        : INVOICES;
      if (failSearch)
        data = { error: 'Search timed out (sample)', success: false };
      else if (/COUNT\(/.test(input.query))
        data = {
          headers: [{ id: 'cnt', label: 'Cnt' }],
          rows: [{ cnt: tranFilter ? matching.length : 9137 }],
        };
      else
        data = {
          // The live action capitalizes labels; the UI must not depend on them.
          headers: Object.keys(INVOICES[0]).map(id => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
          })),
          rows: matching,
        };
    } else if (action === 'generateInvoicePdfs') {
      state.generate.push(input.invoices);
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      await new Promise(resolve => setTimeout(resolve, 250));
      state.inFlight -= 1;
      const busy = input.invoices.find(inv => state.busyOnce.has(inv.id));
      if (busy) {
        state.busyOnce.delete(busy.id);
        await route.fulfill({
          status: 429,
          json: { error: 'SSS_REQUEST_LIMIT_EXCEEDED (sample)' },
          headers: { 'access-control-allow-origin': '*' },
        });
        return;
      }
      const pdfs = input.invoices.map(inv =>
        state.failIds.has(inv.id)
          ? { ...inv, base64: '', error: 'Template not found (sample)' }
          : { ...inv, base64: PDF }
      );
      data = {
        pdfs,
        successCount: pdfs.filter(p => p.base64).length,
        errorCount: pdfs.filter(p => !p.base64).length,
      };
    } else throw new Error(`Unexpected action: ${action}`);
    await route.fulfill({
      json: data,
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  const download = page.getByRole('button', { name: /^Download PDFs/ });
  const status = page.locator('.MuiDataGrid-toolbar [role=status]');
  const row = tranId =>
    page.locator('.MuiDataGrid-row').filter({
      has: page.locator('[data-field="tranid"]', { hasText: tranId }),
    });
  const check = async tranIds => {
    for (const tranId of tranIds)
      for (const r of await row(tranId).all())
        await r.locator('input[type=checkbox]').check();
  };
  let sent = [];
  const downloadZip = async () => {
    const mark = state.generate.length;
    state.peak = 0;
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      download.click(),
    ]);
    sent = state.generate.slice(mark).flat();
    return file;
  };

  await step('Enter searches; readable columns and currency', async () => {
    await page
      .getByRole('textbox', { name: 'Customer', exact: true })
      .press('Enter');
    await page.locator('.MuiDataGrid-row').first().waitFor();
    assert.match(state.queries[0], /BUILTIN\.DF\(t\.currency\) AS currency/);
    assert.match(
      state.queries[0],
      /TO_CHAR\(t\.trandate, 'YYYY-MM-DD'\) AS trandate/
    );
    assert.match(
      state.queries[0],
      /TO_CHAR\(t\.duedate, 'YYYY-MM-DD'\) AS duedate/
    );
    // Unnormalized or impossible dates stay as text instead of shifting.
    assert.equal(
      await row('INV-1001').locator('[data-field="trandate"]').innerText(),
      '23/09/2026'
    );
    assert.equal(
      await row('INV-1001').locator('[data-field="duedate"]').innerText(),
      '2026-02-30'
    );
    assert.equal(
      await row('INV-1002').locator('[data-field="trandate"]').innerText(),
      new Date(2026, 8, 3).toLocaleDateString()
    );
    assert.deepEqual(
      await page.locator('.MuiDataGrid-columnHeaderTitle').allInnerTexts(),
      [
        'Invoice #',
        'Date',
        'Customer',
        'Status',
        'Amount',
        'Currency',
        'Due date',
        'Memo',
      ]
    );
    assert.match(
      await row('INV-1001').locator('[data-field="amount"]').innerText(),
      /^AUD\s1,137\.31$/
    );
    const capped = page
      .getByRole('alert')
      .filter({ hasText: 'Showing the newest 137 of 9,137 invoices' });
    await capped.waitFor();
    assert.match(await capped.innerText(), /include only the invoices shown/);
    await screenshot('results');
  });

  await step('select all over the batch limit explains itself', async () => {
    await page
      .getByRole('checkbox', { name: /select all/i })
      .first()
      .check();
    await status.getByText('137 selected').waitFor();
    assert.match(await status.innerText(), /Select at most 50 per download/);
    assert(await download.isDisabled());
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await status.getByText('137 invoices · newest first').waitFor();
  });

  await step(
    'filtered select all minus one downloads exactly the checked invoices',
    async () => {
      await page.getByLabel('Search results').fill('Initech');
      await row('INV-1001').waitFor({ state: 'detached' });
      await page
        .getByRole('checkbox', { name: /select all/i })
        .first()
        .check();
      await row('INV/2026/0003').locator('input[type=checkbox]').uncheck();
      await status.getByText('26 selected').waitFor();
      const progress = page
        .getByRole('dialog')
        .getByText('NetSuite has rendered 15 of 26 invoices.', {
          exact: false,
        })
        .waitFor();
      const file = await downloadZip();
      await progress;
      const sizes = state.generate.slice(-6).map(batch => batch.length);
      assert.deepEqual(sizes.sort(), [1, 5, 5, 5, 5, 5]);
      assert.equal(state.peak, 3, 'three requests run at once');
      const expected = INVOICES.filter(
        inv => inv.customer.startsWith('Initech') && inv.id !== 900003
      ).map(inv => inv.id);
      assert.deepEqual(sent.map(inv => inv.id).sort(), expected.sort());
      assert.equal((await zipEntries(file)).length, 26);
      await page
        .getByRole('alert')
        .filter({ hasText: /Downloaded 26 PDFs in invoices-.*\.zip/ })
        .waitFor();
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await page.getByLabel('Search results').fill('');
      await row('INV-1001').waitFor();
    }
  );

  await step(
    'partial failures are listed, retryable, and ZIP names are safe',
    async () => {
      state.failIds = new Set([900004]);
      await check(['INV-1004', 'INV-1006', 'INV/2026/0003']);
      await status.getByText('5 selected').waitFor();
      const file = await downloadZip();
      const names = await zipEntries(file);
      assert.equal(names.length, 4);
      assert.equal(new Set(names.map(n => n.toLowerCase())).size, 4);
      assert(names.includes('INV-2026-0003.pdf'));
      assert(names.includes('INV-1006.pdf'));
      const partial = page
        .getByRole('alert')
        .filter({ hasText: '1 invoice failed' });
      await partial.waitFor();
      assert.match(await partial.innerText(), /Downloaded 4 PDFs of 5/);
      assert.match(await partial.innerText(), /INV-1004 — Template not found/);
      await screenshot('partial-failure');
      state.failIds = new Set();
      await partial.getByRole('button', { name: 'Retry failed (1)' }).click();
      await page
        .getByRole('alert')
        .filter({ hasText: /Downloaded 1 PDF in/ })
        .waitFor();
      assert.deepEqual(
        state.generate.at(-1).map(inv => inv.tranId),
        ['INV-1004']
      );
    }
  );

  await step('a busy NetSuite response is retried, not failed', async () => {
    state.busyOnce = new Set([900010]);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await check(['INV-1010', 'INV-1011']);
    await status.getByText('2 selected').waitFor();
    const mark = state.generate.length;
    const file = await downloadZip();
    assert.equal((await zipEntries(file)).length, 2);
    assert.equal(state.generate.length - mark, 2, 'one rejected, one retried');
    await page
      .getByRole('alert')
      .filter({ hasText: /Downloaded 2 PDFs in/ })
      .waitFor();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
  });

  await step(
    'select all minus one on a small result excludes the unchecked invoice',
    async () => {
      await page.getByRole('textbox', { name: 'Invoice #' }).fill('INV-100');
      await page.getByRole('button', { name: 'Search invoices' }).click();
      await row('INV-1050').waitFor({ state: 'detached' });
      await status.getByText('9 invoices · newest first').waitFor();
      await page
        .getByRole('checkbox', { name: /select all/i })
        .first()
        .check();
      await row('INV-1001').locator('input[type=checkbox]').uncheck();
      await status.getByText('8 selected').waitFor();
      await downloadZip();
      assert.deepEqual(
        sent.map(inv => inv.tranId).sort(),
        INVOICES.filter(
          inv => inv.tranid.includes('INV-100') && inv.tranid !== 'INV-1001'
        )
          .map(inv => inv.tranid)
          .sort()
      );
      await page.getByRole('textbox', { name: 'Invoice #' }).fill('');
    }
  );

  await step('a failed search stays on screen with Retry', async () => {
    const capped = page
      .getByRole('alert')
      .filter({ hasText: 'Showing the newest 137 of 9,137 invoices' });
    await page.getByRole('button', { name: 'Search invoices' }).click();
    await capped.waitFor();
    failSearch = true;
    await page.getByRole('button', { name: 'Search invoices' }).click();
    const failure = page
      .getByRole('alert')
      .filter({ hasText: "Couldn't search invoices" });
    await failure.waitFor();
    assert.match(
      await failure.innerText(),
      /results below are from the previous search/
    );
    assert(await capped.isVisible(), 'capped warning survives a failed search');
    failSearch = false;
    await failure.getByRole('button', { name: 'Retry' }).click();
    await failure.waitFor({ state: 'hidden' });
    await page.locator('.MuiDataGrid-row').first().waitFor();
  });

  return {
    dataLoaded: true,
    metrics: { fixtureInvoices: INVOICES.length },
    // The busy-NetSuite step answers one request with HTTP 429 on purpose.
    expectedConsoleErrors: [/status of 429 \(Too Many Requests\)/],
    notes: [
      'Fixture-based browser test; NetSuite server actions were not deployed or invoked.',
    ],
  };
}

export async function runSmoke({ page, live, step, screenshot }) {
  await step('critical controls', async () => {
    await page
      .getByRole('heading', { name: 'Invoice PDF Generator' })
      .waitFor();
    await page.getByLabel('Date from').waitFor();
    await page.getByLabel('Date to').waitFor();
    await page
      .getByRole('textbox', { name: 'Customer', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Search invoices' }).waitFor();
  });

  if (!live) return runFixtureSmoke({ page, step, screenshot });

  const searchStarted = performance.now();
  await step('search invoices', async () => {
    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/handle-action') && response.ok(),
      { timeout: 60_000 }
    );
    await page.getByRole('button', { name: 'Search invoices' }).click();
    await responsePromise;
    await page.locator('.MuiDataGrid-row').first().waitFor({ timeout: 60_000 });
  });
  const searchMs = Math.round(performance.now() - searchStarted);
  await screenshot('invoices-loaded');

  const zipStarted = performance.now();
  await step('generate one PDF ZIP', async () => {
    await page
      .locator('.MuiDataGrid-row input[type="checkbox"]')
      .first()
      .check();
    const generate = page.getByRole('button', { name: /Download PDFs \(1\)/ });
    await generate.waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await generate.click();
    const file = await downloadPromise;
    if (!file.suggestedFilename().endsWith('.zip')) {
      throw new Error(
        `Expected ZIP download, received ${file.suggestedFilename()}`
      );
    }
    assert.equal((await zipEntries(file)).length, 1);
  });
  const pdfZipMs = Math.round(performance.now() - zipStarted);

  return {
    dataLoaded: true,
    metrics: { searchMs, pdfZipMs, pdfCount: 1 },
  };
}
