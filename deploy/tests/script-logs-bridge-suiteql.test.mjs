import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const LEGACY =
  '/SuiteScripts/sdfTs/application/scripts/restlet/sr_rl_rct_action_handler';

async function transpile(path, mocks) {
  const { outputText } = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(
    name => {
      if (!(name in mocks)) throw new Error(`unexpected import ${name}`);
      return mocks[name];
    },
    module.exports,
    module
  );
  return module.exports;
}

const Permission = { NONE: 0, VIEW: 1, CREATE: 2, EDIT: 3, FULL: 4 };

async function loadBridge(tableRows, { analytics = Permission.EDIT } = {}) {
  const authorization = await transpile('sdf/domain/actionAuthorization.ts', {
    'N/runtime': {
      Permission,
      getCurrentUser: () => ({
        role: 1053,
        getPermission({ name }) {
          return name === 'REPO_ANALYTICS' ? analytics : Permission.FULL;
        },
      }),
      getCurrentScript: () => {
        throw new Error('the bridge must not read role-list parameters');
      },
    },
  });
  const legacyCalls = [];
  const mocks = {
    'N/log': { audit() {}, error() {} },
    '../domain/actionAuthorization': authorization,
    [LEGACY]: {
      post: request => {
        legacyCalls.push(request);
        return 'legacy';
      },
      get: request => {
        legacyCalls.push(request);
        return 'legacy';
      },
    },
    '../actions/getTableRowsFromSuiteql': {
      getTableRowsFromSuiteql: tableRows,
    },
    '../actions/scriptLogActions': {},
    '../domain/suitereact': {
      successResponse: data => JSON.stringify({ success: true, data }),
      errorResponse: (error, message) =>
        JSON.stringify({ success: false, error, message }),
    },
  };
  const bridge = await transpile(
    'sdf/scripts/sr_rl_script_logs_bridge.ts',
    mocks
  );
  return { bridge, legacyCalls };
}

test('getTableRowsFromSuiteql is served by this tree with the legacy success payload', async () => {
  const seen = [];
  const { bridge, legacyCalls } = await loadBridge(request => {
    seen.push(request.query);
    return { headers: [{ id: 'status' }], rows: [{ status: 'A : B' }] };
  });
  const response = bridge.post({
    action: 'getTableRowsFromSuiteql',
    query: 'SELECT 1',
  });
  assert.deepEqual(JSON.parse(response), {
    success: true,
    data: { headers: [{ id: 'status' }], rows: [{ status: 'A : B' }] },
  });
  assert.deepEqual(seen, ['SELECT 1']);
  assert.equal(legacyCalls.length, 0);
});

test('SuiteQL failures keep the legacy error format callers parse', async () => {
  const { bridge } = await loadBridge(() => {
    throw {
      name: 'SSS_SEARCH_ERROR_OCCURRED',
      message: "Unknown identifier 'x' | Query: SELECT x FROM customer",
      cause: { details: "Unknown identifier 'x'" },
    };
  });
  assert.deepEqual(
    JSON.parse(bridge.post({ action: 'getTableRowsFromSuiteql', query: 'q' })),
    {
      success: false,
      error:
        "ACTION: getTableRowsFromSuiteql: [SSS_SEARCH_ERROR_OCCURRED] Unknown identifier 'x' | Query: SELECT x FROM customer",
      message: "Unknown identifier 'x'",
    }
  );
});

test('every other action still goes to the legacy handler', async () => {
  const { bridge, legacyCalls } = await loadBridge(() => {
    throw new Error('must not run');
  });
  assert.equal(bridge.post({ action: 'approveTransaction', id: 1 }), 'legacy');
  assert.equal(bridge.get({ action: 'getUserProps' }), 'legacy');
  assert.equal(legacyCalls.length, 2);
});

const DENIED = {
  success: false,
  error:
    'ACTION: getTableRowsFromSuiteql: This SuiteReact action is not authorized for the current role',
  message: 'This SuiteReact action is not authorized for the current role',
};

for (const method of ['post', 'get']) {
  test(`${method}: a role without SuiteAnalytics Workbook is denied before any SuiteQL runs`, async () => {
    let ran = 0;
    const { bridge, legacyCalls } = await loadBridge(
      () => {
        ran += 1;
        return { headers: [], rows: [] };
      },
      { analytics: Permission.NONE }
    );
    const response = bridge[method]({
      action: 'getTableRowsFromSuiteql',
      query: 'SELECT id FROM employee',
    });
    assert.deepEqual(JSON.parse(response), DENIED);
    assert.equal(ran, 0, 'no query executes');
    assert.equal(legacyCalls.length, 0, 'denial does not fall through');
  });

  test(`${method}: SuiteAnalytics Workbook at View is enough to run the query`, async () => {
    const { bridge } = await loadBridge(() => ({ headers: [], rows: [] }), {
      analytics: Permission.VIEW,
    });
    assert.equal(
      JSON.parse(
        bridge[method]({ action: 'getTableRowsFromSuiteql', query: 'q' })
      ).success,
      true
    );
  });
}
