import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadModule } from './helpers/load-suitescript.mjs';

const types = {
  space: 'customrecord_sr_space',
  doc: 'customrecord_sr_doc',
  permission: 'customrecord_sr_permission',
  group: 'customrecord_sr_dyngroup',
  prefs: 'customrecord_sr_user_pref',
};
const criteria = {
  logic: 'and',
  rules: [{ field: 'department', op: 'equals', value: '7' }],
};

function fixture({
  employee = 42,
  role = 100,
  executionContext = 'RESTLET',
  grants = {},
} = {}) {
  const persisted = new Map();
  const writes = [];
  const runtime = {
    executionContext,
    ContextType: { RESTLET: 'RESTLET' },
    getCurrentUser: () => ({ id: employee, role }),
  };
  function makeRecord(type, fields = {}, id = '12') {
    return {
      type,
      id,
      getFields: () => Object.keys(fields),
      getValue: ({ fieldId }) => fields[fieldId],
      getText: ({ fieldId }) => fields[fieldId],
      setValue: ({ fieldId, value }) => {
        writes.push({ fieldId, value });
        fields[fieldId] = value;
      },
      save: () => {
        writes.push({ saved: id });
        return id;
      },
    };
  }
  const record = {
    load: ({ type, id }) => {
      const result = persisted.get(`${type}:${id}`);
      assert.ok(result, `Unexpected load: ${type}:${id}`);
      return result;
    },
    create: ({ type }) => makeRecord(type),
  };
  const helpers = loadModule('sdf/actions/_docSpaces/helpers.ts', {
    'N/runtime': runtime,
    'N/record': record,
    'N/file': {},
    'N/search': {},
    '../../utils/nsQueryUtils': {},
  });
  const guard = loadModule('sdf/scripts/sr_ue_doc_spaces_access.ts', {
    'N/record': record,
    'N/runtime': runtime,
    '../actions/_docSpaces/helpers': {
      ...helpers,
      evaluateAccess: ({ targetType, targetId }) =>
        grants[`${targetType}:${targetId}`] ?? null,
    },
  });
  const saveGroup = loadModule('sdf/actions/dsSaveDynGroup.ts', {
    'N/record': record,
    './_docSpaces/helpers': helpers,
  }).dsSaveDynGroup;
  function submit(
    kind,
    { event = 'edit', original = {}, changes = {}, id = '12' } = {}
  ) {
    const type = types[kind];
    persisted.set(`${type}:${id}`, makeRecord(type, original, id));
    guard.beforeSubmit({
      type: event,
      newRecord: makeRecord(type, changes, id),
      UserEventType: {
        CREATE: 'create',
        EDIT: 'edit',
        XEDIT: 'xedit',
        DELETE: 'delete',
      },
    });
  }
  return { submit, persisted, makeRecord, helpers, saveGroup, writes };
}

test('backing records require explicit native permissions and an active guard', () => {
  const deployment = readFileSync(
    'sdf/objects/userevent/customscript_sr_ue_doc_spaces_access.xml',
    'utf8'
  );
  for (const type of Object.values(types)) {
    const xml = readFileSync(`sdf/objects/customrecord/${type}.xml`, 'utf8');
    assert.match(xml, /<accesstype>USEPERMISSIONLIST<\/accesstype>/);
    for (const field of [
      'allowuiaccess',
      'allowmobileaccess',
      'allowquicksearch',
    ]) {
      assert.ok(xml.includes(`<${field}>F</${field}>`));
    }
    assert.ok(deployment.includes(`[scriptid=${type}]`));
  }
  assert.equal(
    (deployment.match(/<isdeployed>T<\/isdeployed>/g) ?? []).length,
    5
  );
  assert.equal(
    (deployment.match(/<status>RELEASED<\/status>/g) ?? []).length,
    5
  );
  assert.equal((deployment.match(/<allroles>T<\/allroles>/g) ?? []).length, 5);
  assert.doesNotMatch(deployment, /<runasrole>|<executioncontext>|<eventtype>/);
});

for (const executionContext of [
  'USERINTERFACE',
  'RESTWEBSERVICES',
  'WEBSERVICES',
  'CSVIMPORT',
  'SCHEDULED',
]) {
  test(`direct ${executionContext} writes are denied even for an administrator`, () => {
    const f = fixture({
      role: 3,
      executionContext,
      grants: { 'space:12': 'admin' },
    });
    assert.throws(
      () =>
        f.submit('permission', {
          event: 'create',
          changes: {
            custrecord_perm_target_type: 'space',
            custrecord_perm_target_id: '12',
          },
        }),
      /Forbidden/
    );
  });
}

test('only a target administrator can add a grant', () => {
  const request = {
    event: 'create',
    changes: {
      custrecord_perm_target_type: 'space',
      custrecord_perm_target_id: '12',
    },
  };
  for (const level of [null, 'view', 'edit']) {
    assert.throws(
      () =>
        fixture({ grants: { 'space:12': level } }).submit(
          'permission',
          request
        ),
      /Forbidden/
    );
  }
  fixture({ grants: { 'space:12': 'admin' } }).submit('permission', request);
});

for (const event of ['edit', 'xedit']) {
  test(`grants cannot be rewritten or retargeted through ${event}`, () => {
    assert.throws(
      () =>
        fixture({ grants: { 'space:12': 'admin' } }).submit('permission', {
          event,
          original: {
            custrecord_perm_target_type: 'space',
            custrecord_perm_target_id: '12',
          },
          changes: { custrecord_perm_target_id: '99' },
        }),
      /Forbidden/
    );
  });
}

test('grant revocation authorizes the persisted target, ignoring forged input', () => {
  const request = {
    event: 'delete',
    original: {
      custrecord_perm_target_type: 'space',
      custrecord_perm_target_id: '99',
    },
    changes: {
      custrecord_perm_target_type: 'space',
      custrecord_perm_target_id: '12',
    },
  };
  assert.throws(
    () =>
      fixture({ grants: { 'space:12': 'admin' } }).submit(
        'permission',
        request
      ),
    /Forbidden/
  );
  fixture({ grants: { 'space:99': 'admin' } }).submit('permission', request);
});

test('space creation binds ownership to the authenticated employee', () => {
  fixture().submit('space', {
    event: 'create',
    changes: { custrecord_space_owner: '42' },
  });
  assert.throws(
    () =>
      fixture().submit('space', {
        event: 'create',
        changes: { custrecord_space_owner: '7' },
      }),
    /Forbidden/
  );
  assert.throws(
    () =>
      fixture({ employee: -4 }).submit('space', {
        event: 'create',
        changes: { custrecord_space_owner: '-4' },
      }),
    /Forbidden/
  );
});

test('space edits cannot claim ownership or change backing folders', () => {
  for (const field of [
    'custrecord_space_owner',
    'custrecord_space_slug',
    'custrecord_space_fc_folder',
  ]) {
    assert.throws(
      () =>
        fixture({ grants: { 'space:12': 'admin' } }).submit('space', {
          event: 'xedit',
          original: { [field]: '7' },
          changes: { [field]: '42' },
        }),
      /Forbidden/
    );
  }
  assert.throws(
    () =>
      fixture({ grants: { 'space:12': 'edit' } }).submit('space', {
        changes: { name: 'Renamed' },
      }),
    /Forbidden/
  );
  fixture({ grants: { 'space:12': 'admin' } }).submit('space', {
    changes: { name: 'Renamed' },
  });
});

test('document edits honor document access and preserve their parent and author', () => {
  const original = {
    custrecord_doc_space: '9',
    custrecord_doc_author: '42',
    custrecord_doc_is_landing: false,
  };
  const grants = { 'space:9': 'admin', 'doc:12': 'view' };
  assert.throws(
    () =>
      fixture({ grants }).submit('doc', {
        event: 'xedit',
        original,
        changes: { name: 'Updated' },
      }),
    /Forbidden/
  );
  grants['doc:12'] = 'edit';
  fixture({ grants }).submit('doc', {
    event: 'xedit',
    original,
    changes: { name: 'Updated' },
  });
  fixture({ grants: { 'doc:12': 'edit' } }).submit('doc', {
    original,
    changes: { ...original, name: 'Updated' },
  });
  for (const field of ['custrecord_doc_space', 'custrecord_doc_author']) {
    assert.throws(
      () =>
        fixture({ grants }).submit('doc', {
          original,
          changes: { [field]: '999' },
        }),
      /Forbidden/
    );
  }
  assert.throws(
    () =>
      fixture({ grants: { 'doc:12': 'edit' } }).submit('doc', {
        event: 'xedit',
        original,
        changes: { custrecord_doc_is_landing: true },
      }),
    /Forbidden/
  );
});

test('new documents require space edit access and their actual author', () => {
  const request = {
    event: 'create',
    changes: { custrecord_doc_space: '9', custrecord_doc_author: '42' },
  };
  assert.throws(
    () => fixture({ grants: { 'space:9': 'view' } }).submit('doc', request),
    /Forbidden/
  );
  fixture({ grants: { 'space:9': 'edit' } }).submit('doc', request);
});

test('partial group writes cannot hide or replace a foreign owner', () => {
  const original = {
    custrecord_dyngroup_owner: '7',
    custrecord_dyngroup_criteria: JSON.stringify(criteria),
  };
  for (const changes of [
    { name: 'Updated' },
    { custrecord_dyngroup_owner: '42' },
  ]) {
    assert.throws(
      () => fixture().submit('group', { event: 'xedit', original, changes }),
      /Forbidden/
    );
  }
  fixture({ employee: 7 }).submit('group', {
    event: 'xedit',
    original,
    changes: { name: 'Updated' },
  });
  fixture({ role: 3 }).submit('group', {
    event: 'xedit',
    original,
    changes: { name: 'Updated' },
  });
});

test('preferences stay bound to their authenticated employee', () => {
  for (const changes of [
    { custrecord_userpref_default_space: '9' },
    { custrecord_userpref_employee: '42' },
  ]) {
    assert.throws(
      () =>
        fixture().submit('prefs', {
          event: 'xedit',
          original: { custrecord_userpref_employee: '7' },
          changes,
        }),
      /Forbidden/
    );
  }
  fixture().submit('prefs', {
    event: 'create',
    changes: { custrecord_userpref_employee: '42' },
  });
});

test('the group action rejects foreign owners before making any changes', () => {
  for (const owner of ['7', '']) {
    const f = fixture();
    f.persisted.set(
      `${types.group}:12`,
      f.makeRecord(types.group, { custrecord_dyngroup_owner: owner })
    );
    assert.throws(
      () => f.saveGroup({ groupId: '12', name: 'Updated', criteria }),
      /Forbidden/
    );
    assert.equal(f.writes.length, 0);
  }
});

test('the owner and Administrator can update a group; new groups require an employee', () => {
  for (const [employee, role] of [
    [7, 100],
    [42, 3],
  ]) {
    const f = fixture({ employee, role });
    f.persisted.set(
      `${types.group}:12`,
      f.makeRecord(types.group, { custrecord_dyngroup_owner: '7' })
    );
    assert.equal(
      f.saveGroup({ groupId: '12', name: 'Updated', criteria }).groupId,
      '12'
    );
    assert.ok(f.writes.some(write => write.saved));
  }
  assert.throws(
    () => fixture({ employee: -4 }).saveGroup({ name: 'New', criteria }),
    /employee/
  );
});

test('group membership scopes the whole OR expression to the current employee', () => {
  const { helpers } = fixture();
  const sql = helpers.buildEmployeeSuiteQL(
    {
      logic: 'or',
      rules: [
        ...criteria.rules,
        { field: 'title', op: 'equals', value: 'Engineer' },
      ],
    },
    { select: 'id', where: "id = '42'" }
  );
  assert.equal(
    sql,
    "SELECT id FROM employee WHERE ((department = '7') OR (title = 'Engineer')) AND id = '42'"
  );
});

test('empty or partly invalid group rules never degrade into all-employee membership', () => {
  const { helpers, saveGroup } = fixture();
  for (const rules of [
    [],
    [{ field: 'id', op: 'unsupported' }],
    [...criteria.rules, { field: 'id; DROP TABLE employee', op: 'equals' }],
  ]) {
    const invalid = { logic: 'and', rules };
    assert.equal(
      helpers.buildEmployeeSuiteQL(invalid, { where: "id = '42'" }),
      null
    );
    assert.throws(
      () => saveGroup({ name: 'Invalid group', criteria: invalid }),
      /valid employee rules/
    );
  }
});
