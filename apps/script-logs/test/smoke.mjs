import assert from 'node:assert/strict';

export default async function smoke({
  page,
  step,
  screenshot,
  live,
  actionResponses,
  fixtures,
}) {
  if (live)
    throw new Error(
      'This specification uses synthetic fixtures only; it cannot establish live NetSuite behavior.'
    );
  if (!fixtures)
    throw new Error(
      'Run test/browser.mjs so all API interception is installed before navigation.'
    );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  const idle = () =>
    page.waitForFunction(
      () => !document.querySelector('button[type="submit"]')?.disabled
    );
  const search = async term => {
    const show = page.getByRole('button', { name: 'Show table', exact: true });
    if (await show.isVisible()) await show.click();
    await page.getByLabel('Search titles and details').fill(term);
    await page
      .getByRole('button', { name: 'Search logs', exact: true })
      .click();
    await idle();
  };
  const choose = async (label, option) => {
    await page
      .getByRole('combobox', { name: new RegExp('^' + label + '(?: |$)') })
      .click();
    if (label === 'Script' || label === 'Deployment') {
      await page
        .getByRole('combobox', { name: label, exact: true })
        .fill(option);
      await page
        .getByRole('option')
        .filter({ has: page.getByText(option, { exact: true }) })
        .click();
    } else
      await page.getByRole('option', { name: option, exact: true }).click();
  };
  const reset = async () => {
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await idle();
  };
  const inspect = async title => {
    const back = page.getByRole('button', { name: /Back to logs/ });
    if (await back.isVisible()) await back.click();
    const show = page.getByRole('button', { name: 'Show table', exact: true });
    if (await show.isVisible()) await show.click();
    await reset();
    await search(title);
    await page
      .getByRole('button', { name: `Inspect ${title}`, exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Find in details', exact: true })
      .waitFor();
    const focus = page.getByRole('button', {
      name: 'Focus details',
      exact: true,
    });
    if (await focus.isVisible()) await focus.click();
  };
  const find = () =>
    page.getByRole('textbox', { name: 'Find in details', exact: true });
  const node = path => page.locator(`[data-json-path="${path}"]`);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const activeMatchVisible = async (contentSelector, matchSelector) => {
    await page.waitForFunction(
      ({ contentSelector, matchSelector }) => {
        const content = document
          .querySelector(contentSelector)
          ?.getBoundingClientRect();
        const match = document
          .querySelector(matchSelector)
          ?.getBoundingClientRect();
        return (
          content &&
          match &&
          match.top >= Math.max(0, content.top) &&
          match.bottom <= Math.min(innerHeight, content.bottom) &&
          match.left >= Math.max(0, content.left) &&
          match.right <= Math.min(innerWidth, content.right)
        );
      },
      { contentSelector, matchSelector }
    );
  };
  const treeMatchVisible = () =>
    activeMatchVisible(
      '[data-testid="json-tree"]',
      '[data-json-path="$/cause/response/body/errors/0/code"]'
    );

  await step(
    'live-only app with intercepted fixtures and bounded listing',
    async () => {
      await page
        .getByText('Read only · Live NetSuite', { exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Synthetic demo' }).count(),
        0
      );
      await idle();
      assert.ok((await page.locator('.MuiDataGrid-row').count()) <= 10);
      await page.getByText(/10 on this page/).waitFor();
      assert.ok(actionResponses.length > 0);
    }
  );
  await screenshot('synthetic-overview');
  await step(
    'all seven columns are visible and sorting spans result pages',
    async () => {
      for (const name of [
        'Timestamp',
        'Log type',
        'Script',
        'Deployment',
        'User',
        'Log title',
        'Log detail',
      ]) {
        const header = page.getByRole('columnheader', {
          name: new RegExp('^' + name + '(?: |$)'),
        });
        const box = await header.boundingBox();
        assert.ok(
          box && box.x >= 0 && box.x + box.width <= 1440,
          name + ' visible'
        );
      }
      const first = page.locator('.MuiDataGrid-row').first();
      for (const text of [
        'Invoice sync',
        'Invoice sync · primary',
        'Demo operator',
        'INVOICE_SYNC_FAILED',
      ])
        assert.ok((await first.innerText()).includes(text));
      await page.getByRole('columnheader', { name: /^Log title/ }).click();
      await idle();
      const titles = () =>
        page.locator('.MuiDataGrid-row [data-field="title"]').allTextContents();
      const firstTitles = await titles();
      assert.equal(firstTitles[0], 'Customer export completed');
      await page
        .getByRole('button', { name: 'Next page', exact: true })
        .click();
      await idle();
      const secondTitles = await titles();
      assert.ok(firstTitles.at(-1).localeCompare(secondTitles[0]) <= 0);
      await page.getByRole('columnheader', { name: /^Log title/ }).click();
      await idle();
      await page.getByText('Page 1', { exact: true }).waitFor();
      assert.equal((await titles())[0], 'Truncated upstream error');
      await choose('Rows', '25');
      await idle();
      await page.getByText(/23 on this page/).waitFor();
      assert.ok(
        await page
          .getByRole('button', { name: 'Next page', exact: true })
          .isDisabled()
      );
      await choose('Rows', '10');
      await idle();
      await reset();
    }
  );
  await step(
    'JSON inspection is visible and the nested cause can be expanded',
    async () => {
      await inspect('Invoice sync failed');
      await page.getByText('INVOICE_SYNC_FAILED', { exact: true }).waitFor();
      await page
        .getByRole('treeitem', {
          name: 'name: "INVOICE_SYNC_FAILED"',
          exact: true,
        })
        .waitFor();
      const bounds = await page.getByTestId('json-tree').boundingBox();
      assert.ok(bounds.y < 450, `Content begins at ${bounds.y}px`);
      assert.ok(
        bounds.height >= 350,
        `Readable content height is ${bounds.height}px`
      );
      for (const path of [
        '$/cause',
        '$/cause/response',
        '$/cause/response/body',
        '$/cause/response/body/errors',
        '$/cause/response/body/errors/0',
      ]) {
        await page
          .getByRole('button', { name: `Expand ${path}`, exact: true })
          .click();
      }
      await node('$/cause/response/body/errors/0/value').click();
      await page
        .getByRole('button', { name: 'Copy value', exact: true })
        .click();
      assert.equal(await clipboard(), 'DEMO-EXEMPT');
      await page
        .getByRole('button', { name: 'Copy path', exact: true })
        .click();
      assert.equal(await clipboard(), '/cause/response/body/errors/0/value');
    }
  );
  await screenshot('synthetic-nested-cause');
  await step(
    'collapse and reopen retain JSON expansion, selection and payload search',
    async () => {
      await find().fill('DEMO-EXEMPT');
      await page
        .getByRole('button', { name: 'Collapse details', exact: true })
        .click();
      assert.equal(await find().isVisible(), false);
      await page
        .getByRole('button', { name: 'Expand details', exact: true })
        .click();
      assert.equal(await find().inputValue(), 'DEMO-EXEMPT');
      assert.ok(await node('$/cause/response/body/errors/0/value').isVisible());
      await page
        .getByRole('button', { name: 'Focus details', exact: true })
        .click();
      await find().fill('');
    }
  );
  await step('original copy and stack preserve their contents', async () => {
    await page
      .getByRole('button', { name: 'Copy original', exact: true })
      .click();
    const full = await clipboard();
    assert.equal(JSON.parse(full).context.invoice, 'DEMO-INV-1042');
    await page.getByRole('tab', { name: 'Original', exact: true }).click();
    assert.equal(await page.getByTestId('raw-details').innerText(), full);
    await page.getByRole('tab', { name: 'Stack trace', exact: true }).click();
    assert.match(
      await page.getByTestId('stack-trace').innerText(),
      /syncInvoice.*\nmap.*\nexecute/s
    );
    await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  });
  await step(
    'search reveals matching branches without locking expansion',
    async () => {
      await page
        .getByRole('button', { name: 'Collapse all', exact: true })
        .click();
      await find().fill('cause');
      await page
        .getByRole('button', { name: 'Expand $/cause', exact: true })
        .click();
      assert.ok(await node('$/cause/response').isVisible());
      await page
        .getByRole('button', { name: 'Collapse $/cause', exact: true })
        .click();
      assert.equal(await node('$/cause/response').count(), 0);
      await find().fill('INVALID_TAX_CODE');
      assert.ok(await node('$/cause/response/body/errors/0/code').isVisible());
      await find().fill('name');
      await page
        .getByRole('button', { name: 'Next match', exact: true })
        .click();
      await page.getByText('2 of 2 matches', { exact: true }).waitFor();
      await page
        .getByRole('button', { name: 'Previous match', exact: true })
        .click();
      await page.getByText('1 of 2 matches', { exact: true }).waitFor();
      await find().fill('does-not-exist');
      await page.getByText('No matches', { exact: true }).waitFor();
      await find().fill('');
      assert.equal(await node('$/cause/response').count(), 0);
      await node('$/cause').focus();
      await page.keyboard.press('ArrowRight');
      assert.ok(await node('$/cause/response').isVisible());
      await page.keyboard.press('ArrowDown');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('data-json-path')
        ),
        '$/cause/name'
      );
      await page.keyboard.press('ArrowLeft');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('data-json-path')
        ),
        '$/cause'
      );
      await page
        .getByRole('button', { name: 'Expand all', exact: true })
        .click();
      assert.ok(await node('$/context/lines/2/amount').isVisible());
      await find().fill('INVALID_TAX_CODE');
    }
  );
  await screenshot('synthetic-payload-search');
  await step(
    'draft filters are explicit and all four filters combine on submit',
    async () => {
      await page
        .getByRole('button', { name: 'Show table', exact: true })
        .click();
      await page.getByLabel('Search titles and details').fill('unapplied');
      await page.getByText(/Unapplied changes. Showing:/).waitFor();
      assert.ok(await node('$/cause/response/body/errors/0/code').isVisible());
      await search('DEMO-EXEMPT');
      assert.equal(await page.locator('.MuiDataGrid-row').count(), 1);
      await reset();
      await choose('Time window', 'Last hour');
      await choose('Script', 'Customer export');
      await choose('Deployment', 'Customers · hourly');
      await choose('Log type', 'AUDIT');
      await search('');
      assert.equal(await page.locator('.MuiDataGrid-row').count(), 1);
      await page
        .getByRole('button', {
          name: 'Inspect Customer export completed',
          exact: true,
        })
        .waitFor();
      await reset();
      await choose('Deployment', 'Invoice sync · retry');
      await search('Invoice sync failed');
      await page
        .getByText('No logs match your filters', { exact: true })
        .waitFor();
    }
  );
  await screenshot('synthetic-empty');
  await step(
    'script and deployment lookups filter names and IDs, support keyboard selection and keep parent filters consistent',
    async () => {
      await reset();
      const valueIs = async (field, value) => {
        await page.waitForFunction(
          ({ id, value }) => document.getElementById(id)?.value === value,
          { id: await field.getAttribute('id'), value }
        );
        assert.equal(await field.inputValue(), value);
      };
      const labelSettled = id =>
        page
          .locator(`#${id}-label`)
          .evaluate(label =>
            Promise.all(
              label.getAnimations().map(animation => animation.finished)
            )
          );
      const script = page.getByRole('combobox', {
        name: 'Script',
        exact: true,
      });
      const deployment = page.getByRole('combobox', {
        name: 'Deployment',
        exact: true,
      });
      await script.fill('iNvOiCe');
      await page.getByRole('option').waitFor();
      assert.equal(await page.getByRole('option').count(), 1);
      await labelSettled('script-filter');
      await screenshot('synthetic-script-lookup');
      await script.press('ArrowDown');
      await script.press('Enter');
      await valueIs(script, 'Invoice sync');
      await deployment.fill('invoice');
      await page.getByRole('option').nth(1).waitFor();
      assert.equal(await page.getByRole('option').count(), 2);
      await deployment.fill('customdeploy_demo_invoice_retry');
      await page.getByRole('option').click();
      await valueIs(deployment, 'Invoice sync · retry');
      await script.fill('customscript_demo_customer');
      await page
        .getByRole('option')
        .filter({ hasText: 'Customer export' })
        .waitFor();
      await script.press('ArrowDown');
      await script.press('Enter');
      await valueIs(script, 'Customer export');
      await valueIs(deployment, '');
      await page
        .getByRole('button', { name: 'Clear script', exact: true })
        .click();
      await deployment.fill('203');
      await page.getByRole('option').click();
      await valueIs(script, 'Payment reconciliation');
      await page
        .getByRole('button', { name: 'Clear deployment', exact: true })
        .click();
      await valueIs(script, 'Payment reconciliation');
      await script.fill('101');
      await page.getByRole('option').click();
      await deployment.fill('invoice');
      await labelSettled('deployment-filter');
      await screenshot('synthetic-deployment-lookup');
      await deployment.press('Escape');
      await script.fill('not-a-script');
      await page.getByText('No matches', { exact: true }).waitFor();
      await script.press('Escape');
      await search('Invoice sync failed');
      await valueIs(script, 'Invoice sync');
      assert.equal(await page.locator('.MuiDataGrid-row').count(), 1);
      await reset();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: /^Filters/ }).click();
      await script.fill('invoice');
      await page.getByRole('listbox').waitFor();
      const dropdown = await page.getByRole('listbox').boundingBox();
      assert.ok(dropdown.x >= 0 && dropdown.x + dropdown.width <= 390);
      await labelSettled('script-filter');
      await screenshot('synthetic-mobile-lookup');
      await script.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });
      await reset();
      assert.ok(actionResponses.length > 0);
    }
  );
  await step('bounded next and previous result pages', async () => {
    await reset();
    const first = await page
      .locator('.MuiDataGrid-row')
      .first()
      .getAttribute('data-id');
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await idle();
    await page.getByText('Page 2', { exact: true }).waitFor();
    assert.notEqual(
      await page.locator('.MuiDataGrid-row').first().getAttribute('data-id'),
      first
    );
    await page
      .getByRole('button', { name: 'Previous page', exact: true })
      .click();
    await idle();
    assert.equal(
      await page.locator('.MuiDataGrid-row').first().getAttribute('data-id'),
      first
    );
    await choose('Time window', 'Last hour');
    await search('');
    assert.equal(await page.locator('.MuiDataGrid-row').count(), 5);
    assert.ok(
      await page
        .getByRole('button', { name: 'Next page', exact: true })
        .isDisabled()
    );
    await reset();
  });
  await step('plain text is a first-class searchable view', async () => {
    await inspect('Customer export completed');
    assert.equal(
      await page.getByRole('tab', { name: 'JSON', exact: true }).count(),
      0
    );
    assert.equal(
      await page.getByRole('tab', { name: 'Stack trace', exact: true }).count(),
      0
    );
    assert.equal(
      await page
        .getByRole('region', { name: 'Log details', exact: true })
        .getByRole('alert')
        .count(),
      0
    );
    const original = await page.getByTestId('raw-details').innerText();
    assert.match(original, /Processed: 42 synthetic customers/);
    await find().fill('synthetic');
    assert.equal(
      await page.getByTestId('raw-details').locator('mark').count(),
      1
    );
    assert.equal(await page.getByTestId('raw-details').innerText(), original);
    await page.getByRole('button', { name: 'Wrap text', exact: true }).click();
    assert.equal(
      await page
        .getByTestId('raw-details')
        .evaluate(el => getComputedStyle(el).whiteSpace),
      'pre'
    );
    await page
      .getByRole('button', { name: 'Copy original', exact: true })
      .click();
    assert.equal(await clipboard(), original);
  });
  await screenshot('synthetic-plain-text');
  await step(
    'truncated array opens formatted, preserves original, and supports find/copy/download',
    async () => {
      await inspect('Truncated upstream error');
      await page.getByRole('tab', { name: 'Formatted', exact: true }).waitFor();
      const formatted = await page
        .getByTestId('formatted-details')
        .textContent();
      assert.match(formatted, /^\[\n  \{\n    "action": "c",/);
      assert.ok(formatted.endsWith('"remaining_pay'));
      await page.getByText(/missing content cannot be recovered/).waitFor();
      await page
        .getByText('End of captured details · incomplete or invalid JSON', {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Expand all', exact: true })
          .count(),
        0
      );
      await find().fill('remaining_pay');
      assert.equal(
        await page.getByTestId('formatted-details').locator('mark').innerText(),
        'remaining_pay'
      );
      await page
        .getByRole('button', { name: 'Copy formatted text', exact: true })
        .click();
      assert.equal(await clipboard(), formatted);
      await page
        .getByRole('button', { name: 'Copy original', exact: true })
        .click();
      assert.equal(await clipboard(), fixtures.incompleteArray);
      await page.getByRole('tab', { name: 'Original', exact: true }).click();
      assert.equal(
        await page.getByTestId('raw-details').textContent(),
        fixtures.incompleteArray
      );
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download', exact: true }).click();
      const stream = await (await event).createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), fixtures.incompleteArray);
      await page.getByRole('tab', { name: 'Formatted', exact: true }).click();
      await page
        .getByRole('button', { name: 'Collapse details', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Expand details', exact: true })
        .click();
      assert.equal(await find().inputValue(), 'remaining_pay');
      assert.ok(await page.getByTestId('formatted-details').isVisible());
      await page
        .getByRole('button', { name: 'Focus details', exact: true })
        .click();
      await screenshot('intercepted-truncated-array');
      await page.setViewportSize({ width: 390, height: 844 });
      await activeMatchVisible(
        '[data-testid="formatted-details"]',
        '[data-active-match="true"]'
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      );
      await screenshot('intercepted-mobile-truncated-array');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page
        .getByRole('button', { name: 'Show table', exact: true })
        .waitFor();
    }
  );
  await step(
    'large payload pages, search scope, and complete download',
    async () => {
      await inspect('Large diagnostic payload');
      await page.getByText(/Large details · paged text/).waitFor();
      assert.ok(
        (await page.getByTestId('raw-details').innerText()).length <= 16384
      );
      await page.getByText(/find searches this page only/).waitFor();
      const first = await page.getByTestId('raw-details').innerText();
      await page
        .getByRole('button', { name: 'Next text page', exact: true })
        .click();
      assert.notEqual(await page.getByTestId('raw-details').innerText(), first);
      await find().fill('pending');
      assert.ok(
        (await page.getByTestId('raw-details').locator('mark').count()) > 100
      );
      await page
        .getByRole('button', { name: 'Next match', exact: true })
        .click();
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download', exact: true }).click();
      const download = await event;
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      assert.equal(
        JSON.parse(Buffer.concat(chunks).toString()).rows.length,
        10000
      );
    }
  );
  await step(
    'loading, denied, and query error states are distinct from zero results',
    async () => {
      const show = page.getByRole('button', {
        name: 'Show table',
        exact: true,
      });
      if (await show.isVisible()) await show.click();
      fixtures.failure = 'permission';
      await page
        .getByRole('button', { name: 'Search logs', exact: true })
        .click();
      await page
        .getByRole('region', { name: 'Execution logs', exact: true })
        .getByText('Loading…', { exact: true })
        .waitFor();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Your role cannot read these logs' })
        .waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Next page', exact: true })
          .count(),
        0
      );
      await page
        .getByRole('button', { name: 'Recheck access', exact: true })
        .waitFor();
    }
  );
  await screenshot('synthetic-permission-denied');
  await step('query retry and recovery', async () => {
    fixtures.failure = 'query';
    await page
      .getByRole('button', { name: 'Recheck access', exact: true })
      .click();
    await page.getByText('Could not load logs', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Could not load logs', { exact: true }).waitFor();
    fixtures.failure = null;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await idle();
    await reset();
  });
  await step(
    'mobile opens details immediately and Back preserves page and focus',
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole('button', { name: 'Next page', exact: true })
        .click();
      await idle();
      const first = page
        .locator('[data-testid="narrow-log-list"] article')
        .first()
        .getByRole('button', { name: /^Inspect/ });
      const name = await first.getAttribute('aria-label');
      await first.focus();
      await first.press('Enter');
      await find().waitFor();
      assert.ok(
        await page
          .getByRole('button', { name: 'Back to logs', exact: true })
          .isVisible()
      );
      const heading = await page
        .getByRole('heading', { level: 2 })
        .boundingBox();
      assert.ok(heading.y >= 0 && heading.y < 200);
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Search titles and details' })
          .isVisible(),
        false
      );
      await page
        .getByRole('button', { name: 'Back to logs', exact: true })
        .click();
      await page.getByText('Page 2', { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label')
        ),
        name
      );
      await reset();
      await inspect('Customer export completed');
      await find().fill('42');
      assert.equal(
        await page.getByTestId('raw-details').locator('mark').innerText(),
        '42'
      );
      await page.setViewportSize({ width: 390, height: 420 });
      await activeMatchVisible(
        '[data-testid="raw-details"]',
        '[data-active-match="true"]'
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      );
    }
  );
  await screenshot('synthetic-mobile-text');
  await step('narrow JSON layout with isolated test responses', async () => {
    await page
      .getByRole('button', { name: 'Back to logs', exact: true })
      .click();
    await inspect('Invoice sync failed');
    await find().fill('INVALID_TAX_CODE');
    assert.ok(await node('$/cause/response/body/errors/0/code').isVisible());
    await page.setViewportSize({ width: 320, height: 740 });
    await treeMatchVisible();
    await page.setViewportSize({ width: 320, height: 600 });
    await treeMatchVisible();
    assert.ok(
      await page
        .getByRole('button', { name: 'Next match', exact: true })
        .isDisabled()
    );
    await find().fill('name');
    await page.getByRole('button', { name: 'Next match', exact: true }).click();
    await activeMatchVisible(
      '[data-testid="json-tree"]',
      '[data-json-path="$/cause/name"]'
    );
    await find().fill('INVALID_TAX_CODE');
    await treeMatchVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    await treeMatchVisible();
    assert.ok(
      (await page.getByRole('tablist', { name: 'Detail view' }).boundingBox())
        .width >= 220
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
    assert.ok(actionResponses.length > 0);
  });
  await screenshot('synthetic-mobile-json');
  await step(
    'laptop and 200-percent-equivalent reflow remain usable',
    async () => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await treeMatchVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      );
      await page.setViewportSize({ width: 720, height: 450 });
      await treeMatchVisible();
      assert.ok(
        await page
          .getByRole('button', { name: 'Back to logs', exact: true })
          .isVisible()
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      );
    }
  );
  await screenshot('synthetic-reflow');
  await page.setViewportSize({ width: 1440, height: 900 });
  return {
    dataLoaded: false,
    notes: [
      'Synthetic fixtures only; no live NetSuite or authorization claim.',
    ],
    metrics: { syntheticRowsPerPage: 10 },
  };
}
