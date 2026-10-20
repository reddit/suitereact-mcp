import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/load-suitescript.mjs';

const ramda = loadModule('sdf/libs/ramda.js');
const responses = loadModule('sdf/domain/suitereact.ts');
const denial = loadModule('sdf/domain/actionDenial.ts');

const Permission = { NONE: 0, VIEW: 1, CREATE: 2, EDIT: 3, FULL: 4 };

function createHandler({
  role = 100,
  emailRoles = '',
  analytics = Permission.NONE,
  approve,
} = {}) {
  const calls = [];
  const parameterReads = [];
  const result = { ids: ['42'], total: 1, matches: true };
  const actions = {
    getStatementData: params => {
      calls.push(params);
      return result;
    },
    getLastEmailAttachedToRecord: params => {
      calls.push(params);
      return result;
    },
    getLastEmailToPrimaryRecipientSearch: params => {
      calls.push(params);
      return result;
    },
    getLastEmailToPrimaryRecipientQuery: params => {
      calls.push(params);
      return result;
    },
    generateInvoicePdfs: params => {
      calls.push(params);
      return result;
    },
    sendStatementEmail: params => {
      calls.push(params);
      return result;
    },
    approveTransaction: params => {
      calls.push(params);
      return approve ? approve(params) : result;
    },
    unclassifiedExport: params => {
      calls.push(params);
      return result;
    },
    getRecordFieldSchema(params) {
      calls.push(params);
      return result;
    },
    getSelectOptionsFromString(params) {
      calls.push(params);
      return result;
    },
    dsEvaluateDynGroup(params) {
      calls.push(params);
      return result;
    },
    dsListDynGroups(params) {
      calls.push(params);
      return result;
    },
    getTableRowsFromSuiteql(params) {
      calls.push(params);
      return result;
    },
    getTableRowsFromSavedSearch(params) {
      calls.push(params);
      return result;
    },
    dsGetUserPrefs() {
      return { prefs: {} };
    },
  };
  const runtime = {
    Permission,
    getCurrentUser: () => ({
      role,
      getPermission: ({ name }) =>
        name === 'REPO_ANALYTICS' ? analytics : Permission.FULL,
    }),
    getCurrentScript: () => ({
      getParameter({ name }) {
        parameterReads.push(name);
        assert.equal(name, 'custscript_sr_statement_email_role_ids');
        return emailRoles;
      },
    }),
  };
  const handler = loadModule('sdf/scripts/sr_rl_rct_action_handler.ts', {
    'N/log': { audit() {}, debug() {}, error() {} },
    '../domain/actionDenial': denial,
    '../domain/actionAuthorization': loadModule(
      'sdf/domain/actionAuthorization.ts',
      { 'N/runtime': runtime }
    ),
    '../domain/suitereact': responses,
    '../libs/ramda': ramda,
    '../actions/index': actions,
  });
  return { handler, calls, result, parameterReads };
}

const requests = [
  {
    criteria: {
      logic: 'and',
      rules: [{ field: 'department', op: 'equals', value: '7' }],
    },
  },
  { groupId: '12', userId: '42', limit: 0 },
];

for (const method of ['get', 'post']) {
  test(`${method}: malformed request bodies retain the stable failure envelope`, () => {
    const { handler, calls } = createHandler();
    for (const body of [
      null,
      undefined,
      {},
      [],
      42,
      'invalid',
      { action: null },
      { action: 42 },
      { action: ['dsGetUserPrefs'] },
      { action: { toString: null } },
    ]) {
      assert.deepEqual(
        handler[method](body),
        responses.errorResponse(
          'SUITEREACT_ACTION_FAILED',
          'The action failed; review the protected NetSuite script log'
        )
      );
    }
    assert.equal(calls.length, 0);
  });

  test(`${method}: mutations run under native permissions without a role list`, () => {
    const { handler, calls, result, parameterReads } = createHandler();
    const mutations = [
      { action: 'DSLISTDYNGROUPS' },
      { action: 'approveTransaction', id: 1 },
    ];
    for (const params of mutations) {
      assert.deepEqual(
        handler[method](params),
        responses.successResponse(result)
      );
    }
    assert.equal(calls.length, mutations.length);
    assert.deepEqual(parameterReads, []);
  });

  test(`${method}: dynamic-group previews require SuiteAnalytics Workbook`, () => {
    // An employee reader in the RESTlet audience, without Workbook.
    const denied = createHandler({ analytics: Permission.NONE });
    for (const request of requests) {
      for (const action of ['dsEvaluateDynGroup', 'DSEVALUATEDYNGROUP']) {
        assert.deepEqual(
          denied.handler[method]({ action, ...request }),
          responses.errorResponse(
            'SUITEREACT_ACTION_FAILED',
            'The action failed; review the protected NetSuite script log'
          )
        );
      }
    }
    assert.equal(denied.calls.length, 0);
    assert.deepEqual(denied.parameterReads, []);
    const allowed = createHandler({ analytics: Permission.VIEW });
    for (const request of requests) {
      const params = { action: 'dsEvaluateDynGroup', ...request };
      assert.deepEqual(
        allowed.handler[method](params),
        responses.successResponse(allowed.result)
      );
      assert.equal(allowed.calls.at(-1), params);
    }
  });

  test(`${method}: statement email requires its own role list, even with full Workbook`, () => {
    for (const emailRoles of ['', '  ,  ', '1100,200']) {
      const { handler, calls } = createHandler({
        emailRoles,
        analytics: Permission.FULL,
      });
      for (const action of ['sendStatementEmail', 'SENDSTATEMENTEMAIL']) {
        assert.deepEqual(
          handler[method]({ action, customer: { value: '7' } }),
          responses.errorResponse(
            'SUITEREACT_ACTION_FAILED',
            'The action failed; review the protected NetSuite script log'
          )
        );
      }
      assert.equal(calls.length, 0);
    }
    const { handler, calls, result } = createHandler({
      emailRoles: '200, 100 ,300',
    });
    assert.deepEqual(
      handler[method]({ action: 'sendStatementEmail' }),
      responses.successResponse(result)
    );
    assert.equal(calls.length, 1);
  });

  test(`${method}: ordinary read-only actions remain available without any role list`, () => {
    const { handler } = createHandler();
    const response = handler[method]({ action: 'dsGetUserPrefs' });
    assert.deepEqual(response, responses.successResponse({ prefs: {} }));
  });
}

for (const method of ['get', 'post']) {
  for (const action of [
    'getRecordFieldSchema',
    'getSelectOptionsFromString',
    'getTableRowsFromSuiteql',
    'GETTABLEROWSFROMSAVEDSEARCH',
    'getStatementData',
    'getLastEmailAttachedToRecord',
    'getLastEmailToPrimaryRecipientSearch',
    'getLastEmailToPrimaryRecipientQuery',
    'generateInvoicePdfs',
  ]) {
    test(`${method}: ${action} requires SuiteAnalytics Workbook independently of email roles`, () => {
      {
        const { handler, calls } = createHandler({
          emailRoles: '100',
          analytics: Permission.NONE,
        });
        const result = JSON.parse(
          handler[method]({
            action,
            query: 'SELECT id FROM customrecord_sr_space',
            searchId: '12',
          })
        );
        assert.equal(result.success, false);
        assert.equal(calls.length, 0);
      }
      const { handler, calls } = createHandler({
        analytics: Permission.VIEW,
      });
      assert.equal(JSON.parse(handler[method]({ action })).success, true);
      assert.equal(calls.length, 1);
      assert.equal(
        JSON.parse(handler[method]({ action: 'sendStatementEmail' })).success,
        false
      );
    });
  }

  test(`${method}: unclassified exports and prototype names are denied even to fully allowed roles`, () => {
    const { handler, calls } = createHandler({
      emailRoles: '100',
      analytics: Permission.FULL,
    });
    for (const action of [
      'unclassifiedExport',
      'constructor',
      'toString',
      '__proto__',
      '',
    ]) {
      assert.equal(JSON.parse(handler[method]({ action })).success, false);
    }
    assert.equal(calls.length, 0);
  });
}

for (const method of ['get', 'post']) {
  test(`${method}: an expected denial returns its message to the client`, () => {
    const message = 'You cannot approve a transaction you created.';
    const { handler } = createHandler({
      approve: () => {
        throw denial.actionDenied(message);
      },
    });
    assert.deepEqual(
      JSON.parse(handler[method]({ action: 'approveTransaction', id: 1 })),
      { success: false, error: 'ACTION_DENIED', message }
    );
  });

  test(`${method}: other action failures stay generic`, () => {
    const { handler } = createHandler({
      approve: () => {
        throw new Error('internal detail: record 42 locked by user 9');
      },
    });
    const response = handler[method]({ action: 'approveTransaction', id: 1 });
    assert.deepEqual(
      response,
      responses.errorResponse(
        'SUITEREACT_ACTION_FAILED',
        'The action failed; review the protected NetSuite script log'
      )
    );
    assert.doesNotMatch(response, /internal detail/);
  });
}
