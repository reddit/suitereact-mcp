import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function loadAction(results) {
  const path = 'sdf/actions/getTableRowsFromSuiteql.ts';
  const { outputText } = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const mocks = {
    'N/log': { debug() {} },
    '../domain/suitereact': { TableCellAlignOptions: { CENTER: 'center' } },
    '../utils/nsQueryUtils': { getResultsFromSuiteQl: () => results },
  };
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(
    name => mocks[name],
    module.exports,
    module
  );
  return module.exports.getTableRowsFromSuiteql;
}

test('SuiteQL values containing a colon are returned unchanged', async () => {
  const getTableRows = await loadAction([
    {
      id: 7,
      status: 'Sales Order : Cancelled',
      createdtime: '9/2/2026 10:30 am',
      memo: 'Re: invoice',
      amount: -125.5,
      email: null,
    },
  ]);
  const { headers, rows } = getTableRows({ query: 'SELECT ...' });
  assert.deepEqual(
    headers.map(header => header.id),
    ['id', 'status', 'createdtime', 'memo', 'amount', 'email']
  );
  assert.deepEqual(rows, [
    {
      id: 7,
      type: 'suiteql',
      status: 'Sales Order : Cancelled',
      createdtime: '9/2/2026 10:30 am',
      memo: 'Re: invoice',
      amount: -125.5,
      email: null,
    },
  ]);
});

test('an empty result keeps the empty headers and rows contract', async () => {
  const getTableRows = await loadAction([]);
  assert.deepEqual(getTableRows({ query: 'SELECT ...' }), {
    headers: [],
    rows: [],
  });
});
