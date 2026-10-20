import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './load-ts.mjs';

const results = loadTs('apps/suiteql-bot/src/domain/results/resultTable.ts');

test('rejoins values the action split on a colon', () => {
  assert.equal(
    results.restoreValue({ value: 'Sales Order', label: 'Cancelled' }),
    'Sales Order : Cancelled'
  );
  assert.equal(
    results.restoreValue({ value: '10', label: '30 am' }),
    '10:30 am'
  );
  assert.equal(
    results.restoreValue({ value: '9/2/2026 10', label: '30 am' }),
    '9/2/2026 10:30 am'
  );
  assert.equal(results.restoreValue(null), null);
  assert.equal(results.restoreValue(-125.5), -125.5);
});

test('rows are keyed by position, so duplicate ids never merge', () => {
  const table = results.buildResultTable(
    [{ id: 'id' }, { id: 'line' }],
    [
      { id: 7, line: 0, type: 'suiteql' },
      { id: 7, line: 1, type: 'suiteql' },
    ]
  );
  assert.deepEqual(
    table.rows.map(row => [results.rowKey(row), row.id, row.line]),
    [
      [0, 7, 0],
      [1, 7, 1],
    ]
  );
  assert.equal('type' in table.rows[0], false, 'only selected fields are kept');
});

test('a selected column named like an internal key cannot replace the row key', () => {
  const table = results.buildResultTable(
    [{ id: '__row' }, { id: 'id' }],
    [
      { __row: 'x', id: 1 },
      { __row: 'x', id: 1 },
    ]
  );
  assert.deepEqual(table.rows.map(results.rowKey), [0, 1]);
  assert.deepEqual(
    table.rows.map(row => row.__row),
    ['x', 'x']
  );
});

test('column kinds give typed values without changing the displayed cell', () => {
  const table = results.buildResultTable(
    [{ id: 'id' }, { id: 'code' }, { id: 'created' }, { id: 'memo' }],
    [
      { id: 6401265, code: '00123', created: '10/28/2021', memo: 'Re: x' },
      { id: 9, code: '00099', created: '8/23/2021', memo: null },
    ]
  );
  assert.deepEqual(
    table.columns.map(column => column.kind),
    ['number', 'text', 'date', 'text']
  );
  assert.equal(table.rows[0].id, 6401265);
  assert.equal(table.rows[0].created, '10/28/2021');
  assert.equal(results.cellValue('number', '-3.25'), -3.25);
  assert.equal(
    results.cellValue('date', '8/23/2021').getTime(),
    new Date(2021, 7, 23).getTime()
  );
  assert.equal(results.cellValue('date', 'not a date'), null);
  assert.equal(results.cellValue('text', 7), '7');
  assert.equal(results.cellValue('number', null), null);
});

test('ISO timestamps are dates and order by instant, not text', () => {
  const table = results.buildResultTable(
    [{ id: 'ts' }],
    [
      { ts: '2026-09-01T09:00:00+02:00' },
      { ts: '2026-09-01T08:00:00Z' },
      { ts: '2026-09-01T07:30:00.250Z' },
    ]
  );
  assert.deepEqual(
    table.columns.map(column => column.kind),
    ['date']
  );
  assert.equal(table.rows[0].ts, '2026-09-01T09:00:00+02:00');
  const ordered = table.rows
    .map(row => row.ts)
    .sort(
      (a, b) =>
        results.cellValue('date', a).getTime() -
        results.cellValue('date', b).getTime()
    );
  assert.deepEqual(ordered, [
    '2026-09-01T09:00:00+02:00',
    '2026-09-01T07:30:00.250Z',
    '2026-09-01T08:00:00Z',
  ]);
  assert.equal(results.cellValue('date', '2026-09-01T25:00:00Z'), null);
});

test('CSV keeps raw values and neutralizes formula text', () => {
  const csv = results.tableToCsv({
    columns: [
      { field: 'memo', kind: 'text' },
      { field: 'amount', kind: 'number' },
    ],
    rows: [
      { memo: '=HYPERLINK("http://x","y")', amount: -125.5 },
      { memo: 'Sales Order : Cancelled', amount: '-3.25' },
      { memo: null, amount: null },
    ],
  });
  assert.deepEqual(csv.split('\r\n'), [
    '"memo","amount"',
    '"\'=HYPERLINK(""http://x"",""y"")","-125.5"',
    '"Sales Order : Cancelled","-3.25"',
    '"",""',
  ]);
});
