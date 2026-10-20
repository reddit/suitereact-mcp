import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from '../../../deploy/tests/helpers/load-suitescript.mjs';

function setup({
  permission = 1,
  permissionFailure = false,
  rows = [],
  failure,
  searchRows = [],
} = {}) {
  const calls = [];
  const searchCalls = [];
  const runtime = {
    Permission: { VIEW: 1 },
    getCurrentUser: () => ({
      getPermission: ({ name }) => {
        assert.equal(name, 'ADMI_CUSTOMSCRIPT');
        if (permissionFailure) throw new Error('Cannot determine permission');
        return permission;
      },
    }),
  };
  const actions = loadModule('sdf/actions/scriptLogActions.ts', {
    'N/runtime': runtime,
    'N/search': {
      Type: { SCRIPT_DEPLOYMENT: 'scriptdeployment' },
      Operator: { ANYOF: 'anyof', EQUALTO: 'equalto', IS: 'is' },
      Sort: { DESC: 'DESC', ASC: 'ASC' },
      createColumn: value => value,
      createFilter: value => value,
      create(options) {
        searchCalls.push(options);
        return {
          get filterExpression() {
            return options.filterExpression || options.filters;
          },
          set filterExpression(value) {
            options.filterExpression = value;
          },
          runPaged: ({ pageSize }) => {
            options.pageSize = pageSize;
            return {
              count: searchRows.length,
              fetch: ({ index }) => {
                options.pageIndex = index;
                return {
                  data: searchRows
                    .slice(index * pageSize, (index + 1) * pageSize)
                    .map(row => ({
                      getValue(column) {
                        if (column.formula?.includes('executionlog.detail'))
                          return row.detail ?? '';
                        if (column.formula?.includes('executionlog.date'))
                          return row.date;
                        return (
                          row[
                            column.join
                              ? `${column.join}_${column.name}`
                              : column.name
                          ] ?? ''
                        );
                      },
                      getText(column) {
                        return row[`${column.name}_text`] ?? '';
                      },
                    })),
                };
              },
            };
          },
          run: () => ({
            getRange: range => {
              options.range = range;
              return searchRows.slice(range.start, range.end).map(row => ({
                getValue(column) {
                  if (column.formula)
                    return column.formula.includes('executionlog.date')
                      ? row.date
                      : row.anchor;
                  return (
                    row[column.join ? `log_${column.name}` : column.name] ?? ''
                  );
                },
              }));
            },
          }),
        };
      },
    },
    'N/query': {
      runSuiteQL(options) {
        calls.push(options);
        if (failure) throw failure;
        return { asMappedResults: () => rows };
      },
    },
  });
  // Log reads use the 'read' policy: native SuiteScript View inside each
  // action, never a role allowlist. Reading one fails the test.
  const authorization = loadModule('sdf/domain/actionAuthorization.ts', {
    'N/runtime': {
      ...runtime,
      getCurrentScript: () => {
        throw new Error('log reads must not consult role allowlists');
      },
    },
  });
  const handler = loadModule('sdf/scripts/sr_rl_rct_action_handler.ts', {
    'N/runtime': runtime,
    'N/log': { audit() {}, debug() {}, error() {} },
    '../domain/actionAuthorization': authorization,
    '../domain/actionDenial': loadModule('sdf/domain/actionDenial.ts'),
    '../actions/index': actions,
    '../libs/ramda': loadModule('sdf/libs/ramda.js'),
    '../domain/suitereact': loadModule('sdf/domain/suitereact.ts'),
  });
  const delegated = [];
  const bridge = loadModule('sdf/scripts/sr_rl_script_logs_bridge.ts', {
    'N/log': { audit() {}, debug() {}, error() {} },
    '../domain/actionAuthorization': authorization,
    '../actions/getTableRowsFromSuiteql': {
      getTableRowsFromSuiteql: () => assert.fail('not a log action'),
    },
    '../actions/scriptLogActions': actions,
    '../domain/suitereact': loadModule('sdf/domain/suitereact.ts'),
    '/SuiteScripts/sdfTs/application/scripts/restlet/sr_rl_rct_action_handler':
      {
        get: request => {
          delegated.push({ method: 'get', request });
          return 'legacy GET';
        },
        post: request => {
          delegated.push({ method: 'post', request });
          return 'legacy POST';
        },
      },
  });
  return { actions, handler, bridge, delegated, calls, searchCalls };
}
const request = {
  hours: 24,
  search: '',
  script: '',
  deployment: '',
  severity: '',
  pageSize: 10,
};

test('log and lookup actions deny missing SuiteScript View before any query through both handlers', () => {
  for (const options of [
    { permission: 0 },
    { permission: undefined, permissionFailure: true },
  ]) {
    const { actions, handler, bridge, delegated, calls } = setup(options);
    assert.throws(
      () => actions.listScriptLogs(request),
      /SCRIPT_LOG_PERMISSION_DENIED/
    );
    assert.throws(
      () => actions.getScriptLogDetail({ id: '1' }),
      /SCRIPT_LOG_PERMISSION_DENIED/
    );
    for (const dispatch of [handler.post, bridge.post, bridge.get]) {
      for (const action of [
        'listScriptLogs',
        'listScriptLogTable',
        'GETSCRIPTLOGDETAIL',
        'searchScriptLogScripts',
        'searchScriptLogDeployments',
      ]) {
        const result = JSON.parse(dispatch({ ...request, action, id: '1' }));
        assert.equal(result.success, false);
        assert.equal(result.error, 'SCRIPT_LOG_PERMISSION_DENIED');
      }
    }
    assert.equal(calls.length, 0);
    assert.equal(delegated.length, 0);
  }
});
test('compatibility handler delegates other actions and methods without modifying requests', () => {
  const { bridge, delegated, calls } = setup({ permission: 0 });
  for (const method of ['get', 'post']) {
    const input = { action: 'getUserProps', opaque: { retained: true } };
    assert.equal(bridge[method](input), `legacy ${method.toUpperCase()}`);
    assert.equal(delegated.at(-1).request, input);
    assert.equal(delegated.at(-1).method, method);
  }
  assert.equal(calls.length, 0);
});
test('compatibility handler returns one envelope and never delegates log reads', () => {
  const { bridge, delegated } = setup({ rows: [{ detail: 'untouched raw' }] });
  for (const method of ['get', 'post']) {
    const value = JSON.parse(
      bridge[method]({ action: 'GETSCRIPTLOGDETAIL', id: '1' })
    );
    assert.equal(value.success, true);
    assert.deepEqual(value.data, { raw: 'untouched raw' });
  }
  assert.equal(delegated.length, 0);
});
test('bounded keyset pages omit detail and keep search text out of SQL', () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({
    id: String(100 - i),
    loggedat: '2026-09-10 10:00:00',
    anchor: '2026-09-10 11:00:00',
    severity: 'Error',
    title: 'Synthetic',
    script: '5',
    detail: 'must not appear',
  }));
  const { actions, calls } = setup({ rows });
  const search = "%' OR 1=1 --";
  const page = actions.listScriptLogs({
    ...request,
    search,
    script: '5',
    severity: 'ERROR',
  });
  assert.equal(page.rows.length, 10);
  assert.equal(page.next.id, '91');
  assert.ok(
    page.rows.every(row => !Object.hasOwn(row, 'raw') && row.deployment === '')
  );
  assert.ok(!calls[0].query.includes(search));
  assert.ok(calls[0].params.includes(search.toLowerCase()));
  assert.equal(calls[0].params.at(-1), 11);
  assert.ok(!calls[0].query.includes('scriptdeployment'));
  actions.listScriptLogs({ ...request, cursor: page.next });
  assert.match(calls[1].query, /n.internalid < \?/);
  assert.ok(calls[1].params.includes('91'));
});
test('invalid bounds and injected IDs never query', () => {
  const { actions, calls } = setup();
  for (const patch of [
    { hours: 999 },
    { pageSize: 1000 },
    { pageSize: -1 },
    { search: 'x'.repeat(201) },
    { deployment: "201' OR 1=1" },
    { script: "1'" },
    { severity: 'FATAL' },
    { cursor: { date: 'invalid', anchor: 'invalid', id: '1' } },
  ]) {
    assert.throws(
      () => actions.listScriptLogs({ ...request, ...patch }),
      /SCRIPT_LOG_QUERY_ERROR/
    );
  }
  assert.throws(
    () => actions.getScriptLogDetail({ id: '1 OR 1=1' }),
    /SCRIPT_LOG_QUERY_ERROR/
  );
  assert.equal(calls.length, 0);
});
test('native denial and query failures produce sanitized transport errors', () => {
  for (const [name, expected] of [
    ['INSUFFICIENT_PERMISSION', 'SCRIPT_LOG_PERMISSION_DENIED'],
    ['UNEXPECTED_ERROR', 'SCRIPT_LOG_QUERY_ERROR'],
  ]) {
    const { handler, bridge } = setup({
      failure: { name, message: 'private account data and SQL' },
    });
    for (const dispatch of [handler.post, bridge.post, bridge.get]) {
      for (const action of ['listScriptLogs', 'searchScriptLogScripts']) {
        const response = dispatch({ ...request, action, search: 'invoice' });
        assert.equal(JSON.parse(response).error, expected);
        assert.ok(!response.includes('private'));
      }
    }
  }
});

test('lookup enforces input bounds before querying', () => {
  const { actions, calls } = setup();
  for (const search of [
    null,
    undefined,
    '',
    'a',
    ' a ',
    101,
    'x'.repeat(101),
  ]) {
    assert.throws(
      () => actions.searchScriptLogScripts({ search }),
      /SCRIPT_LOG_QUERY_ERROR/
    );
  }
  assert.throws(
    () => actions.searchScriptLogScripts(null),
    /SCRIPT_LOG_QUERY_ERROR/
  );
  assert.equal(calls.length, 0);
});

test('lookup is parameterized, bounded and dispatched through both handlers', () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({
    id: 100 + index,
    name: `Demo script ${index}`,
    scriptid: `customscript_demo_${index}`,
  }));
  const { actions, handler, bridge, calls, delegated } = setup({ rows });
  const search = "X%' OR 1=1 --";
  const result = JSON.parse(
    JSON.stringify(actions.searchScriptLogScripts({ search }))
  );
  assert.equal(result.options.length, 20);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.options[0], {
    value: '100',
    label: 'Demo script 0',
    scriptId: 'customscript_demo_0',
  });
  assert.match(calls[0].query, /ROWNUM <= 21/);
  assert.match(calls[0].query, /ORDER BY s.name, s.id/);
  assert.ok(!calls[0].query.includes(search));
  assert.deepEqual(Array.from(calls[0].params), [
    search.toLowerCase(),
    search.toLowerCase(),
    search.toLowerCase(),
  ]);
  for (const dispatch of [handler.post, bridge.post, bridge.get]) {
    const response = JSON.parse(
      dispatch({ action: 'SEARCHSCRIPTLOGSCRIPTS', search: 'Demo' })
    );
    assert.equal(response.success, true);
    assert.deepEqual(response.data, result);
  }
  assert.equal(delegated.length, 0);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(setup().actions.searchScriptLogScripts({ search: 'zz' }))
    ),
    {
      options: [],
      hasMore: false,
    }
  );
  assert.equal(
    setup({ rows: rows.slice(0, 20) }).actions.searchScriptLogScripts({
      search: 'demo',
    }).hasMore,
    false
  );
});
test('single detail preserves malformed text exactly and handles an expired row', () => {
  const raw = '{"message":"interrupted';
  const { actions, calls } = setup({ rows: [{ detail: raw }] });
  assert.equal(actions.getScriptLogDetail({ id: '1' }).raw, raw);
  assert.match(calls[0].query, /ROWNUM <= 1/);
  assert.equal(setup().actions.getScriptLogDetail({ id: '1' }), null);
});

test('attribution uses the log join and leaves missing or ambiguous associations unassigned', () => {
  const rows = [1, 2, 3].map(id => ({
    id: String(id),
    script: '5',
    loggedat: '2026-09-21 12:00:00',
  }));
  const { actions, searchCalls } = setup({
    rows,
    searchRows: [
      {
        log_internalid: '1',
        internalid: '101',
        scriptid: 'customdeploy_first',
      },
      { log_internalid: '2', internalid: '102' },
      { log_internalid: '2', internalid: '103' },
    ],
  });
  const page = actions.listScriptLogs(request);
  assert.equal(page.rows[0].deployment, '101');
  assert.equal(page.rows[0].deploymentLabel, 'customdeploy_first');
  assert.equal(page.rows[1].deployment, '');
  assert.equal(page.rows[2].deployment, '');
  assert.equal(searchCalls[0].filters[0][0], 'executionlog.internalid');
  assert.ok(searchCalls[0].range.end <= 100);
});

test('deployment-filtered pages retain bounded ordering, cursor and native text filters', () => {
  const searchRows = [3, 2, 1].map(id => ({
    internalid: '101',
    scriptid: 'customdeploy_demo',
    script: '5',
    log_internalid: String(id),
    date: '2026-09-21 12:00:00',
    anchor: '2026-09-21 13:00:00',
    log_title: 'Synthetic',
    log_type: 'Error',
  }));
  const { actions, searchCalls, calls } = setup({ searchRows });
  const term = "x%' OR 1=1 --";
  const page = actions.listScriptLogs({
    ...request,
    pageSize: 2,
    deployment: '101',
    script: '5',
    search: term,
  });
  assert.equal(calls.length, 0);
  assert.equal(page.rows.length, 2);
  assert.equal(page.next.id, '2');
  assert.equal(page.next.anchor, '2026-09-21 13:00:00');
  assert.ok(
    page.rows.every(
      row =>
        row.deployment === '101' &&
        row.severity === 'ERROR' &&
        !Object.hasOwn(row, 'raw')
    )
  );
  const query = searchCalls[0];
  assert.equal(query.range.end, 3);
  assert.ok(!query.filters.some(filter => filter?.formula?.includes(term)));
  assert.ok(JSON.stringify(query.filterExpression).includes(term));
  actions.listScriptLogs({ ...request, deployment: '101', cursor: page.next });
  assert.ok(
    searchCalls[1].filters.some(filter =>
      filter?.formula?.includes('{executionlog.internalid} < 2')
    )
  );
});

test('deployment lookup bounds inputs, scopes to parent and is dispatched without delegation', () => {
  const { actions, bridge, calls, delegated } = setup({
    rows: [
      {
        id: '101',
        title: 'Demo deployment',
        scriptid: 'customdeploy_demo',
        script: '5',
        scriptname: 'Demo script',
        parentscriptid: 'customscript_demo',
      },
    ],
  });
  for (const input of [
    { search: 'a' },
    { search: 'x'.repeat(101) },
    { search: 'demo', script: "5'" },
  ]) {
    assert.throws(
      () => actions.searchScriptLogDeployments(input),
      /SCRIPT_LOG_QUERY_ERROR/
    );
  }
  assert.equal(calls.length, 0);
  const result = JSON.parse(
    bridge.post({
      action: 'searchScriptLogDeployments',
      search: 'demo',
      script: '5',
    })
  );
  assert.equal(result.data.options[0].script, '5');
  assert.equal(result.data.options[0].scriptLabel, 'Demo script');
  assert.equal(result.data.hasMore, false);
  assert.match(calls[0].query, /ROWNUM <= 21/);
  assert.match(calls[0].query, /TO_CHAR\(d.script\) = \?/);
  assert.match(calls[0].query, /d.primarykey AS id/);
  assert.match(calls[0].query, /TO_CHAR\(d.primarykey\) = \?/);
  assert.equal(calls[0].params.at(-1), '5');
  assert.equal(delegated.length, 0);
});

const tableRequest = {
  ...request,
  page: 0,
  sort: { field: 'date', direction: 'desc' },
  anchor: '2026-09-22 08:00:00',
};
test('table supports bounded native paging, exact metadata, original preview and stable sort', () => {
  const searchRows = Array.from({ length: 21 }, (_, i) => ({
    internalid: '201',
    script: '101',
    script_text: '101',
    script_name: 'Demo script',
    script_scriptid: 'customscript_demo',
    title: 'Demo deployment',
    scriptid: 'customdeploy_demo',
    executionlog_internalid: String(1000 - i),
    executionlog_title: 'Log ' + i,
    executionlog_type: 'Error',
    executionlog_user: i === 10 ? '' : 'Demo operator',
    date: '2026-09-22 07:59:00',
    detail: 'x'.repeat(800),
  }));
  const { actions, searchCalls, calls } = setup({ searchRows });
  const page = actions.listScriptLogTable({
    ...tableRequest,
    page: 1,
    sort: { field: 'deploymentName', direction: 'asc' },
    script: '101',
    deployment: '201',
    severity: 'ERROR',
    search: "x' OR 1=1",
  });
  assert.equal(page.rows.length, 10);
  assert.equal(page.rows[0].id, '990');
  assert.equal(page.total, 21);
  assert.equal(page.hasMore, true);
  assert.equal(page.rows[0].scriptName, 'Demo script');
  assert.equal(page.rows[0].deploymentName, 'Demo deployment');
  assert.equal(page.rows[0].userName, '');
  assert.equal(page.rows[0].preview.length, 500);
  assert.equal(page.rows[0].previewTruncated, true);
  assert.equal(Object.hasOwn(page.rows[0], 'raw'), false);
  const operation = searchCalls[0];
  assert.equal(operation.pageIndex, 1);
  assert.equal(operation.pageSize, 10);
  assert.equal(
    JSON.stringify(
      operation.columns.slice(0, 3).map(c => [c.name, c.join, c.sort])
    ),
    JSON.stringify([
      ['title', undefined, 'ASC'],
      ['internalid', 'executionlog', 'DESC'],
      ['internalid', undefined, 'ASC'],
    ])
  );
  assert.ok(!operation.filters.some(f => f.formula?.includes("x'")));
  assert.ok(JSON.stringify(operation.filterExpression).includes("x' OR 1=1"));
  assert.equal(calls.length, 0);
});
test('table rejects arbitrary sort expressions, page and filter inputs before native work', () => {
  for (const invalid of [
    { sort: { field: '__proto__', direction: 'asc' } },
    { sort: { field: 'date DESC; DELETE', direction: 'asc' } },
    { sort: { field: 'date', direction: 'invalid' } },
    { page: -1 },
    { page: 1000 },
    { page: 1.2 },
    { pageSize: 1000 },
    { script: "1'" },
    { anchor: "2026-09-22' OR 1=1" },
    { search: 'x'.repeat(201) },
    { hours: 0 },
    { hours: 0, from: '2026-09-21 08:00:00' },
    { hours: 0, from: '2026-09-21 08:00:00', to: '2026-09-21 08:00:00' },
    { hours: 0, from: '2026-09-21 09:00:00', to: '2026-09-21 08:00:00' },
    { hours: 0, from: "2026-09-21' OR 1=1", to: '2026-09-22 08:00:00' },
    { hours: 0, from: '2026-02-30 00:00:00', to: '2026-03-01 00:00:00' },
    { hours: 24, from: '2026-09-21 08:00:00', to: '2026-09-22 08:00:00' },
  ]) {
    const { actions, searchCalls, calls } = setup();
    assert.throws(
      () => actions.listScriptLogTable({ ...tableRequest, ...invalid }),
      /SCRIPT_LOG_QUERY_ERROR/
    );
    assert.equal(searchCalls.length, 0);
    assert.equal(calls.length, 0);
  }
});
test('custom table window uses validated bounds and keeps anchor and retention limits', () => {
  const { actions, searchCalls, calls } = setup();
  actions.listScriptLogTable({
    ...tableRequest,
    hours: 0,
    from: '2026-09-20 06:30:00',
    to: '2026-09-21 18:00:59',
  });
  const formula = searchCalls[0].filters.find(
    filter => filter.name === 'formulanumeric'
  ).formula;
  assert.match(
    formula,
    /\{executionlog\.date\} >= TO_DATE\('2026-09-20 06:30:00', 'YYYY-MM-DD HH24:MI:SS'\)/
  );
  assert.match(
    formula,
    /\{executionlog\.date\} <= TO_DATE\('2026-09-21 18:00:59', 'YYYY-MM-DD HH24:MI:SS'\)/
  );
  assert.match(formula, /<= TO_DATE\('2026-09-22 08:00:00'/);
  assert.match(formula, /SYSDATE - 30/);
  assert.ok(!formula.includes('/24'));
  assert.equal(calls.length, 0);
});
test('table keeps missing users empty and exposes native page limit without fetching beyond it', () => {
  const { actions, searchCalls } = setup();
  const page = actions.listScriptLogTable({ ...tableRequest, page: 3 });
  assert.equal(page.rows.length, 0);
  assert.equal(page.hasMore, false);
  assert.equal(searchCalls[0].pageIndex, undefined);
});
