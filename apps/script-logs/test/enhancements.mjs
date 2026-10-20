import assert from 'node:assert/strict';

export default async function enhancements({
  page,
  step: reportStep,
  screenshot,
  fixtures,
  actionResponses,
}) {
  const failures = [];
  const step = async (label, run) => {
    try {
      await reportStep(label, run);
    } catch (error) {
      failures.push(label + ': ' + error.message);
      console.error('FAIL ' + failures.at(-1));
      await screenshot('enhancement-failure-' + failures.length);
    }
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const find = () =>
    page.getByRole('textbox', { name: 'Find in details', exact: true });
  const idle = () =>
    page.waitForFunction(
      () => !document.querySelector('button[type="submit"]')?.disabled
    );
  const table = async () => {
    await page.waitForTimeout(200);
    const back = page.getByRole('button', { name: /Back to logs/ });
    if (await back.isVisible()) await back.click();
    if (await button('Show table').isVisible())
      await button('Show table').click();
  };
  const reset = async () => {
    await table();
    await button('Reset').click();
    await idle();
  };
  const choose = async (name, value) => {
    await page
      .getByRole('combobox', { name: new RegExp('^' + name + '(?: |$)') })
      .click();
    await page.getByRole('option', { name: value, exact: true }).click();
    await page.locator('.MuiPopover-root').waitFor({ state: 'hidden' });
    await idle();
  };
  const select = async title => {
    await button(`Inspect ${title}`).click();
    await find().waitFor();
  };
  const search = async text => {
    await table();
    await page.getByLabel('Search titles and details').fill(text);
    await button('Search logs').click();
    await idle();
  };
  const visibleHeight = locator =>
    locator.evaluate(element => {
      let { top, bottom } = element.getBoundingClientRect();
      top = Math.max(0, top);
      bottom = Math.min(innerHeight, bottom);
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (
          ['auto', 'scroll', 'hidden'].includes(
            getComputedStyle(parent).overflowY
          )
        ) {
          const rect = parent.getBoundingClientRect();
          top = Math.max(top, rect.top);
          bottom = Math.min(bottom, rect.bottom);
        }
      }
      return Math.max(0, bottom - top);
    });
  await page.setViewportSize({ width: 1366, height: 768 });
  await reset();
  await step(
    'fresh selection keeps an 8-row worklist beside a 180px payload without focus or scrolling',
    async () => {
      await select('Invoice sync failed');
      await page.getByTestId('json-tree').waitFor();
      const height = await visibleHeight(page.getByTestId('json-tree'));
      assert.ok(height >= 180, `JSON visible height ${height}`);
      assert.ok(
        (await visibleHeight(page.locator('.MuiDataGrid-row').nth(7))) >= 51
      );
      const tree = await page.getByTestId('json-tree').boundingBox();
      const grid = await page.locator('.MuiDataGrid-root').boundingBox();
      assert.ok(tree.x >= grid.x + grid.width, 'inspector sits beside list');
      const headers = await page.getByRole('columnheader').all();
      assert.deepEqual(
        await Promise.all(headers.map(header => header.innerText())),
        ['Timestamp', 'Log title']
      );
      for (const header of headers) {
        const box = await header.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 1366);
      }
      await screenshot('enhanced-laptop-split');
      for (const [title, testId] of [
        ['Customer export completed', 'raw-details'],
        ['Truncated upstream error', 'formatted-details'],
      ]) {
        await select(title);
        await page.getByTestId(testId).waitFor();
        const height = await visibleHeight(page.getByTestId(testId));
        assert.ok(height >= 180, `${title} visible height ${height}`);
      }
    }
  );
  await step(
    'custom time range filters by validated bounds and blocks reversed ranges',
    async () => {
      await reset();
      await choose('Time window', 'Custom range…');
      const from = page.getByLabel('From', { exact: true });
      const to = page.getByLabel('To', { exact: true });
      // Defaults come from the account-time anchor (2026-09-10 10:42:00),
      // not the browser clock or zone.
      assert.equal(await from.inputValue(), '2026-09-09T10:42');
      assert.equal(await to.inputValue(), '2026-09-10T10:42');
      await from.fill('2026-09-10T10:41');
      await to.fill('2026-09-10T10:30');
      await page.getByText('Start must be before end.').waitFor();
      assert.ok(await button('Search logs').isDisabled());
      await from.fill('2026-09-10T10:30');
      await to.fill('2026-09-10T10:40');
      await button('Search logs').click();
      await idle();
      await page.getByText(/Showing:.*Sep 10 10:30 – Sep 10 10:40/).waitFor();
      assert.equal(await page.locator('.MuiDataGrid-row').count(), 4);
      await choose('Time window', 'Last 24 hours');
      assert.equal(await from.count(), 0);
      await page.getByText(/Unapplied changes. Showing:/).waitFor();
      await reset();
      assert.equal(await page.getByText(/Unapplied changes/).count(), 0);
    }
  );
  await step(
    'divider supports keys and pointer and density/column preferences persist',
    async () => {
      await reset();
      await select('Invoice sync failed');
      const divider = page.getByRole('separator', {
        name: 'Resize log list and details',
      });
      await divider.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await divider.getAttribute('aria-valuenow'), '43');
      const bounds = await divider.boundingBox();
      await page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 60, bounds.y + bounds.height / 2);
      await page.mouse.up();
      assert.ok(Number(await divider.getAttribute('aria-valuenow')) > 43);
      await button('Collapse details').click();
      await choose('Density', 'Comfortable');
      assert.equal(
        Math.round(
          (await page.locator('.MuiDataGrid-row').first().boundingBox()).height
        ),
        70
      );
      const header = page.getByRole('columnheader', { name: /^Script/ });
      const edge = await header
        .locator('.MuiDataGrid-columnSeparator')
        .boundingBox();
      const before = (await header.boundingBox()).width;
      await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        edge.x + edge.width / 2 + 35,
        edge.y + edge.height / 2,
        { steps: 5 }
      );
      await page.mouse.up();
      await page.waitForTimeout(200);
      assert.ok((await header.boundingBox()).width > before + 20);
      const savedWidth = (await header.boundingBox()).width;
      await page.reload();
      await idle();
      assert.equal(
        Math.round(
          (await page.locator('.MuiDataGrid-row').first().boundingBox()).height
        ),
        70
      );
      assert.ok(
        Math.abs(
          (
            await page
              .getByRole('columnheader', { name: /^Script/ })
              .boundingBox()
          ).width - savedWidth
        ) < 2
      );
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage))
          if (key.startsWith('script-logs:')) localStorage.removeItem(key);
      });
      await page.reload();
      await idle();
    }
  );
  await step(
    'sort and refresh retain selected-log state, neighbors restore history, boundaries fetch one page',
    async () => {
      await choose('Rows', '25');
      await select('Invoice sync failed');
      await find().fill('INVALID_TAX_CODE');
      await page.getByRole('columnheader', { name: /^Log title/ }).click();
      await idle();
      assert.equal(await find().inputValue(), 'INVALID_TAX_CODE');
      await button('Refresh').click();
      await idle();
      await find().waitFor();
      assert.equal(await find().inputValue(), 'INVALID_TAX_CODE');
      await page.getByText(/^Checked /).waitFor();
      await reset();
      await choose('Rows', '10');
      await select('Invoice sync failed');
      await button('Focus details').click();
      await button('Expand all').click();
      await page.getByTestId('json-tree').evaluate(element => {
        element.scrollTop = 120;
      });
      await page.waitForTimeout(100);
      const scrollBefore = await page
        .getByTestId('json-tree')
        .evaluate(element => element.scrollTop);
      assert.ok(scrollBefore > 0);
      await button('Next log').click();
      await find().waitFor();
      await button('Previous log').click();
      await find().waitFor();
      await page.waitForTimeout(100);
      assert.ok(
        Math.abs(
          (await page
            .getByTestId('json-tree')
            .evaluate(element => element.scrollTop)) - scrollBefore
        ) < 2
      );
      await find().fill('INVALID_TAX_CODE');
      await button('Next log').click();
      await page
        .getByRole('heading', {
          name: 'Payment reconciliation timeout',
          exact: true,
        })
        .waitFor();
      await find().waitFor();
      await button('Next log').click();
      await page
        .getByRole('heading', {
          name: 'Customer export completed',
          exact: true,
        })
        .waitFor();
      await find().waitFor();
      await button('Previous log').click();
      await find().waitFor();
      await button('Previous log').click();
      await find().waitFor();
      assert.equal(await find().inputValue(), 'INVALID_TAX_CODE');
      assert.ok(await button('Show table').isVisible());
      for (let i = 0; i < 9; i++) {
        await button('Next log').click();
        await find().waitFor();
        await page.getByText(`Log ${i + 2}`, { exact: true }).waitFor();
      }
      const count = actionResponses.filter(
        r => r.action === 'listScriptLogTable'
      ).length;
      await button('Next log').click();
      await page.getByText('Log 11', { exact: true }).waitFor();
      await find().waitFor();
      assert.equal(
        actionResponses.filter(r => r.action === 'listScriptLogTable').length,
        count + 1
      );
      await button('Previous log').click();
      await page.getByText('Log 10', { exact: true }).waitFor();
      await find().waitFor();
      await button('Show table').click();
      await page.getByText('Page 1', { exact: true }).waitFor();
      await page.getByRole('columnheader', { name: /^Timestamp/ }).click();
      await idle();
      await page.getByText(/selected log is not on this result page/).waitFor();
    }
  );
  await step(
    'long scalar matches reveal actual characters, bounded full view and exact copy',
    async () => {
      const row = fixtures.demoLogs.find(row => row.id === '9001');
      const original = row.raw;
      const value = 'Synthetic note. '.repeat(800) + 'END_OF_LONG_VALUE';
      try {
        row.raw = JSON.stringify({
          name: 'SYNTHETIC_LONG_VALUE',
          cause: { note: value },
        });
        await reset();
        await select('Invoice sync failed');
        await button('Expand $/cause').click();
        await find().fill('END_OF_LONG_VALUE');
        const node = page.locator('[data-json-path="$/cause/note"]');
        assert.equal(
          await node.locator('mark').innerText(),
          'END_OF_LONG_VALUE'
        );
        assert.ok((await visibleHeight(node)) > 0);
        await button('Show full value').click();
        const dialog = page.getByRole('dialog');
        assert.ok(
          (await page.getByTestId('full-value-text').innerText()).length <= 8392
        );
        assert.ok(
          (await page.getByTestId('full-value-text').innerText()).includes(
            'END_OF_LONG_VALUE'
          )
        );
        await dialog
          .getByRole('button', { name: 'Copy value', exact: true })
          .click();
        await page.waitForFunction(() => {
          const pane = document.querySelector(
            '[data-testid="full-value-text"]'
          );
          const match = pane?.querySelector('mark');
          if (!pane || !match) return false;
          const box = pane.getBoundingClientRect();
          const found = match.getBoundingClientRect();
          return found.top >= box.top && found.bottom <= box.bottom;
        });
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          value
        );
        await screenshot('enhanced-full-value');
        await button('Close full value').click();
        await find().fill('');
        assert.ok(!(await node.innerText()).includes('END_OF_LONG_VALUE'));
        await button('Copy original').click();
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          row.raw
        );
      } finally {
        if (await button('Close full value').isVisible())
          await button('Close full value').click();
        row.raw = original;
      }
    }
  );
  await step(
    'lookup fields visible, query match emphasis and compact narrow rows expose all seven fields',
    async () => {
      await reset();
      assert.ok(
        await page
          .getByRole('combobox', { name: 'Script', exact: true })
          .isVisible()
      );
      assert.ok(
        await page
          .getByRole('combobox', { name: 'Deployment', exact: true })
          .isVisible()
      );
      await search('Invoice');
      assert.ok(
        (await page
          .locator('.MuiDataGrid-row [data-field="title"] mark')
          .count()) > 0
      );
      await reset();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      const summary = page
        .locator('form [title]')
        .filter({ hasText: 'Showing:' });
      assert.ok((await summary.boundingBox()).width > 340);
      const row = page
        .locator('[data-testid="narrow-log-list"] article')
        .first();
      for (const value of [
        'Invoice sync failed',
        '10:41:28',
        'ERROR',
        'Invoice sync',
        'Invoice sync · primary',
        'Demo operator',
        'INVOICE_SYNC_FAILED',
      ])
        assert.ok((await row.innerText()).includes(value), value);
      assert.ok(
        !(await page
          .getByRole('combobox', { name: 'Script', exact: true })
          .isVisible())
      );
      await screenshot('enhanced-narrow-overview');
      await row
        .getByRole('button', {
          name: 'Inspect Invoice sync failed',
          exact: true,
        })
        .click();
      await find().waitFor();
      await button('Back to logs').click();
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label')
        ),
        'Inspect Invoice sync failed'
      );
      await page.getByRole('button', { name: /^Filters/ }).click();
      assert.ok(
        await page
          .getByRole('combobox', { name: 'Script', exact: true })
          .isVisible()
      );
      await page.getByRole('button', { name: /^Filters/ }).click();
      assert.ok(await button('Sort ascending').isVisible());
    }
  );
  await step(
    'detail permission denial clears rows, payload and inspection history',
    async () => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await reset();
      await select('Invoice sync failed');
      await find().fill('INVALID_TAX_CODE');
      fixtures.detailFailure = true;
      await button('Next log').click();
      await page.getByText('Permission denied', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('json-tree').count(), 0);
      assert.equal(await page.locator('.MuiDataGrid-row').count(), 0);
      fixtures.detailFailure = false;
      await button('Recheck access').click();
      await idle();
      await select('Invoice sync failed');
      assert.equal(await find().inputValue(), '');
      await screenshot('enhanced-final-workspace');
    }
  );
  await step(
    'refresh after the last page expires moves to the last remaining page',
    async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await reset();
      const perPage = await page.locator('.MuiDataGrid-row').count();
      await button('Next page').click();
      await idle();
      await page.getByText('Page 2', { exact: true }).waitFor();
      fixtures.tableLimit = perPage;
      try {
        await button('Refresh').click();
        await idle();
        await page.getByText('Page 1', { exact: true }).waitFor();
        assert.equal(await page.locator('.MuiDataGrid-row').count(), perPage);
        assert.equal(
          await page.getByText('No logs match your filters').count(),
          0
        );
      } finally {
        fixtures.tableLimit = null;
      }
      await reset();
    }
  );
  if (failures.length) throw new Error(failures.join('\n'));
}
