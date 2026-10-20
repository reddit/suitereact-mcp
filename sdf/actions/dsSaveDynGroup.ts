/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';

import {
  assertDynGroupOwner,
  buildEmployeeSuiteQL,
  currentEmployeeId,
  SR_DYNGROUP,
} from './_docSpaces/helpers';

interface DynRule {
  field: string;
  op: string;
  value?: unknown;
  value2?: unknown;
}

interface DynCriteria {
  logic: 'and' | 'or';
  rules: DynRule[];
}

/**
 * Creates or updates a dynamic permission group. The current user becomes the
 * owner on create. Updates require ownership or the Administrator role.
 */
export const dsSaveDynGroup = (params: {
  groupId?: string;
  name: string;
  description?: string;
  criteria: DynCriteria;
}): { groupId: string } => {
  if (!params || !params.name || !params.criteria) {
    throw new Error('name and criteria are required');
  }
  if (!buildEmployeeSuiteQL(params.criteria)) {
    throw new Error('Group criteria must contain valid employee rules.');
  }
  const json = JSON.stringify(params.criteria);
  if (params.groupId) {
    const rec = record.load({
      type: SR_DYNGROUP,
      id: params.groupId,
      isDynamic: false,
    });
    assertDynGroupOwner(rec.getValue({ fieldId: 'custrecord_dyngroup_owner' }));
    rec.setValue({ fieldId: 'name', value: params.name });
    rec.setValue({
      fieldId: 'custrecord_dyngroup_description',
      value: params.description || '',
    });
    rec.setValue({
      fieldId: 'custrecord_dyngroup_criteria',
      value: json,
    });
    rec.save({ ignoreMandatoryFields: true });
    return { groupId: params.groupId };
  }
  const owner = currentEmployeeId();
  if (!owner)
    throw new Error('A current employee is required to create groups.');
  const rec = record.create({ type: SR_DYNGROUP, isDynamic: false });
  rec.setValue({ fieldId: 'name', value: params.name });
  rec.setValue({
    fieldId: 'custrecord_dyngroup_description',
    value: params.description || '',
  });
  rec.setValue({ fieldId: 'custrecord_dyngroup_criteria', value: json });
  rec.setValue({ fieldId: 'custrecord_dyngroup_owner', value: owner });
  const id = rec.save({ ignoreMandatoryFields: true });
  return { groupId: String(id) };
};
