import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function runGroupedSortingSmoke({ page, step, screenshot }) {
  const parents = Array.from({ length: 54 }, (_, i) => ({
    id: 100 + i,
    tranid: `SORT-${100 + i}`,
    type: 'Journal',
    recordtype: 'journalentry',
    trandate: `2026-09-${String(28 - (i % 28)).padStart(2, '0')}`,
    entity: `Team ${i % 3}`,
    status: 'Approved',
    foreigntotal: i % 13 === 0 ? null : ((54 - i) % 9) * 100 - 400,
    currency: 'USD',
  }));
  const lines = id =>
    Array.from({ length: 61 }, (_, i) => ({
      id,
      line_id: i,
      line_matches: i % 2 === 0 ? 'T' : 'F',
      line_memo: `Line ${i}`,
      line_netamount: i % 11 === 0 ? null : ((60 - i) % 7) * 10 - 30,
    }));
  const ordered = (rows, field, direction, tie) =>
    [...rows].sort((a, b) => {
      const x = a[field],
        y = b[field];
      if (x == null && y != null) return 1;
      if (x != null && y == null) return -1;
      const comparison =
        x == null || y == null ? 0 : x < y ? -1 : x > y ? 1 : 0;
      return comparison * (direction === 'asc' ? 1 : -1) || a[tie] - b[tie];
    });
  const table = rows => ({
    headers: Object.keys(rows[0] || {}).map(id => ({ id, label: id })),
    rows,
  });
  const queries = [];
  let failSortedParents = false;
  let delayedParents;
  await page.route('**/api/handle-action', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    if (body.params.actionProps.action !== 'getTableRowsFromSuiteql')
      return route.fallback();
    const sql = body.inputData.query;
    queries.push(sql);
    const sort = sql.match(/ORDER BY ([a-z_]+) (ASC|DESC) NULLS LAST/);
    const offset = Number(sql.match(/WHERE sr_page_row > (\d+)/)?.[1] ?? 0);
    let result;
    if (sql.includes('GROUP BY tl.transaction')) {
      result = table(
        sql
          .match(/IN \(([^)]+)\)/)[1]
          .split(',')
          .map(id => ({ id: Number(id), total_count: 61, matching_count: 31 }))
      );
    } else if (sql.includes('AS line_matches')) {
      const id = Number(sql.match(/WHERE tl.transaction = (\d+)/)[1]);
      const matchingOnly =
        /WHERE tl.transaction = \d+ AND tl.mainline = 'T'/.test(sql);
      let rows = lines(id).filter(
        row => !matchingOnly || row.line_matches === 'T'
      );
      if (sort)
        rows = ordered(rows, sort[1], sort[2].toLowerCase(), 'line_id')
          .slice(offset, offset + 26)
          .map((row, i) => ({ ...row, sr_page_row: offset + i + 1 }));
      else
        rows = rows
          .filter(
            row =>
              row.line_id > Number(sql.match(/AND tl.id > (\d+)/)?.[1] ?? -1)
          )
          .slice(0, 26);
      result = table(rows);
    } else if (sql.includes('FROM transaction t')) {
      if (sort && delayedParents) await delayedParents;
      if (sort && failSortedParents)
        result = { success: false, error: 'Sorted query fixture failure' };
      else {
        const rows = sort
          ? ordered(parents, sort[1], sort[2].toLowerCase(), 'id')
              .slice(offset, offset + 26)
              .map((row, i) => ({ ...row, sr_page_row: offset + i + 1 }))
          : parents
              .filter(
                row => row.id > Number(sql.match(/AND t.id > (\d+)/)?.[1] ?? 0)
              )
              .slice(0, 26);
        result = table(rows);
      }
    } else return route.fallback();
    await route.fulfill({
      json: result,
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  const parentHeader = field =>
    page
      .getByRole('table', { name: 'Grouped transactions' })
      .locator('thead')
      .getByRole('button', { name: field, exact: true });
  const parentIds = () =>
    page
      .getByRole('button', { name: /^(Expand|Collapse) SORT-/ })
      .evaluateAll(nodes =>
        nodes.map(node =>
          Number(node.getAttribute('aria-label').match(/SORT-(\d+)/)[1])
        )
      );
  const regionFor = id =>
    page.getByRole('region', {
      name: `SORT-${id} transaction lines`,
      exact: true,
    });
  const firstLine = async (region, id, line) => {
    await page.waitForFunction(
      ({ id, line }) =>
        document
          .querySelector(
            `[aria-label="Lines for transaction ${id}"] .MuiDataGrid-row[data-id]`
          )
          ?.getAttribute('data-id') === `${id}/${line}`,
      { id, line }
    );
    assert.equal(
      await region
        .locator('.MuiDataGrid-row[data-id]')
        .first()
        .getAttribute('data-id'),
      `${id}/${line}`
    );
  };
  const csvIds = async (button, field) => {
    await page.mouse.move(0, 0);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click(),
    ]);
    const csv = await readFile(await download.path(), 'utf8');
    assert(!csv.includes('sr_page_row'));
    const [header, ...rows] = csv.split('\r\n');
    const index = header.split(',').indexOf(field);
    assert(index >= 0);
    return rows.map(row => Number(row.split(',')[index].replaceAll('"', '')));
  };
  let parentOrder;
  await step(
    'parent sorting orders the whole result and exported page in both directions',
    async () => {
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Refresh data', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Expand SORT-100', exact: true })
        .waitFor();
      for (const direction of ['asc', 'desc']) {
        await parentHeader('Transaction total').click();
        parentOrder = ordered(parents, 'foreigntotal', direction, 'id');
        await page
          .getByRole('button', {
            name: `Expand SORT-${parentOrder[0].id}`,
            exact: true,
          })
          .waitFor();
        assert.deepEqual(
          await parentIds(),
          parentOrder.slice(0, 25).map(row => row.id)
        );
        assert.deepEqual(
          await csvIds(
            page.getByRole('button', { name: 'Export transaction page' }),
            'id'
          ),
          parentOrder.slice(0, 25).map(row => row.id)
        );
      }
      await page
        .getByRole('button', { name: 'Next transactions page' })
        .click();
      await page.getByText(/^Transactions page 2 /).waitFor();
      assert.deepEqual(
        await parentIds(),
        parentOrder.slice(25, 50).map(row => row.id)
      );
      const count = queries.length;
      await page
        .getByRole('button', { name: 'Previous transactions page' })
        .click();
      await page.getByText(/^Transactions page 1 /).waitFor();
      assert.equal(queries.length, count);
      assert.deepEqual(
        await parentIds(),
        parentOrder.slice(0, 25).map(row => row.id)
      );
    }
  );

  await step(
    'line sorting stays inside its parent across pages and matching/context toggles',
    async () => {
      const id = parentOrder[0].id;
      await page
        .getByRole('button', { name: `Expand SORT-${id}`, exact: true })
        .click();
      const region = regionFor(id);
      await firstLine(region, id, 0);
      const matching = lines(id).filter(row => row.line_matches === 'T');
      for (const direction of ['asc', 'desc']) {
        await region
          .locator('[role="columnheader"][data-field="line_netamount"]')
          .click();
        const expected = ordered(
          matching,
          'line_netamount',
          direction,
          'line_id'
        );
        await firstLine(region, id, expected[0].line_id);
        assert.deepEqual(
          await csvIds(
            region.getByRole('button', { name: 'Export line page' }),
            'line_id'
          ),
          expected.slice(0, 25).map(row => row.line_id)
        );
        assert.deepEqual(
          await parentIds(),
          parentOrder.slice(0, 25).map(row => row.id)
        );
      }
      const expected = ordered(matching, 'line_netamount', 'desc', 'line_id');
      await region.getByRole('button', { name: 'Next lines page' }).click();
      await region.getByText(/^Lines page 2 /).waitFor();
      assert.deepEqual(
        await csvIds(
          region.getByRole('button', { name: 'Export line page' }),
          'line_id'
        ),
        expected.slice(25).map(row => row.line_id)
      );
      await region.getByRole('button', { name: 'Show all lines' }).click();
      await region.getByText(/^Lines page 1 /).waitFor();
      const all = ordered(lines(id), 'line_netamount', 'desc', 'line_id');
      await firstLine(region, id, all[0].line_id);
      assert.deepEqual(
        await csvIds(
          region.getByRole('button', { name: 'Export line page' }),
          'line_id'
        ),
        all.slice(0, 25).map(row => row.line_id)
      );
      assert.equal(
        await region
          .locator('[data-field="line_netamount"][role="columnheader"]')
          .getAttribute('aria-sort'),
        'descending'
      );
      const secondId = parentOrder[1].id;
      await page
        .getByRole('button', { name: `Expand SORT-${secondId}`, exact: true })
        .click();
      await firstLine(regionFor(secondId), secondId, 0);
      assert.equal(
        await regionFor(secondId)
          .locator('[data-field="line_id"][role="columnheader"]')
          .getAttribute('aria-sort'),
        'ascending'
      );
      await screenshot('grouped-sorting');
    }
  );

  await step(
    'changing parent sort resets paging and a failed sorted request can retry',
    async () => {
      await page
        .getByRole('button', { name: 'Next transactions page' })
        .click();
      await page.getByText(/^Transactions page 2 /).waitFor();
      failSortedParents = true;
      await parentHeader('Date').click();
      await page
        .getByRole('button', { name: 'Retry transactions', exact: true })
        .waitFor();
      failSortedParents = false;
      await page
        .getByRole('button', { name: 'Retry transactions', exact: true })
        .click();
      const expected = ordered(parents, 'trandate', 'asc', 'id');
      await page
        .getByRole('button', {
          name: `Expand SORT-${expected[0].id}`,
          exact: true,
        })
        .waitFor();
      await page.getByText(/^Transactions page 1 /).waitFor();
      assert.deepEqual(
        await parentIds(),
        expected.slice(0, 25).map(row => row.id)
      );
      assert(
        queries.some(
          sql =>
            /ORDER BY trandate ASC NULLS LAST, id ASC/.test(sql) &&
            /sr_page_row > 0/.test(sql)
        )
      );
    }
  );

  await step(
    'refresh discards a delayed response from a prior sort',
    async () => {
      let release;
      delayedParents = new Promise(resolve => {
        release = resolve;
      });
      await Promise.all([
        page.waitForRequest(
          request =>
            request.method() === 'POST' &&
            request.postData()?.includes('ORDER BY trandate DESC')
        ),
        parentHeader('Date').click(),
      ]);
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Refresh data', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Expand SORT-100', exact: true })
        .waitFor();
      const response = page.waitForResponse(response =>
        response.request().postData()?.includes('ORDER BY trandate DESC')
      );
      delayedParents = undefined;
      release();
      await response;
      assert.deepEqual(
        await parentIds(),
        parents.slice(0, 25).map(row => row.id)
      );
    }
  );
}
