import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadModule } from './helpers/load-suitescript.mjs';

function fixture({ employee = 42, role = 100 } = {}) {
  const runtime = { getCurrentUser: () => ({ id: employee, role }) };
  const helpers = loadModule('sdf/actions/_docSpaces/helpers.ts', {
    'N/runtime': runtime,
    'N/record': {},
    'N/file': {},
    'N/search': {},
    '../../utils/nsQueryUtils': {},
  });
  const queries = [];
  const action = loadModule('sdf/actions/dsListDynGroups.ts', {
    'N/runtime': runtime,
    './_docSpaces/helpers': helpers,
    '../utils/nsQueryUtils': {
      getResultsFromSuiteQl: sql => {
        queries.push(sql);
        return [
          { id: 1, name: 'Mine', owner_id: 42, criteria: 'own criteria' },
          {
            id: 2,
            name: 'Foreign',
            owner_id: 77,
            criteria: 'foreign criteria',
          },
        ];
      },
    },
  }).dsListDynGroups;
  return { action, queries };
}

test('group listings scope both the query and returned definitions to the owner', () => {
  const f = fixture();
  const rows = f.action();
  assert.match(f.queries[0], /WHERE custrecord_dyngroup_owner = '42'/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ownerId, '42');
  assert.equal(rows[0].criteriaJson, 'own criteria');
  assert.equal(JSON.stringify(rows).includes('foreign criteria'), false);
});

test('the Administrator can list all group definitions', () => {
  const f = fixture({ role: 3 });
  assert.equal(f.action().length, 2);
  assert.doesNotMatch(f.queries[0], /WHERE custrecord_dyngroup_owner/);
});

test('a caller without an employee identity cannot query group definitions', () => {
  for (const employee of [0, -4, null]) {
    const f = fixture({ employee, role: 3 });
    assert.throws(f.action, /current employee is required/);
    assert.equal(f.queries.length, 0);
  }
});
