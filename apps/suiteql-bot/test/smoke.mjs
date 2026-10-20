import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const AI_REQUEST = 'Show open sales orders from this month with customer name';
const AI_TITLE = 'Open Sales Orders This Month';
const AI_QUERY =
  "SELECT id, tranid FROM transaction WHERE type = 'SalesOrd' AND ROWNUM <= 5";
const MANUAL_QUERY =
  'select id, companyname from customer where email is not null and rownum <= 1';
const EXPECTED_MODELS = [
  'gpt-5.6-sol (ChatGPT)',
  'gpt-5.6-terra (ChatGPT)',
  'gpt-5.6-luna (ChatGPT)',
  'gpt-5.5-2026-04-23 (ChatGPT)',
  'gpt-5.4-2026-03-05 (ChatGPT)',
  'xiaomi/mimo-v2.5 (OpenRouter)',
  'deepseek/deepseek-v4-flash (OpenRouter)',
  'deepseek/deepseek-v4-pro (OpenRouter)',
  'minimax/minimax-m3 (OpenRouter)',
  'z-ai/glm-5.2 (OpenRouter)',
  'moonshotai/kimi-k2.6 (OpenRouter)',
  'anthropic/claude-sonnet-4.6 (OpenRouter)',
  'anthropic/claude-opus-4.7 (OpenRouter)',
  'anthropic/claude-opus-4.8 (OpenRouter)',
  'google/gemini-3-flash-preview (OpenRouter)',
  'google/gemini-3.1-flash-lite (OpenRouter)',
  'google/gemini-3.5-flash (OpenRouter)',
];
let generatedHistoryTitle = '';
let lastExecutedQuery = '';

function assertReadableQuery(query, label) {
  if (!/^SELECT\n/m.test(query) || !/\nFROM\n/m.test(query)) {
    throw new Error(`Expected ${label} to be formatted, received "${query}"`);
  }
}

function llmResponse() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            botExplanation: 'This query returns recent open sales orders.',
            structuredData: {
              historyTitle: AI_TITLE,
              suggestedQuery: AI_QUERY,
              queryType: 'suiteql',
              expectedFields: [
                { name: 'id', type: 'NUMBER', description: 'Internal ID' },
                {
                  name: 'tranid',
                  type: 'TEXT',
                  description: 'Transaction number',
                },
              ],
              confidence: 0.9,
              explanation: 'Returns open sales orders from this month.',
            },
          }),
        },
      },
    ],
  };
}

const SAMPLE = Array.from({ length: 25 }, (_, i) => ({
  id: 1000 + (i % 20),
  companyname:
    i === 2
      ? 'Northwind Analytics, Inc. (sample) — APAC Holdings'
      : `Sample Co ${i}`,
  email: i % 4 === 0 ? null : `ap${i}@example.com`,
  status: i % 3 === 0 ? 'Sales Order : Pending Fulfillment' : 'Invoice : Open',
  memo: i === 1 ? '=SUM(A1:A9)' : `Memo ${i}`,
  createdtime: '9/2/2026 10:30 am',
  amount: i % 5 === 0 ? -125.5 : 1234.5 + i,
  datecreated: `9/${i + 1}/2026`,
}));
const BIG = Array.from({ length: 5000 }, (_, i) => ({
  id: i + 1,
  tranid: `INV${100000 + i}`,
}));

// Mirrors getTableRowsFromSuiteql, including its split of one-colon strings.
function actionPayload(results) {
  if (!results.length) return { headers: [], rows: [] };
  const headers = Object.keys(results[0]).map(id => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  }));
  const rows = results.map((result, index) => {
    const row = { id: index, type: 'suiteql' };
    for (const [key, value] of Object.entries(result)) {
      const parts = typeof value === 'string' ? value.split(':') : [];
      row[key] =
        parts.length === 2
          ? { value: parts[0].trim(), label: parts[1].trim() }
          : (value ?? null);
    }
    return row;
  });
  return { headers, rows };
}

async function installMocks(page) {
  await page.route('**/api/handle-llm-request', async route => {
    await route.fulfill({ status: 200, json: llmResponse() });
  });
  await page.route('**/api/handle-action', async route => {
    const query = route.request().postDataJSON().inputData?.query ?? '';
    lastExecutedQuery = query;
    if (/slow_first/.test(query)) await new Promise(r => setTimeout(r, 1200));
    let json;
    if (/broken/.test(query)) {
      json = {
        error: {
          success: false,
          error: `ACTION: getTableRowsFromSuiteql: [SSS_SEARCH_ERROR_OCCURRED] Search error occurred: Unknown identifier 'broken'. | Query: ${query}`,
          message: "Search error occurred: Unknown identifier 'broken'.",
        },
      };
    } else if (/nothing/.test(query)) json = actionPayload([]);
    else if (/\bbig\b/.test(query)) json = actionPayload(BIG);
    else json = actionPayload(SAMPLE);
    await route.fulfill({ status: 200, json });
  });
}

async function runFixtureChecks({ page, step, screenshot }) {
  const editor = page.getByRole('textbox', { name: 'SuiteQL query' });
  const summary = page.getByTestId('results-summary');
  const runButton = page.getByRole('button', { name: 'Run query' }).first();
  const run = async query => {
    await editor.fill(query);
    await runButton.click();
    await runButton.waitFor();
  };
  const firstRowCells = () =>
    page
      .locator('.MuiDataGrid-row')
      .first()
      .locator('.MuiDataGrid-cell')
      .allInnerTexts();

  await step(
    'results show NetSuite values verbatim, one row per result',
    async () => {
      await run('SELECT id, companyname FROM customer WHERE ROWNUM <= 25');
      await page.locator('.MuiDataGrid-row').first().waitFor();
      assert.deepEqual(
        await page.locator('.MuiDataGrid-columnHeaderTitle').allInnerTexts(),
        [
          'id',
          'companyname',
          'email',
          'status',
          'memo',
          'createdtime',
          'amount',
          'datecreated',
        ]
      );
      assert.deepEqual((await firstRowCells()).slice(0, 8), [
        '1000',
        'Sample Co 0',
        '',
        'Sales Order : Pending Fulfillment',
        'Memo 0',
        '9/2/2026 10:30 am',
        '-125.5',
        '9/1/2026',
      ]);
      assert.match(await summary.innerText(), /^25 rows · 8 columns · /);
      await page
        .locator('.MuiDataGrid-columnHeader[data-field="datecreated"]')
        .click();
      const dates = await page
        .locator('.MuiDataGrid-row [data-field="datecreated"]')
        .allInnerTexts();
      assert.deepEqual(dates.slice(0, 3), ['9/1/2026', '9/2/2026', '9/3/2026']);
      await page.getByRole('button', { name: 'Filters' }).click();
      const filterForm = page.locator('.MuiDataGrid-filterForm');
      await filterForm.waitFor();
      await filterForm.getByRole('combobox', { name: 'Columns' }).click();
      await page.getByRole('listbox').waitFor();
      await page
        .getByRole('option', { name: 'datecreated', exact: true })
        .click();
      await page.getByRole('listbox').waitFor({ state: 'detached' });
      await filterForm.getByRole('combobox', { name: 'Operator' }).click();
      await page
        .getByRole('option', { name: 'is after', exact: true })
        .waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await screenshot('verbatim-results');
    }
  );

  await step(
    'CSV export keeps raw values and neutralizes formulas',
    async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export CSV' }).click(),
      ]);
      assert.match(
        download.suggestedFilename(),
        /^suiteql-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/
      );
      const lines = (await readFile(await download.path(), 'utf8')).split(
        '\r\n'
      );
      assert.equal(lines.length, 26);
      assert.equal(
        lines[0],
        '"id","companyname","email","status","memo","createdtime","amount","datecreated"'
      );
      assert.equal(
        lines[1],
        '"1000","Sample Co 0","","Sales Order : Pending Fulfillment","Memo 0","9/2/2026 10:30 am","-125.5","9/1/2026"'
      );
      assert.match(lines[2], /,"'=SUM\(A1 : A9\)",/);
    }
  );

  await step('edited queries are flagged and the latest run wins', async () => {
    await run("SELECT id FROM customer WHERE memo = 'a b'");
    await editor.fill("SELECT id FROM customer WHERE memo = 'a  b'");
    await page.getByText('Edits not run').waitFor();
    await editor.fill('SELECT id FROM employee');
    await page.getByText('Edits not run').waitFor();
    await screenshot('edits-not-run');
    await editor.fill('SELECT id FROM slow_first');
    await editor.press('Control+Enter');
    await editor.fill('SELECT id, tranid FROM big');
    await editor.press('Control+Enter');
    await page.waitForTimeout(1600);
    assert.match(await summary.innerText(), /^5,000\+ rows · 2 columns/);
    await page.getByText('Edits not run').waitFor({ state: 'hidden' });
    const capped = page
      .getByRole('alert')
      .filter({ hasText: 'NetSuite returned its limit of 5,000 rows' });
    await capped.waitFor();
    await screenshot('row-limit');
  });

  await step(
    'a failed query shows its code and hint until the next run',
    async () => {
      await run('SELECT broken FROM customer');
      const failure = page
        .getByRole('alert')
        .filter({ hasText: 'Query failed' });
      await failure.waitFor();
      assert.match(await failure.innerText(), /SSS_SEARCH_ERROR_OCCURRED/);
      assert.match(await failure.innerText(), /Unknown identifier 'broken'/);
      assert.match(await failure.innerText(), /properly qualified/);
      assert.equal(await summary.innerText(), 'Last run failed');
      await screenshot('query-error');
      await run('SELECT id FROM nothing');
      await page.getByText('The query returned no rows').waitFor();
      await failure.waitFor({ state: 'hidden' });
    }
  );
}

export async function runSmoke({ page, live, step, screenshot }) {
  await step('critical controls', async () => {
    await page
      .getByRole('heading', { name: 'SuiteQL Bot', level: 1 })
      .waitFor();
    await page.getByRole('textbox', { name: 'SuiteQL query' }).waitFor();
    await page.getByRole('button', { name: 'Run query' }).first().waitFor();
    await page.getByLabel('open query history').waitFor();
    await page.getByPlaceholder(/Show open sales orders/).waitFor();
  });

  await step('query editor and assistant are resizable', async () => {
    const editor = page.getByPlaceholder('SELECT ... FROM ... WHERE ...');
    const editorResize = await editor.evaluate(
      element => getComputedStyle(element).resize
    );
    if (editorResize !== 'vertical') {
      throw new Error(
        `Expected a vertically resizable query editor, received "${editorResize}".`
      );
    }

    const editorBefore = await editor.boundingBox();
    if (!editorBefore) throw new Error('Query editor is not visible.');
    await page.mouse.move(
      editorBefore.x + editorBefore.width - 2,
      editorBefore.y + editorBefore.height - 2
    );
    await page.mouse.down();
    await page.mouse.move(
      editorBefore.x + editorBefore.width - 2,
      editorBefore.y + editorBefore.height + 72,
      { steps: 5 }
    );
    await page.mouse.up();
    const editorAfter = await editor.boundingBox();
    if (!editorAfter || editorAfter.height < editorBefore.height + 40) {
      throw new Error(
        `Expected query editor height to grow from ${editorBefore.height}px, received ${editorAfter?.height}px.`
      );
    }

    const assistant = page.getByTestId('ai-assistant-panel');
    const resizeHandle = page.getByRole('separator', {
      name: 'resize AI assistant',
    });
    const assistantBefore = await assistant.boundingBox();
    const handleBox = await resizeHandle.boundingBox();
    if (!assistantBefore || !handleBox) {
      throw new Error('AI assistant resize controls are not visible.');
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 120);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 96, handleBox.y + 120, { steps: 5 });
    await page.mouse.up();
    const assistantAfterDrag = await assistant.boundingBox();
    if (
      !assistantAfterDrag ||
      assistantAfterDrag.width < assistantBefore.width + 70
    ) {
      throw new Error(
        `Expected assistant width to grow from ${assistantBefore.width}px, received ${assistantAfterDrag?.width}px.`
      );
    }

    await resizeHandle.focus();
    const widthBeforeKeyboard = Number(
      await resizeHandle.getAttribute('aria-valuenow')
    );
    await resizeHandle.press('ArrowRight');
    await page.waitForFunction(
      expectedWidth =>
        Number(
          document
            .querySelector('[data-testid="ai-assistant-resize-handle"]')
            ?.getAttribute('aria-valuenow')
        ) === expectedWidth,
      widthBeforeKeyboard - 24
    );
    await page.waitForTimeout(250);
    const assistantAfterKeyboard = await assistant.boundingBox();
    if (
      !assistantAfterKeyboard ||
      assistantAfterKeyboard.width >= assistantAfterDrag.width
    ) {
      throw new Error('Expected ArrowRight to narrow the AI assistant.');
    }
  });
  await screenshot('resizable-workspace');

  if (!live) await installMocks(page);

  await step('approved model catalog', async () => {
    const modelSelect = page.getByRole('combobox').first();
    const selectedModel = (await modelSelect.innerText()).trim();
    if (selectedModel !== EXPECTED_MODELS[0]) {
      throw new Error(
        `Expected default model "${EXPECTED_MODELS[0]}", received "${selectedModel}"`
      );
    }

    await modelSelect.click();
    const listbox = page.getByRole('listbox');
    await listbox.waitFor();
    const modelLabels = (await listbox.getByRole('option').allInnerTexts()).map(
      label => label.trim()
    );
    if (JSON.stringify(modelLabels) !== JSON.stringify(EXPECTED_MODELS)) {
      throw new Error(`Model catalog mismatch: ${JSON.stringify(modelLabels)}`);
    }

    await listbox
      .getByRole('option', { name: EXPECTED_MODELS.at(-1), exact: true })
      .click();
    const changedModel = (await modelSelect.innerText()).trim();
    if (changedModel !== EXPECTED_MODELS.at(-1)) {
      throw new Error(
        `Expected selected model "${EXPECTED_MODELS.at(-1)}", received "${changedModel}"`
      );
    }

    await modelSelect.click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: EXPECTED_MODELS[0], exact: true })
      .click();
  });
  await screenshot('approved-model-catalog');

  await step('LLM title follows generated query into history', async () => {
    const assistant = page.getByPlaceholder(/Show open sales orders/);
    await assistant.fill(AI_REQUEST);
    const actionResponse = page.waitForResponse(response =>
      response.url().includes('/api/handle-action')
    );
    await assistant.press('Enter');

    const response = await actionResponse;
    if (!response.ok()) {
      throw new Error(`SuiteQL action failed with HTTP ${response.status()}`);
    }
    const responseBody = await response.json();
    const responseRows = Array.isArray(responseBody.rows)
      ? responseBody.rows
      : responseBody.data?.rows;
    if (!Array.isArray(responseRows)) {
      throw new Error('SuiteQL action response did not include a rows array.');
    }
    if (responseRows.length > 0) {
      await page
        .locator('.MuiDataGrid-row')
        .first()
        .waitFor({ state: 'visible', timeout: live ? 120_000 : 15_000 });
    } else if (!live) {
      throw new Error('Expected the mocked SuiteQL action to return one row.');
    }
    const formattedQuery = await page
      .getByPlaceholder('SELECT ... FROM ... WHERE ...')
      .inputValue();
    assertReadableQuery(formattedQuery, 'AI-generated query');
    if (!live && lastExecutedQuery !== formattedQuery) {
      throw new Error(
        'Executed query did not match the formatted editor value.'
      );
    }
    if (!live) {
      const reply = page
        .getByTestId('ai-assistant-panel')
        .getByText('This query returns recent open sales orders.', {
          exact: false,
        });
      await reply.waitFor();
      assert.doesNotMatch(await reply.innerText(), /<p>|<pre>/);
      await page.getByText('From the assistant:').waitFor();
    }
    await page.getByLabel('open query history').click();

    const firstEntry = page.getByTestId('history-entry').first();
    const title = (
      await firstEntry.getByTestId('history-title').innerText()
    ).trim();
    const query = (
      await firstEntry.getByTestId('history-query').innerText()
    ).trim();

    if (!title || /^select\b/i.test(title)) {
      throw new Error(
        `Expected a human-readable LLM title, received "${title}"`
      );
    }
    if (!live && title !== AI_TITLE) {
      throw new Error(`Expected "${AI_TITLE}", received "${title}"`);
    }
    generatedHistoryTitle = title;
    if (!/^select\b/i.test(query)) {
      throw new Error(
        `Expected SQL beneath the history title, received "${query}"`
      );
    }
    await page.waitForTimeout(300);
  });
  await screenshot('llm-history-title');

  await step('assistant conversation survives the breakpoint', async () => {
    await page.keyboard.press('Escape');
    await page
      .getByTestId('history-entry')
      .first()
      .waitFor({ state: 'hidden' });
    const desktop = page.viewportSize();
    const panel = page.getByTestId('ai-assistant-panel');
    const draft = page.getByPlaceholder(/Show open sales orders/);
    const draftText = 'draft that must survive a resize';
    await draft.fill(draftText);
    const assertKept = async label => {
      await panel.getByText(AI_REQUEST).first().waitFor();
      assert.equal(
        await page.getByPlaceholder(/Show open sales orders/).inputValue(),
        draftText,
        `draft kept ${label}`
      );
    };
    await page.setViewportSize({ width: 700, height: desktop.height });
    await page.getByTestId('ai-assistant-resize-handle').waitFor({
      state: 'detached',
    });
    await draft.waitFor();
    await assertKept('on the narrow layout');
    await page.getByRole('dialog', { name: 'Assistant' }).waitFor();
    await page.setViewportSize(desktop);
    await page.getByTestId('ai-assistant-resize-handle').waitFor();
    await assertKept('after returning to the wide layout');
    await draft.fill('');
  });

  await step('narrow assistant overlay manages keyboard focus', async () => {
    const desktop = page.viewportSize();
    await page.setViewportSize({ width: 700, height: desktop.height });
    await page
      .getByTestId('ai-assistant-resize-handle')
      .waitFor({ state: 'detached' });
    const dialog = page.getByRole('dialog', { name: 'Assistant' });
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: 'Close assistant' }).click();
      await dialog.waitFor({ state: 'hidden' });
    }
    const focusInside = () =>
      page.evaluate(
        () =>
          !!document.activeElement?.closest(
            '[role="dialog"][aria-label="Assistant"]'
          )
      );
    const expectFocusInside = async () => {
      const deadline = Date.now() + 5000;
      while (!(await focusInside())) {
        if (Date.now() > deadline)
          throw new Error('focus did not move into the Assistant overlay');
        await page.waitForTimeout(100);
      }
    };
    const toggle = page.getByRole('button', { name: 'AI assistant' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    await expectFocusInside();
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      assert.equal(await focusInside(), true, `Tab ${i + 1} stays inside`);
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute('aria-label')
      ),
      'AI assistant',
      'focus returns to the Assistant button'
    );
    await page.setViewportSize(desktop);
  });

  await step(
    'narrow assistant model menu works from the keyboard',
    async () => {
      const desktop = page.viewportSize();
      await page.setViewportSize({ width: 700, height: desktop.height });
      const dialog = page.getByRole('dialog', { name: 'Assistant' });
      await page.getByRole('button', { name: 'AI assistant' }).click();
      await dialog.waitFor();
      const modelSelect = dialog.getByRole('combobox').first();
      const listbox = page.getByRole('listbox');
      const choose = async (key, expected) => {
        await modelSelect.focus();
        await page.keyboard.press('Enter');
        await listbox.waitFor();
        await page.keyboard.press(key);
        await page.keyboard.press('Enter');
        await listbox.waitFor({ state: 'hidden' });
        assert.equal((await modelSelect.innerText()).trim(), expected);
        assert.equal(await dialog.isVisible(), true, 'assistant stays open');
      };
      await choose('ArrowDown', EXPECTED_MODELS[1]);
      await modelSelect.focus();
      await page.keyboard.press('Enter');
      await listbox.waitFor();
      await page.keyboard.press('Escape');
      await listbox.waitFor({ state: 'hidden' });
      assert.equal(
        await dialog.isVisible(),
        true,
        'Escape closes only the menu'
      );
      await choose('ArrowUp', EXPECTED_MODELS[0]);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.setViewportSize(desktop);
    }
  );

  await step('query history persists after reload', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('open query history').click();

    const persistedTitle = (
      await page
        .getByTestId('history-entry')
        .first()
        .getByTestId('history-title')
        .innerText()
    ).trim();
    if (!persistedTitle || /^select\b/i.test(persistedTitle)) {
      throw new Error(
        `Expected persisted query history after reload, received "${persistedTitle}"`
      );
    }
    if (persistedTitle !== generatedHistoryTitle) {
      throw new Error(
        `Expected persisted title "${generatedHistoryTitle}", received "${persistedTitle}"`
      );
    }
  });

  await step('manual query gets a readable fallback title', async () => {
    await page.getByTestId('history-entry').first().click();
    const editor = page.getByPlaceholder('SELECT ... FROM ... WHERE ...');
    await editor.fill(MANUAL_QUERY);
    await editor.blur();
    const formattedQuery = await editor.inputValue();
    assertReadableQuery(formattedQuery, 'manual query');
    const actionResponse = page.waitForResponse(response =>
      response.url().includes('/api/handle-action')
    );
    await page.getByRole('button', { name: 'Run query' }).first().click();
    await actionResponse;
    if (!live && lastExecutedQuery !== formattedQuery) {
      throw new Error(
        'Manual query was not formatted before action execution.'
      );
    }
    await screenshot('formatted-query');
    await page.getByLabel('open query history').click();

    const title = (
      await page
        .getByTestId('history-entry')
        .first()
        .getByTestId('history-title')
        .innerText()
    ).trim();
    if (title !== 'Customer query') {
      throw new Error(`Expected "Customer query", received "${title}"`);
    }
  });

  await step('query history entry can be removed permanently', async () => {
    const entries = page.getByTestId('history-entry');
    const countBefore = await entries.count();
    const manualEntry = entries.filter({ hasText: 'Customer query' }).first();
    await manualEntry
      .getByRole('button', { name: /remove .* from query history/i })
      .click();

    await manualEntry.waitFor({ state: 'detached' });
    const countAfter = await entries.count();
    if (countAfter !== countBefore - 1) {
      throw new Error(
        `Expected one history entry to be removed; count changed from ${countBefore} to ${countAfter}`
      );
    }

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('open query history').click();
    if (
      (await page
        .getByTestId('history-title')
        .filter({ hasText: 'Customer query' })
        .count()) !== 0
    ) {
      throw new Error('Removed query returned after reload.');
    }
    await page
      .getByTestId('history-title')
      .filter({ hasText: generatedHistoryTitle })
      .waitFor({ state: 'visible' });
    await page.waitForTimeout(600);
  });
  await screenshot('history-entry-removed');

  if (!live) {
    await page.keyboard.press('Escape');
    await runFixtureChecks({ page, step, screenshot });
  }

  return {
    dataLoaded: true,
    notes: [
      live
        ? 'Verified automatic query formatting and persistent history through the live proxy.'
        : 'Fixture-based: verified formatting, verbatim results, CSV, run ordering, row limit, errors, and persistent history with intercepted API responses.',
    ],
  };
}
