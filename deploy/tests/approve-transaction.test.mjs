import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

import { loadModule } from './helpers/load-suitescript.mjs';

const denial = loadModule('sdf/domain/actionDenial.ts');

const NOT_ASSIGNED = /Only its assigned next approver can approve it/;
const SELF = /cannot approve a transaction you created or that is for you/;
const UNKNOWN = /Cannot confirm who created this transaction/;
const ME = 501;
const OTHER = 777;

async function load({
  type = 'journalentry',
  status = 1,
  nextApprover = '-1',
  createdby = OTHER,
  creatednote = null,
  body = {},
} = {}) {
  const { outputText } = ts.transpileModule(
    await readFile('sdf/actions/approveTransaction.ts', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  );
  const calls = { load: [], save: [], set: [], audit: [], queries: [] };
  const values = {
    approvalstatus: status,
    nextapprover: nextApprover,
    ...body,
  };
  const mocks = {
    '../domain/actionDenial': denial,
    'N/log': {
      audit: (title, details) => calls.audit.push({ title, details }),
    },
    'N/runtime': { getCurrentUser: () => ({ id: ME, role: 1053 }) },
    'N/query': {
      runSuiteQL: ({ query, params }) => {
        calls.queries.push({ query, params });
        return {
          asMappedResults: () => [{ createdby, creatednote }],
        };
      },
    },
    'N/record': {
      load: options => {
        calls.load.push(options);
        assert.equal(options.type, type);
        return {
          getValue: ({ fieldId }) => values[fieldId],
          setValue: ({ fieldId, value }) => calls.set.push({ fieldId, value }),
          save: (...args) => {
            calls.save.push(args);
            return options.id;
          },
        };
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(
    name => {
      if (!(name in mocks)) throw new Error(`unexpected import ${name}`);
      return mocks[name];
    },
    module.exports,
    module
  );
  return { ...module.exports, calls };
}

const approved = calls => {
  assert.deepEqual(calls.set, [{ fieldId: 'approvalstatus', value: 2 }]);
  assert.equal(calls.save.length, 1);
};
const denied = (calls, reason) => {
  assert.equal(calls.save.length, 0, 'nothing saved');
  assert.equal(calls.set.length, 0, 'nothing changed');
  assert.equal(calls.audit.at(-1)?.details.reason, reason);
};

test('approves when unassigned and the creator is someone else', async () => {
  const m = await load();
  const result = m.approveTransaction({ id: '42', recordtype: 'journalentry' });
  assert.equal(result.success, true);
  approved(m.calls);
  assert.deepEqual(m.calls.queries[0].params, [42]);
  assert.equal(m.calls.audit.at(-1).title, 'approveTransaction');
  assert.equal(m.calls.audit.at(-1).details.user, ME);
});

test('the save enforces mandatory fields', async () => {
  const m = await load();
  m.approveTransaction({ id: 42, recordtype: 'journalentry' });
  const [options] = m.calls.save[0];
  assert.notEqual(options?.ignoreMandatoryFields, true);
});

test('only the assigned next approver may approve', async () => {
  const other = await load({ nextApprover: String(OTHER), createdby: null });
  assert.throws(
    () => other.approveTransaction({ id: 42, recordtype: 'journalentry' }),
    { name: 'ACTION_DENIED', message: NOT_ASSIGNED }
  );
  denied(other.calls, 'not the assigned approver');

  const me = await load({ nextApprover: String(ME), createdby: null });
  me.approveTransaction({ id: 42, recordtype: 'journalentry' });
  approved(me.calls);
});

test('the assigned approver still cannot approve their own transaction', async () => {
  const m = await load({ nextApprover: String(ME), createdby: ME });
  assert.throws(
    () => m.approveTransaction({ id: 42, recordtype: 'journalentry' }),
    { name: 'ACTION_DENIED', message: SELF }
  );
  denied(m.calls, 'self-approval');
});

test('the creator cannot approve their own transaction', async () => {
  const m = await load({ createdby: ME });
  assert.throws(
    () => m.approveTransaction({ id: 42, recordtype: 'journalentry' }),
    { name: 'ACTION_DENIED', message: SELF }
  );
  denied(m.calls, 'self-approval');
});

test('the creation system note identifies the creator when createdby is empty', async () => {
  const self = await load({ createdby: null, creatednote: ME });
  assert.throws(
    () => self.approveTransaction({ id: 42, recordtype: 'journalentry' }),
    { name: 'ACTION_DENIED', message: SELF }
  );
  denied(self.calls, 'self-approval');

  const other = await load({ createdby: null, creatednote: -4 });
  other.approveTransaction({ id: 42, recordtype: 'journalentry' });
  approved(other.calls);
});

test('an unknown creator with no assigned approver is denied', async () => {
  for (const nextApprover of ['-1', '', null]) {
    const m = await load({ nextApprover, createdby: null, creatednote: null });
    assert.throws(
      () => m.approveTransaction({ id: 42, recordtype: 'journalentry' }),
      { name: 'ACTION_DENIED', message: UNKNOWN }
    );
    denied(m.calls, 'creator unknown');
  }
});

test('the employee an expense report or purchase order is for cannot approve it', async () => {
  for (const [type, field] of [
    ['expensereport', 'entity'],
    ['purchaseorder', 'employee'],
  ]) {
    const m = await load({ type, body: { [field]: ME } });
    assert.throws(() => m.approveTransaction({ id: 42, recordtype: type }), {
      name: 'ACTION_DENIED',
      message: SELF,
    });
    denied(m.calls, 'self-approval');
  }
});

test('only transactions pending approval can be approved', async () => {
  for (const status of [2, 3]) {
    const m = await load({ status });
    assert.throws(
      () => m.approveTransaction({ id: 42, recordtype: 'journalentry' }),
      { name: 'ACTION_DENIED', message: /no longer pending approval/ }
    );
    denied(m.calls, 'not pending');
  }
});

test('unsupported record types and invalid ids are rejected before loading', async () => {
  const m = await load();
  assert.throws(
    () => m.approveTransaction({ id: 42, recordtype: 'vendorbill' }),
    error => error.name === 'Error' && /not supported/.test(error.message)
  );
  assert.throws(
    () => m.approveTransaction({ id: '42; DROP', recordtype: 'invoice' }),
    error =>
      error.name === 'Error' && /Invalid parameter: id/.test(error.message)
  );
  assert.equal(m.calls.load.length, 0);
});
