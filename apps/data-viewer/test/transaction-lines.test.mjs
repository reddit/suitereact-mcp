import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const query = loadTs('apps/data-viewer/src/domain/query.ts');
const { DEFAULT_FILTERS } = loadTs('apps/data-viewer/src/domain/types.ts');
const params = (overrides = {}) => ({
  recordType: 'transaction',
  filters: { ...DEFAULT_FILTERS },
  ...overrides,
});
const column = (field, type = 'string') => ({ field, type, label: field });
const filter = (field, operator, value = '') => ({
  id: field,
  field,
  operator,
  value,
});
const lineParams = params({ dynamicColumns: [column('transactionline.memo')] });

test('header queries retain one row per transaction and use the original cursor', () => {
  const sql = query.buildSuiteQlQuery(params(), { id: 100 });
  assert.doesNotMatch(sql, /TransactionLine|line_id/);
  assert.match(sql, /t.id > 100/);
  assert.match(sql, /ORDER BY t.id ASC$/);
  assert.doesNotMatch(query.buildCountQuery(params()), /JOIN|EXISTS/);
});

test('line queries disambiguate header fields, reference display values, and line identity', () => {
  const sql = query.buildSuiteQlQuery(
    params({
      dynamicColumns: [
        column('memo'),
        column('transactionline.memo'),
        column('transactionline.department', 'enum'),
        column('transactionline.id', 'number'),
      ],
    })
  );
  assert.match(sql, /t.memo AS memo/);
  assert.match(sql, /tl.memo AS line_memo/);
  assert.match(sql, /BUILTIN.DF\(tl.department\) AS line_department/);
  assert.equal((sql.match(/AS line_id/g) || []).length, 1);
  assert.match(sql, /INNER JOIN TransactionLine tl ON tl.transaction = t.id/);
  assert.match(sql, /ORDER BY t.id ASC, tl.id ASC$/);
  assert.doesNotMatch(sql, /tl.mainline =|tl.taxline =/);
});

test('line filters without columns use one EXISTS so all predicates match the same line', () => {
  const input = params({
    dynamicFilters: [
      filter('transactionline.mainline', 'is_false'),
      filter('transactionline.quantity', 'greater_than', '2'),
      filter('memo', 'contains', "owner's"),
    ],
  });
  for (const sql of [
    query.buildSuiteQlQuery(input),
    query.buildCountQuery(input),
  ]) {
    assert.equal((sql.match(/EXISTS/g) || []).length, 1);
    assert.doesNotMatch(sql, /INNER JOIN/);
    assert.match(sql, /tl.mainline = 'F'/);
    assert.match(sql, /tl.quantity > 2/);
    assert.match(sql, /UPPER\(t.memo\) LIKE UPPER\('%owner''s%'\)/);
  }
});

test('line result count shares the data join and boolean filters', () => {
  const input = {
    ...lineParams,
    dynamicFilters: [filter('transactionline.taxline', 'is_false')],
  };
  for (const sql of [
    query.buildSuiteQlQuery(input),
    query.buildCountQuery(input),
  ]) {
    assert.match(sql, /INNER JOIN TransactionLine/);
    assert.match(sql, /tl.taxline = 'F'/);
    assert.doesNotMatch(sql, /EXISTS/);
  }
});

test('a page boundary inside a transaction advances using line ID, including line zero', () => {
  assert.match(
    query.buildSuiteQlQuery(lineParams, { id: 100, lineId: 0 }),
    /\(t.id > 100 OR \(t.id = 100 AND tl.id > 0\)\)/
  );
  assert.deepEqual(
    query.getNextCursor(lineParams, [
      { id: '100', line_id: '0', __rowId: '100/0' },
    ]),
    { id: 100, lineId: 0 }
  );
  assert.equal(
    query.cursorAdvances({ id: 100, lineId: 4999 }, { id: 100, lineId: 5000 }),
    true
  );
  assert.equal(
    query.cursorAdvances({ id: 100, lineId: 5000 }, { id: 101, lineId: 0 }),
    true
  );
  assert.equal(
    query.cursorAdvances({ id: 100, lineId: 5000 }, { id: 100, lineId: 5000 }),
    false
  );
  assert.throws(
    () => query.buildSuiteQlQuery(lineParams, { id: 100 }),
    /Invalid pagination cursor/
  );
  assert.throws(
    () => query.getNextCursor(lineParams, [{ id: 100, __rowId: '100' }]),
    /Invalid record or line ID/
  );
  assert.equal(query.getNextCursor(lineParams, []), undefined);
});

test('empty text filters are inactive; boolean filters need no value', () => {
  assert.equal(
    query.isActiveFilter(filter('transactionline.mainline', 'is_true')),
    true
  );
  assert.equal(
    query.isActiveFilter(filter('transactionline.taxline', 'is_false')),
    true
  );
  assert.equal(
    query.isActiveFilter(filter('transactionline.memo', 'contains', '  ')),
    false
  );
  assert.doesNotMatch(
    query.buildSuiteQlQuery(
      params({ dynamicFilters: [filter('transactionline.memo', 'contains')] })
    ),
    /EXISTS/
  );
});

test('unsupported sources and identifiers cannot be interpolated into SQL', () => {
  for (const field of [
    'transactionline.memo;DROP TABLE t',
    'transactionline.memo.foo',
    'other.memo',
  ]) {
    assert.throws(
      () =>
        query.buildSuiteQlQuery(params({ dynamicColumns: [column(field)] })),
      /Unsupported field/
    );
  }
  for (const recordType of ['customer', 'employee']) {
    assert.throws(
      () =>
        query.buildSuiteQlQuery(
          params({
            recordType,
            dynamicColumns: [column('transactionline.memo')],
          })
        ),
      /Unsupported field/
    );
    const sql = query.buildSuiteQlQuery(params({ recordType }), { id: 42 });
    assert.doesNotMatch(sql, /TransactionLine/);
    assert.match(sql, /\.id > 42/);
  }
});

function schemaModule(runSuiteQL) {
  return loadTs('sdf/actions/_dataViewer/transactionLineSchema.ts', {
    'N/query': { runSuiteQL },
  });
}

test('schema uses SuiteQL standard IDs and discovers normalized custom column metadata', () => {
  const { fields, warnings } = schemaModule(({ query: sql }) => {
    assert.match(sql, /FROM CustomField WHERE fieldtype = 'COLUMN'/);
    return {
      asMappedResults: () => [
        { scriptid: 'CUSTCOL_COST', name: 'Cost', fieldvaluetype: 'Currency' },
        {
          scriptid: 'CUSTCOL_TEAM',
          name: 'Team',
          fieldvaluetype: 'List/Record',
        },
        { scriptid: 'CUSTCOL_FLAG', name: 'Flag', fieldvaluetype: 'CheckBox' },
        { scriptid: 'CUSTCOL_BAD.ID', name: 'Invalid', fieldvaluetype: 'Text' },
      ],
    };
  }).getTransactionLineFields();
  assert.deepEqual(warnings, []);
  assert.equal(
    fields.find(f => f.field === 'transactionline.custcol_cost').type,
    'number'
  );
  assert.equal(
    fields.find(f => f.field === 'transactionline.custcol_team').type,
    'enum'
  );
  assert.equal(
    fields.find(f => f.field === 'transactionline.custcol_flag').type,
    'boolean'
  );
  assert(fields.some(f => f.field === 'transactionline.foreignamount'));
  assert(
    !fields.some(
      f => f.field === 'transactionline.amount' || f.field.includes('bad.id')
    )
  );
});

test('metadata permission failure keeps standard fields and reports incomplete discovery', () => {
  const result = schemaModule(() => {
    throw new Error('Permission denied');
  }).getTransactionLineFields();
  assert(result.fields.length > 0);
  assert(result.fields.every(field => !field.custom));
  assert.match(
    result.warnings.join(' '),
    /Custom transaction line fields could not be loaded/
  );
});

test('schema action exposes line metadata only for an opted-in transaction request', () => {
  let metadataCalls = 0;
  const action = loadTs('sdf/actions/getRecordFieldSchema.ts', {
    'N/log': { debug() {} },
    'N/record': { create: () => ({ getFields: () => [] }) },
    'N/query': {
      runSuiteQL: () => {
        metadataCalls++;
        return { asMappedResults: () => [] };
      },
    },
  }).getRecordFieldSchema;
  assert.equal(
    action({ recordType: 'transaction' }).transactionLineFieldsIncluded,
    undefined
  );
  assert.equal(
    action({ recordType: 'customer', includeTransactionLineFields: true })
      .transactionLineFieldsIncluded,
    undefined
  );
  const result = action({
    recordType: 'transaction',
    includeTransactionLineFields: true,
  });
  assert.equal(result.transactionLineFieldsIncluded, true);
  assert.equal(result.fieldCount, result.fields.length);
  assert.equal(metadataCalls, 1);
});

test('response normalization preserves transaction links, unique line rows and null column aliases', async () => {
  const columnTypes = loadTs('suitereact/src/utils/dataGridColumnTypes.ts');
  const actions = loadTs(
    'apps/data-viewer/src/domain/actions/clientActions.ts',
    {
      suitereact: {
        ...columnTypes,
        handleRestletAction: async () => ({
          headers: [
            { id: 'id', label: 'Id' },
            { id: 'line_id', label: 'Line_id' },
            { id: 'memo', label: 'Memo' },
            { id: 'line_memo', label: 'Line_memo' },
          ],
          rows: [
            { id: 100, line_id: 0, memo: 'header', line_memo: 'first' },
            { id: 100, line_id: 1, memo: 'header', line_memo: 'second' },
          ],
        }),
      },
    }
  );
  const result = await actions.fetchDataViewerRecords(
    params({
      dynamicColumns: [
        column('transactionline.memo'),
        column('transactionline.custcol_empty'),
      ],
    })
  );
  assert.deepEqual(
    result.rows.map(row => row.id),
    [100, 100]
  );
  assert.deepEqual(
    result.rows.map(row => row.__rowId),
    ['100/0', '100/1']
  );
  assert.deepEqual(
    result.rows.map(row => row.line_memo),
    ['first', 'second']
  );
  assert(result.columns.some(c => c.field === 'line_custcol_empty'));
  assert(
    !result.columns.some(c => c.field === 'transactionline.custcol_empty')
  );
  assert.equal(result.rows[0].line_custcol_empty, '');
  assert.deepEqual(result.nextCursor, { id: 100, lineId: 1 });
});

test('live header capitalization still maps to readable labels; IDs keep raw digits', async () => {
  const columnTypes = loadTs('suitereact/src/utils/dataGridColumnTypes.ts');
  const actions = loadTs(
    'apps/data-viewer/src/domain/actions/clientActions.ts',
    {
      suitereact: {
        ...columnTypes,
        handleRestletAction: async () => ({
          headers: [
            { id: 'id', label: 'Id' },
            { id: 'tranid', label: 'Tranid' },
            { id: 'foreigntotal', label: 'Foreigntotal' },
            { id: 'custbody_region', label: 'Custbody_region' },
            { id: 'approver', label: 'Approving Manager' },
          ],
          rows: [
            {
              id: 1234567,
              tranid: 'INV-1',
              foreigntotal: -25.5,
              custbody_region: 'West',
              approver: 'Sample Person',
            },
          ],
        }),
      },
    }
  );
  const result = await actions.fetchDataViewerRecords(
    params({ recordType: 'customer' })
  );
  const label = field =>
    result.columns.find(c => c.field === field)?.headerName;
  assert.equal(label('id'), 'Internal ID');
  assert.equal(label('tranid'), 'Transaction');
  assert.equal(label('foreigntotal'), 'Transaction total');
  assert.equal(label('custbody_region'), 'Custbody region');
  assert.equal(label('approver'), 'Approving Manager');
  const id = result.columns.find(c => c.field === 'id');
  assert.equal(id.valueFormatter(1234567), 1234567);
});

test('CSV cells neutralize spreadsheet formulas but keep real numbers', () => {
  const { csvCell } = loadTs(
    'apps/data-viewer/src/domain/actions/clientActions.ts',
    { suitereact: {} }
  );
  assert.equal(
    csvCell('=HYPERLINK("https://attacker.example/","View invoice")'),
    `"'=HYPERLINK(""https://attacker.example/"",""View invoice"")"`
  );
  for (const attack of ['+1+2', '-2+3', '@SUM(A1)', '\t=1', '\r=1'])
    assert.equal(csvCell(attack).slice(0, 2), `"'`, JSON.stringify(attack));
  assert.equal(csvCell(-100), '"-100"');
  assert.equal(csvCell('-100.25'), '"-100.25"');
  assert.equal(csvCell('Line memo'), '"Line memo"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(0), '"0"');
});

test('client rejects an old schema service and omits proxy configuration in production', async () => {
  let calledWith;
  const actions = loadTs(
    'apps/data-viewer/src/domain/actions/clientActions.ts',
    {
      suitereact: {
        handleRestletAction: async (...args) => {
          calledWith = args;
          return { fields: [] };
        },
      },
    },
    {
      DEV: false,
      VITE_PROXY_SERVER_BASE_URL: 'http://localhost:3001',
      VITE_PROXY_SERVER_TOKEN: 'fixture-token',
    }
  );
  await assert.rejects(
    actions.fetchRecordSchema('transaction'),
    /field service needs to be updated/
  );
  assert.deepEqual(calledWith, [
    'getRecordFieldSchema',
    { recordType: 'transaction', includeTransactionLineFields: true },
    undefined,
    undefined,
  ]);
});

test('grouped parent queries retain EXISTS filters and limit after ordering at parent grain', () => {
  const input = params({
    dynamicColumns: [column('memo'), column('transactionline.memo')],
    dynamicFilters: [filter('transactionline.mainline', 'is_true')],
  });
  const sql = query.buildTransactionParentQuery(input, { id: 124 });
  assert.match(sql, /^SELECT \* FROM \(SELECT t.id/);
  assert.match(sql, /t.memo AS memo/);
  assert.match(sql, /BUILTIN.DF\(t.currency\) AS currency/);
  assert.match(
    sql,
    /EXISTS \(SELECT 1 FROM TransactionLine tl WHERE tl.transaction = t.id AND tl.mainline = 'T'\)/
  );
  assert.match(sql, /t.id > 124 ORDER BY t.id ASC\) WHERE ROWNUM <= 26$/);
  assert.doesNotMatch(sql, /INNER JOIN|AS line_memo/);
});

test('matching and context children stay inside the parent and advance by line ID', () => {
  const input = params({
    dynamicColumns: [column('memo'), column('transactionline.memo')],
    dynamicFilters: [
      filter('memo', 'contains', 'header'),
      filter('transactionline.mainline', 'is_true'),
      filter('transactionline.quantity', 'greater_than', '2'),
    ],
  });
  const matching = query.buildTransactionChildrenQuery(input, 100, false);
  const context = query.buildTransactionChildrenQuery(input, 100, true, {
    id: 100,
    lineId: 0,
  });
  assert.match(
    matching,
    /CASE WHEN 1 = 1 AND tl.mainline = 'T' AND tl.quantity > 2 THEN 'T' ELSE 'F' END/
  );
  assert.match(
    matching,
    /WHERE tl.transaction = 100 AND tl.mainline = 'T' AND tl.quantity > 2 ORDER BY/
  );
  assert.match(
    context,
    /WHERE tl.transaction = 100 AND tl.id > 0 ORDER BY tl.id ASC\) WHERE ROWNUM <= 26$/
  );
  assert.doesNotMatch(context, /t.memo|FROM transaction t|foreigntotal/);
  assert.throws(
    () =>
      query.buildTransactionChildrenQuery(input, 100, true, {
        id: 101,
        lineId: 0,
      }),
    /Invalid transaction line cursor/
  );
  assert.throws(
    () => query.buildTransactionChildrenQuery(input, NaN, true),
    /Invalid transaction ID/
  );
});

test('line counts batch only visible parents and use the identical match condition', () => {
  const input = params({
    dynamicFilters: [filter('transactionline.mainline', 'is_false')],
  });
  assert.equal(
    query.buildTransactionLineCountsQuery(input, [100, 101]),
    "SELECT tl.transaction AS id, COUNT(*) AS total_count, SUM(CASE WHEN 1 = 1 AND tl.mainline = 'F' THEN 1 ELSE 0 END) AS matching_count FROM TransactionLine tl WHERE tl.transaction IN (100, 101) GROUP BY tl.transaction"
  );
  for (const ids of [
    [],
    Array.from({ length: 26 }, (_, i) => i + 1),
    [1, -1],
    [Infinity],
  ])
    assert.throws(
      () => query.buildTransactionLineCountsQuery(input, ids),
      /Invalid transaction/
    );
});

function groupedActions(transport) {
  return loadTs('apps/data-viewer/src/domain/actions/clientActions.ts', {
    suitereact: {
      ...loadTs('suitereact/src/utils/dataGridColumnTypes.ts'),
      handleRestletAction: transport,
    },
  });
}
const tableResult = rows => ({
  headers: Object.keys(rows[0] || {}).map(id => ({ id, label: id })),
  rows,
});

test('parent pagination excludes the lookahead from rows, cursor and count scope', async () => {
  const queries = [];
  const actions = groupedActions(async (_, { query: sql }) => {
    queries.push(sql);
    return sql.includes('GROUP BY')
      ? tableResult([{ id: 100, total_count: 30, matching_count: 3 }])
      : tableResult(
          Array.from({ length: 26 }, (_, i) => ({
            id: i + 100,
            tranid: `TX-${i + 100}`,
          }))
        );
  });
  const page = await actions.fetchTransactionParents(lineParams);
  assert.equal(page.rows.length, 25);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, { id: 124 });
  assert.doesNotMatch(queries[1], /125/);
  assert.deepEqual(page.lineCounts['100'], { total: 30, matching: 3 });
  assert.deepEqual(page.lineCounts['101'], { total: 0, matching: 0 });
  assert(page.columns.some(c => c.field === 'foreigntotal'));
  assert(page.columns.some(c => c.field === 'currency'));
  assert(!page.columns.some(c => c.field.startsWith('line_')));
});

test('child paging preserves line zero, match flags and null fields without header totals', async () => {
  const actions = groupedActions(async () =>
    tableResult(
      Array.from({ length: 26 }, (_, i) => ({
        id: 100,
        line_id: i,
        line_matches: i < 3 ? 'T' : 'F',
        line_memo: null,
      }))
    )
  );
  const page = await actions.fetchTransactionChildren(lineParams, 100, true);
  assert.equal(page.rows.length, 25);
  assert.equal(page.rows[0].__rowId, '100/0');
  assert.equal(page.rows[0].line_matches, 'T');
  assert.equal(page.rows[3].line_matches, 'F');
  assert.deepEqual(page.nextCursor, { id: 100, lineId: 24 });
  assert(
    page.columns.every(
      c =>
        c.field.startsWith('line_') &&
        c.field !== 'line_matches' &&
        c.sortable === true
    )
  );
});

test('group sorting uses selected aliases, native types, nulls last and stable IDs', () => {
  const input = params({
    dynamicColumns: [column('transactionline.department', 'enum')],
  });
  for (const direction of ['asc', 'desc']) {
    for (const field of ['foreigntotal', 'trandate', 'entity', 'tranid']) {
      const sql = query.buildTransactionParentQuery(input, undefined, {
        field,
        direction,
      });
      assert.match(
        sql,
        new RegExp(
          `ORDER BY ${field} ${direction.toUpperCase()} NULLS LAST, id ASC`
        )
      );
      assert.match(
        sql,
        /ROWNUM <= 26\) WHERE sr_page_row > 0 ORDER BY sr_page_row$/
      );
      assert.doesNotMatch(sql, /INNER JOIN|TO_CHAR/);
    }
    const children = query.buildTransactionChildrenQuery(
      input,
      100,
      true,
      undefined,
      { field: 'line_department', direction }
    );
    assert.match(children, /BUILTIN.DF\(tl.department\) AS line_department/);
    assert.match(
      children,
      new RegExp(
        `ORDER BY line_department ${direction.toUpperCase()} NULLS LAST, line_id ASC`
      )
    );
  }
});

test('sorted pagination uses an ordinal window while keeping line filters and parent scope', () => {
  const input = params({
    dynamicColumns: [column('transactionline.netamount', 'number')],
    dynamicFilters: [filter('transactionline.mainline', 'is_true')],
  });
  const parent = query.buildTransactionParentQuery(
    input,
    { id: 100, offset: 25 },
    { field: 'foreigntotal', direction: 'desc' }
  );
  assert.match(
    parent,
    /EXISTS \(SELECT 1 FROM TransactionLine tl WHERE tl.transaction = t.id AND tl.mainline = 'T'\)/
  );
  assert.match(parent, /ROWNUM <= 51\) WHERE sr_page_row > 25/);
  assert.doesNotMatch(parent, /t.id > 100/);
  const cursor = { id: 100, lineId: 10, offset: 25 };
  const sort = { field: 'line_netamount', direction: 'asc' };
  const matching = query.buildTransactionChildrenQuery(
    input,
    100,
    false,
    cursor,
    sort
  );
  const context = query.buildTransactionChildrenQuery(
    input,
    100,
    true,
    cursor,
    sort
  );
  assert.match(
    matching,
    /WHERE tl.transaction = 100 AND tl.mainline = 'T' ORDER BY line_netamount/
  );
  assert.match(context, /WHERE tl.transaction = 100 ORDER BY line_netamount/);
  assert.match(
    context,
    /CASE WHEN 1 = 1 AND tl.mainline = 'T' THEN 'T' ELSE 'F' END/
  );
  assert.doesNotMatch(context, /tl.id > 10/);
});

test('sort inputs cannot reference unselected fields or inject SQL', () => {
  for (const field of [
    'memo',
    'line_memo',
    'sr_page_row',
    'id DESC',
    'id;DELETE',
    'recordtype',
  ]) {
    assert.throws(
      () =>
        query.buildTransactionParentQuery(params(), undefined, {
          field,
          direction: 'asc',
        }),
      /Unsupported transaction sort/
    );
  }
  assert.throws(
    () =>
      query.buildTransactionParentQuery(params(), undefined, {
        field: 'id',
        direction: 'desc;DROP',
      }),
    /Unsupported transaction sort/
  );
  assert.throws(
    () =>
      query.buildTransactionChildrenQuery(lineParams, 100, true, undefined, {
        field: 'foreigntotal',
        direction: 'asc',
      }),
    /Unsupported transaction sort/
  );
  for (const offset of [-25, 1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () =>
        query.buildTransactionParentQuery(
          params(),
          { id: 100, offset },
          { field: 'id', direction: 'desc' }
        ),
      /Invalid sorted page cursor/
    );
  }
  assert.throws(
    () =>
      query.buildTransactionParentQuery(
        params(),
        { id: 100 },
        { field: 'id', direction: 'desc' }
      ),
    /Invalid sorted page cursor/
  );
});

test('sorted parent cursors follow page positions, hide metadata, and count only visible parents', async () => {
  const queries = [];
  const actions = groupedActions(async (_, { query: sql }) => {
    queries.push(sql);
    return sql.includes('GROUP BY')
      ? tableResult([])
      : tableResult(
          Array.from({ length: 26 }, (_, i) => ({
            id: 100 - i,
            foreigntotal: i < 10 ? null : 10,
            sr_page_row: i + 1,
          }))
        );
  });
  const result = await actions.fetchTransactionParents(params(), undefined, {
    field: 'foreigntotal',
    direction: 'desc',
  });
  assert.equal(result.rows.length, 25);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.nextCursor, { id: 76, offset: 25 });
  assert(!result.columns.some(c => c.field === 'sr_page_row'));
  assert(result.rows.every(row => !Object.hasOwn(row, 'sr_page_row')));
  assert.doesNotMatch(queries[1], /\b75\b/);
});

test('sorted line continuation permits decreasing IDs and excludes the lookahead', async () => {
  const actions = groupedActions(async () =>
    tableResult(
      Array.from({ length: 26 }, (_, i) => ({
        id: 100,
        line_id: 50 - i,
        line_memo: `Text: ${i}`,
        sr_page_row: i + 26,
      }))
    )
  );
  const result = await actions.fetchTransactionChildren(
    lineParams,
    100,
    true,
    { id: 100, lineId: 51, offset: 25 },
    { field: 'line_memo', direction: 'asc' }
  );
  assert.deepEqual(result.nextCursor, { id: 100, lineId: 26, offset: 50 });
  assert.equal(result.rows.at(-1).__rowId, '100/26');
  assert.equal(result.hasMore, true);
  assert(result.columns.every(c => c.field !== 'sr_page_row'));
  assert(result.rows.every(row => !Object.hasOwn(row, 'sr_page_row')));
});

test('sorted pages reject missing/broken ordering metadata, duplicate rows and oversized responses', async () => {
  const sort = { field: 'line_id', direction: 'desc' };
  for (const rows of [
    [{ id: 100, line_id: 0 }],
    [{ id: 100, line_id: 0, sr_page_row: 2 }],
    [
      { id: 100, line_id: 0, sr_page_row: 1 },
      { id: 100, line_id: 0, sr_page_row: 2 },
    ],
    Array.from({ length: 27 }, (_, i) => ({
      id: 100,
      line_id: i,
      sr_page_row: i + 1,
    })),
  ]) {
    const actions = groupedActions(async () => tableResult(rows));
    await assert.rejects(
      actions.fetchTransactionChildren(lineParams, 100, true, undefined, sort),
      /cursor order|duplicate rows|row limit/
    );
  }
  const empty = groupedActions(async () => tableResult([]));
  const result = await empty.fetchTransactionChildren(
    lineParams,
    100,
    true,
    undefined,
    sort
  );
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, undefined);
});

test('grouped requests reject response errors, count errors and invalid cursor ordering', async () => {
  const error = groupedActions(async () => ({
    error: 'Permission denied',
    success: false,
  }));
  await assert.rejects(
    error.fetchTransactionParents(lineParams),
    /Permission denied/
  );
  await assert.rejects(
    error.fetchTransactionChildren(lineParams, 100, false),
    /Permission denied/
  );
  const counts = groupedActions(async (_, { query: sql }) =>
    sql.includes('GROUP BY')
      ? { error: 'Count denied' }
      : tableResult([{ id: 100 }])
  );
  await assert.rejects(
    counts.fetchTransactionParents(lineParams),
    /counts could not be loaded/
  );
  const wrongParent = groupedActions(async () =>
    tableResult([{ id: 101, line_id: 0 }])
  );
  await assert.rejects(
    wrongParent.fetchTransactionChildren(lineParams, 100, false),
    /unexpected transaction/
  );
  const duplicates = groupedActions(async () =>
    tableResult([
      { id: 100, line_id: 0 },
      { id: 100, line_id: 0 },
    ])
  );
  await assert.rejects(
    duplicates.fetchTransactionChildren(lineParams, 100, false),
    /duplicate rows/
  );
  const unordered = groupedActions(async () =>
    tableResult([
      { id: 100, line_id: 2 },
      { id: 100, line_id: 1 },
    ])
  );
  await assert.rejects(
    unordered.fetchTransactionChildren(lineParams, 100, false),
    /not in cursor order/
  );
  const stale = groupedActions(async () =>
    tableResult([{ id: 100, line_id: 0 }])
  );
  await assert.rejects(
    stale.fetchTransactionChildren(lineParams, 100, false, {
      id: 100,
      lineId: 1,
    }),
    /not in cursor order/
  );
});

for (const dev of [true, false]) {
  test(`all Data Viewer actions preserve ${dev ? 'authenticated local' : 'hosted'} transport`, async () => {
    const calls = [];
    const actions = loadTs(
      'apps/data-viewer/src/domain/actions/clientActions.ts',
      {
        suitereact: {
          ...loadTs('suitereact/src/utils/dataGridColumnTypes.ts'),
          handleRestletAction: async (...args) => {
            calls.push(args);
            if (args[0] === 'getRecordFieldSchema')
              return { fields: [], transactionLineFieldsIncluded: true };
            if (args[0] === 'resolveRecordUrls') return { templates: {} };
            const sql = args[1].query;
            if (sql.includes('GROUP BY tl.transaction'))
              return { rows: [{ id: 100, total_count: 0, matching_count: 0 }] };
            if (
              sql.includes('FROM transaction t') &&
              !sql.includes('COUNT') &&
              !sql.includes('DISTINCT')
            )
              return {
                headers: [{ id: 'id', label: 'ID' }],
                rows: [{ id: 100 }],
              };
            return { headers: [], rows: [] };
          },
        },
      },
      {
        DEV: dev,
        VITE_PROXY_SERVER_BASE_URL: 'http://localhost:3001',
        VITE_PROXY_SERVER_TOKEN: 'fixture-token',
      }
    );
    await actions.fetchRecordSchema('transaction');
    await actions.fetchRecordCount(params());
    await actions.fetchDataViewerRecords(params());
    await actions.fetchTransactionParents(params());
    await actions.fetchTransactionChildren(params(), 100, false);
    await actions.fetchDistinctTypes();
    await actions.fetchRecordUrlTemplates(['journalentry']);
    assert.equal(calls.length, 8);
    for (const call of calls) {
      assert.equal(call[2], dev ? 'http://localhost:3001' : undefined);
      assert.equal(call[3], dev ? 'fixture-token' : undefined);
    }
  });
}
