import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './load-ts.mjs';
import { runGroupedSortingSmoke } from './grouped-sorting-smoke.mjs';

export async function runSmoke({ page, live, step, screenshot }) {
  if (live)
    throw new Error(
      'This regression spec uses fixtures. Validate deployed actions separately before adding a live spec.'
    );

  const schema = loadTs('sdf/actions/getRecordFieldSchema.ts', {
    'N/log': { debug() {} },
    'N/record': {
      create: () => ({
        getFields: () => ['memo'],
        getField: () => ({ label: 'Memo', type: 'text' }),
      }),
    },
    'N/query': {
      runSuiteQL: () => ({
        asMappedResults: () => [
          {
            scriptid: 'CUSTCOL_DEMO',
            name: 'Demo Reference',
            fieldvaluetype: 'Free-Form Text',
          },
        ],
      }),
    },
  }).getRecordFieldSchema;
  const queries = [];
  let permissionWarning = true;
  let failLines = false;
  let delayLines;
  let failFirstLinePage = false;
  let failNextLinePage = false;
  let holdNextLinePage;
  let holdFirstLinePage;
  const dismissToasts = async () => {
    await page.mouse.move(0, 0);
    const closes = page
      .locator('.MuiSnackbar-root')
      .getByRole('button', { name: 'Close', exact: true });
    for (let i = 0; i < 8 && (await closes.count()); i++)
      await closes.last().click();
  };
  const downloadCsv = async button => {
    await dismissToasts();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click(),
    ]);
    return readFile(await download.path(), 'utf8');
  };
  const table = rows => ({
    headers: Object.keys(rows[0] || {}).map(id => ({ id, label: id })),
    rows,
  });
  const line = lineId => ({
    id: 100,
    line_id: lineId,
    tranid: 'DEMO-100',
    type: 'Journal',
    recordtype: 'journalentry',
    foreigntotal: 900,
    memo: 'Header memo',
    line_memo: `Line ${lineId}`,
    line_custcol_demo: null,
  });

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
    if (action === 'getRecordFieldSchema') {
      data = schema(input);
      if (permissionWarning && input.recordType === 'transaction') {
        data.warnings = [
          'Custom transaction line fields could not be loaded. Standard line fields are available.',
        ];
      }
    } else if (action === 'resolveRecordUrls') {
      data = {
        templates: {
          journalentry: 'https://example.invalid/transaction.nl?id=',
        },
      };
    } else if (action === 'getTableRowsFromSuiteql') {
      const sql = input.query;
      queries.push(sql);
      if (sql.includes('GROUP BY tl.transaction')) {
        const ids = sql
          .match(/IN \(([^)]+)\)/)[1]
          .split(',')
          .map(Number);
        data = table(
          ids.map(id => ({
            id,
            total_count: 30,
            matching_count: sql.includes("tl.mainline = 'T'") ? 3 : 30,
          }))
        );
      } else if (
        sql.includes('SELECT tl.transaction AS id, tl.id AS line_id')
      ) {
        if (delayLines) {
          await delayLines;
        }
        if (failLines) {
          data = { error: 'Fixture line failure', success: false };
        } else {
          const parentId = Number(sql.match(/WHERE tl.transaction = (\d+)/)[1]);
          const after = Number(sql.match(/AND tl.id > (\d+)/)?.[1] ?? -1);
          const matchingOnly =
            /WHERE tl.transaction = \d+ AND tl.mainline = 'T'/.test(sql);
          data = table(
            Array.from({ length: 30 }, (_, lineId) => ({
              id: parentId,
              line_id: lineId,
              line_matches: lineId < 6 && lineId % 2 === 0 ? 'T' : 'F',
              line_memo: `Line ${lineId}`,
              line_netamount: 10 + lineId,
              line_department: 'Finance',
              line_custcol_demo: null,
            }))
              .filter(
                r =>
                  r.line_id > after && (!matchingOnly || r.line_matches === 'T')
              )
              .slice(0, 26)
              .map(row =>
                Object.fromEntries(
                  Object.entries(row).filter(
                    ([key]) => key === 'id' || sql.includes(`AS ${key}`)
                  )
                )
              )
          );
        }
      } else if (sql.startsWith('SELECT * FROM (SELECT t.id')) {
        const after = Number(sql.match(/AND t.id > (\d+)/)?.[1] ?? 99);
        data = table(
          Array.from({ length: 29 }, (_, i) => ({
            id: 100 + i,
            tranid: `DEMO-${100 + i}`,
            type: 'Journal',
            recordtype: 'journalentry',
            trandate: '2026-09-05',
            entity: 'Demo Entity',
            status: 'Approved',
            foreigntotal: 900,
            currency: 'USD',
          }))
            .filter(r => r.id > after)
            .slice(0, 26)
        );
      } else if (sql.includes('COUNT(*)')) data = table([{ cnt: 5001 }]);
      else if (sql.includes('SELECT DISTINCT'))
        data = table([{ type: 'Journal' }]);
      else if (sql.includes('INNER JOIN TransactionLine')) {
        const nextPage = sql.includes('tl.id > 4999');
        if (nextPage && holdNextLinePage) await holdNextLinePage;
        if (!nextPage && holdFirstLinePage) await holdFirstLinePage;
        if (!nextPage && failFirstLinePage)
          data = { error: 'Fixture first page failure', success: false };
        else if (nextPage && failNextLinePage)
          data = { error: 'Fixture page failure', success: false };
        else
          data = table(
            nextPage
              ? [line(5000)]
              : Array.from({ length: 5000 }, (_, i) => line(i))
          );
      } else if (sql.includes('FROM transaction')) {
        data = table([
          {
            id: 100,
            tranid: 'DEMO-100',
            recordtype: 'journalentry',
            memo: 'Header memo',
          },
        ]);
      } else data = table([{ id: 200, memo: 'Customer memo' }]);
    } else throw new Error(`Unexpected action: ${action}`);
    await route.fulfill({
      json: data,
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await step('line fields and metadata retry', async () => {
    await page.getByRole('button', { name: /^Transactions/ }).click();
    await page.getByRole('button', { name: 'Flat lines', exact: true }).click();
    await page.getByRole('button', { name: 'Choose extra columns' }).click();
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    const retry = page.getByRole('button', { name: 'Retry fields' });
    await retry.waitFor({ state: 'visible' });
    permissionWarning = false;
    await retry.click();
    await retry.waitFor({ state: 'hidden' });
    const picker = page.getByRole('combobox', { name: 'Line columns' });
    await picker.fill('transactionline.memo');
    await page.getByRole('option', { name: /Line: Memo/ }).click();
    await page.keyboard.press('Escape');
    const columnPicker = page.getByRole('combobox', { name: 'Line columns' });
    await columnPicker.fill('transactionline.custcol_demo');
    await page.getByRole('option', { name: /Line: Demo Reference/ }).click();
    await page.keyboard.press('Escape');
    await page
      .getByText(
        /Loading line columns shows one row per matching transaction line/
      )
      .waitFor();
  });

  await step(
    '5,001 lines across a same-transaction page boundary',
    async () => {
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Load data', exact: true })
        .click();
      await page
        .getByText('All 5,001 rows loaded', { exact: true })
        .waitFor({ timeout: 30000 });
      assert(queries.some(sql => /t.id = 100 AND tl.id > 4999/.test(sql)));
      const first = page.locator('.MuiDataGrid-row[data-id="100/0"]');
      await first.waitFor();
      const link = first.getByRole('link');
      assert.equal(
        new URL(await link.getAttribute('href')).searchParams.get('id'),
        '100'
      );
      await screenshot('transaction-lines');
    }
  );

  await step(
    'CSV preserves line identity and null custom columns',
    async () => {
      const csv = await downloadCsv(
        page.getByRole('button', { name: 'Export CSV', exact: true })
      );
      const [header, ...rows] = csv.split('\r\n');
      assert.equal(rows.length, 5001);
      assert(header.includes('line_custcol_demo'));
      assert(!header.includes('__rowId'));
      const fields = header.split(',');
      const ids = rows.map(row => row.split(',')[fields.indexOf('line_id')]);
      assert.equal(new Set(ids).size, 5001);
      assert.equal(ids[0], '"0"');
      assert.equal(ids[5000], '"5000"');
    }
  );

  await step(
    'load outcomes stay visible: partial, failed and interrupted',
    async () => {
      const refresh = page
        .getByRole('banner')
        .getByRole('button', { name: 'Refresh data', exact: true });
      const status = page.getByRole('status').filter({ hasText: /rows/ });
      const warning = page
        .getByRole('alert')
        .filter({ hasText: 'results are incomplete' });

      failNextLinePage = true;
      await refresh.click();
      await warning.waitFor();
      assert.match(await warning.innerText(), /Showing 5,000 rows/);
      assert.match(await warning.innerText(), /Fixture page failure/);
      assert.equal(await status.innerText(), '5,000 rows loaded · incomplete');
      await screenshot('partial-load');
      failNextLinePage = false;
      await warning.getByRole('button', { name: 'Load all' }).click();
      await page.getByText('All 5,001 rows loaded', { exact: true }).waitFor();
      assert.equal(await warning.count(), 0);

      failFirstLinePage = true;
      await refresh.click();
      const failure = page
        .getByRole('alert')
        .filter({ hasText: 'Fixture first page failure' });
      await failure.waitFor();
      assert.match(await failure.innerText(), /from the previous load/);
      assert.equal(
        await page.locator('.MuiDataGrid-row[data-id="100/0"]').count(),
        1
      );
      await screenshot('load-error');
      failFirstLinePage = false;
      await failure.getByRole('button', { name: 'Retry' }).click();
      await page.getByText('All 5,001 rows loaded', { exact: true }).waitFor();
      assert.equal(await failure.count(), 0);

      let release;
      holdNextLinePage = new Promise(resolve => {
        release = resolve;
      });
      await refresh.click();
      await page
        .getByText('Loaded 5,000 of 5,001 rows', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: /^Customers/ }).click();
      await page.getByRole('button', { name: /^Transactions/ }).click();
      await warning.waitFor();
      assert.match(await warning.innerText(), /switched views/);
      release();
      holdNextLinePage = undefined;
      await page.waitForTimeout(300);
      assert.equal(await status.innerText(), '5,000 rows loaded · incomplete');

      let releaseRetry;
      holdFirstLinePage = new Promise(resolve => {
        releaseRetry = resolve;
      });
      await warning.getByRole('button', { name: 'Load all' }).click();
      await page.getByText('Loading transactions…', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Customers/ }).click();
      await page.getByRole('button', { name: /^Transactions/ }).click();
      await warning.waitFor();
      assert.match(await warning.innerText(), /switched views/);
      releaseRetry();
      holdFirstLinePage = undefined;
      await page.waitForTimeout(300);
      assert.equal(await warning.count(), 1);
      assert.equal(await status.innerText(), '5,000 rows loaded · incomplete');

      failFirstLinePage = true;
      await warning.getByRole('button', { name: 'Load all' }).click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Fixture first page failure' })
        .waitFor();
      assert.equal(await warning.count(), 1);
      assert.equal(await status.innerText(), '5,000 rows loaded · incomplete');
      failFirstLinePage = false;

      let releaseContinuation;
      holdNextLinePage = new Promise(resolve => {
        releaseContinuation = resolve;
      });
      await refresh.click();
      await page
        .getByText('Loaded 5,000 of 5,001 rows', { exact: true })
        .waitFor();
      let releaseRefresh;
      holdFirstLinePage = new Promise(resolve => {
        releaseRefresh = resolve;
      });
      await refresh.click();
      await page.getByText('Loading transactions…', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Customers/ }).click();
      await page.getByRole('button', { name: /^Transactions/ }).click();
      await warning.waitFor();
      assert.match(await warning.innerText(), /new load started/);
      releaseContinuation();
      releaseRefresh();
      holdNextLinePage = undefined;
      holdFirstLinePage = undefined;
      await page.waitForTimeout(300);
      assert.equal(await warning.count(), 1);
      assert.equal(await status.innerText(), '5,000 rows loaded · incomplete');

      await warning.getByRole('button', { name: 'Load all' }).click();
      await page.getByText('All 5,001 rows loaded', { exact: true }).waitFor();
    }
  );

  await step('tab cache retains transaction line rows', async () => {
    await page.getByRole('button', { name: /^Customers/ }).click();
    await page.getByRole('button', { name: /^Transactions/ }).click();
    await page.locator('.MuiDataGrid-row[data-id="100/0"]').waitFor();
    assert.equal(
      await page.locator('.MuiDataGrid-row[data-id="100/0"]').count(),
      1
    );
  });

  await step(
    'boolean line filter returns transaction headers without duplicates',
    async () => {
      await page
        .getByRole('button', { name: 'Clear all', exact: true })
        .click();
      await page.getByRole('button', { name: 'Choose extra columns' }).click();
      await page.getByRole('button', { name: 'Dynamic field filters' }).click();
      await page
        .getByRole('button', { name: 'Add filter', exact: true })
        .click();
      await page
        .getByPlaceholder('Select field…')
        .fill('transactionline.mainline');
      await page.getByRole('option', { name: /Line: Main Line/ }).click();
      await page
        .getByRole('button', { name: 'Apply & Load', exact: true })
        .click();
      await page.locator('.MuiDataGrid-row[data-id="100"]').waitFor();
      const sql = queries.at(-1);
      assert.match(sql, /EXISTS \(SELECT 1 FROM TransactionLine/);
      assert.match(sql, /tl.mainline = 'T'/);
      assert.doesNotMatch(sql, /INNER JOIN/);
      assert.equal(await page.locator('.MuiDataGrid-row').count(), 1);
      await screenshot('line-filter-header-results');
    }
  );

  await step('parent pages load without fetching any line detail', async () => {
    await dismissToasts();
    await page.getByRole('button', { name: 'Dynamic field filters' }).click();
    await page
      .getByRole('button', { name: 'Grouped transactions', exact: true })
      .click();
    await page.getByRole('button', { name: 'Choose extra columns' }).click();
    const picker = page.getByRole('combobox', { name: 'Line columns' });
    await picker.fill('transactionline.memo');
    await page.getByRole('option', { name: /Line: Memo/ }).click();
    await picker.fill('transactionline.netamount');
    await page.getByRole('option', { name: /Line: Net Amount/ }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Choose extra columns' }).click();
    const before = queries.length;
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Load data', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Expand DEMO-100', exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole('button', { name: /^Expand DEMO-/ }).count(),
      25
    );
    assert.equal(
      await page.getByText('3 matching of 30 lines', { exact: true }).count(),
      25
    );
    assert(!queries.slice(before).some(sql => sql.includes('AS line_matches')));
    const csv = await downloadCsv(
      page.getByRole('button', { name: 'Export transaction page' })
    );
    assert.equal(csv.split('\r\n').length, 26);
    assert(csv.split('\r\n')[0].includes('foreigntotal'));
    assert(!csv.split('\r\n')[0].includes('line_id'));
  });

  await step('lazy expansion, matching scope and cached collapse', async () => {
    await page
      .getByRole('button', { name: 'Expand DEMO-100', exact: true })
      .click();
    const region = page.getByRole('region', {
      name: 'DEMO-100 transaction lines',
      exact: true,
    });
    await region.locator('.MuiDataGrid-row[data-id="100/0"]').waitFor();
    assert.equal(await region.locator('.MuiDataGrid-row').count(), 3);
    assert.equal(
      await region
        .getByRole('columnheader', { name: /Transaction total/ })
        .count(),
      0
    );
    const count = queries.length;
    await page
      .getByRole('button', { name: 'Collapse DEMO-100', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Expand DEMO-100', exact: true })
      .click();
    await region.locator('.MuiDataGrid-row[data-id="100/0"]').waitFor();
    assert.equal(queries.length, count);
    const href = await page
      .getByRole('link', { name: 'DEMO-100', exact: true })
      .getAttribute('href');
    assert.equal(new URL(href).searchParams.get('id'), '100');
  });

  await step(
    'show all context, match highlights and child pagination',
    async () => {
      const region = page.getByRole('region', {
        name: 'DEMO-100 transaction lines',
        exact: true,
      });
      await region.getByRole('button', { name: 'Show all lines' }).click();
      await region.locator('.MuiDataGrid-row[data-id="100/1"]').waitFor();
      assert.equal(
        await region
          .locator('.MuiDataGrid-row[data-id="100/0"] .MuiChip-label')
          .innerText(),
        'Matches'
      );
      assert.equal(
        await region
          .locator('.MuiDataGrid-row[data-id="100/1"] .MuiChip-label')
          .innerText(),
        'Context'
      );
      assert(
        (
          await region
            .locator('.MuiDataGrid-row[data-id="100/0"]')
            .getAttribute('class')
        ).includes('matching-line')
      );
      await page
        .locator('.MuiCollapse-entered')
        .filter({ has: region })
        .waitFor();
      await screenshot('grouped-transactions');
      const csv = await downloadCsv(
        region.getByRole('button', { name: 'Export line page' })
      );
      assert.equal(csv.split('\r\n').length, 26);
      assert(csv.split('\r\n')[0].includes('line_matches'));
      assert(!csv.split('\r\n')[0].includes('foreigntotal'));
      await region.getByRole('button', { name: 'Next lines page' }).click();
      await region.locator('.MuiDataGrid-row[data-id="100/25"]').waitFor();
      assert(
        queries.some(sql => /tl.transaction = 100 AND tl.id > 24/.test(sql))
      );
      assert.equal(await region.locator('.MuiDataGrid-row').count(), 5);
      const count = queries.length;
      await region.getByRole('button', { name: 'Previous lines page' }).click();
      await region.locator('.MuiDataGrid-row[data-id="100/0"]').waitFor();
      assert.equal(queries.length, count);
    }
  );

  await step(
    'parent paging advances by parent ID and cached pages return',
    async () => {
      await page
        .getByRole('button', { name: 'Next transactions page' })
        .click();
      await page
        .getByRole('button', { name: 'Expand DEMO-125', exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole('button', { name: /^Expand DEMO-/ }).count(),
        4
      );
      assert(queries.some(sql => /t.id > 124 ORDER BY t.id ASC/.test(sql)));
      const count = queries.length;
      await page
        .getByRole('button', { name: 'Previous transactions page' })
        .click();
      await page
        .getByRole('button', { name: 'Expand DEMO-100', exact: true })
        .waitFor();
      assert.equal(queries.length, count);
    }
  );

  await step(
    'line errors retry in place and refresh discards stale detail',
    async () => {
      failLines = true;
      await page
        .getByRole('button', { name: 'Expand DEMO-100', exact: true })
        .click();
      const region = page.getByRole('region', {
        name: 'DEMO-100 transaction lines',
        exact: true,
      });
      await region.getByRole('button', { name: 'Retry lines' }).waitFor();
      failLines = false;
      await region.getByRole('button', { name: 'Retry lines' }).click();
      await region.locator('.MuiDataGrid-row[data-id="100/0"]').waitFor();
      let release;
      delayLines = new Promise(resolve => {
        release = resolve;
      });
      await Promise.all([
        page.waitForRequest(
          request =>
            request.method() === 'POST' &&
            request.postData()?.includes('AS line_matches')
        ),
        region.getByRole('button', { name: 'Show all lines' }).click(),
      ]);
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Refresh data', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Expand DEMO-100', exact: true })
        .waitFor();
      delayLines = undefined;
      release();
      assert.equal(
        await page
          .getByRole('region', {
            name: 'DEMO-100 transaction lines',
            exact: true,
          })
          .count(),
        0
      );
      await page
        .getByRole('button', { name: 'Expand DEMO-100', exact: true })
        .click();
      await page
        .getByRole('region', {
          name: 'DEMO-100 transaction lines',
          exact: true,
        })
        .locator('.MuiDataGrid-row[data-id="100/0"]')
        .waitFor();
      await page
        .locator('.MuiCollapse-entered')
        .filter({
          has: page.getByRole('region', {
            name: 'DEMO-100 transaction lines',
            exact: true,
          }),
        })
        .waitFor();
      await screenshot('grouped-matching-lines');
    }
  );

  await runGroupedSortingSmoke({ page, step, screenshot });

  await step('grouped results flag unapplied edits', async () => {
    const pending = page
      .getByRole('alert')
      .filter({ hasText: 'Edits not applied' });
    await page
      .getByRole('button', { name: /^Expand SORT-/ })
      .first()
      .waitFor();
    assert.equal(await pending.count(), 0);
    await page.getByRole('button', { name: 'Basic filters' }).click();
    const tranId = page.getByLabel('Tran ID contains');
    await tranId.fill('SORT-1');
    await pending.waitFor();
    assert.match(await pending.innerText(), /exports still use/);
    await screenshot('grouped-pending-edits');
    await tranId.fill('');
    await pending.waitFor({ state: 'hidden' });
  });

  return {
    dataLoaded: true,
    metrics: { fixtureLines: 5001 },
    notes: [
      'Fixture-based browser test; NetSuite server actions were not deployed or invoked.',
    ],
  };
}
