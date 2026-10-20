import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('DataGrid row loading does not disclose its proxy token to the console', async () => {
  const path = 'suitereact/src/components/NsReactDataGrid/index.tsx';
  const source = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX
  );
  function findLoader(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'getRowsFromTableProps'
    ) {
      return node.initializer;
    }
    return ts.forEachChild(node, findLoader);
  }
  const loader = findLoader(source);
  assert.ok(loader, 'DataGrid row loader must be covered by this regression');

  // Exercise the private loader without mounting MUI or contacting NetSuite.
  const code = ts.transpileModule(`(${loader.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const token = 'sentinel-proxy-token-must-not-reach-console';
  const currentSource = { type: 'suiteql', id: 'SELECT id FROM customer' };
  const messages = [];
  const queries = [];
  const loadRows = vm.runInNewContext(code, {
    props: { apiToken: token, source: currentSource },
    currentSource,
    NsReactTableSourceType: {
      SEARCH: 'search',
      QUERY: 'query',
      SUITEQL: 'suiteql',
    },
    getTableRowsFromSuiteql: query => queries.push(query),
    console: Object.fromEntries(
      ['log', 'warn', 'error', 'info', 'debug', 'table', 'dir', 'trace'].map(
        method => [method, (...args) => messages.push(args)]
      )
    ),
  });
  await loadRows();

  assert.deepEqual(queries, [currentSource.id]);
  assert.equal(
    JSON.stringify(messages).includes(token),
    false,
    'DataGrid diagnostics must not expose its proxy token'
  );
});
