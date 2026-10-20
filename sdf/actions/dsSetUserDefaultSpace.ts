/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';
import * as search from 'N/search';

import { currentEmployeeId, SR_USER_PREF } from './_docSpaces/helpers';

/**
 * Stores (or clears) the current user's default landing space. There is at
 * most one user-pref record per employee. Returns ok on success.
 */
export const dsSetUserDefaultSpace = (params: {
  spaceId: string | null;
}): { ok: true } => {
  const employee = currentEmployeeId();
  if (!employee) {
    throw new Error('No current employee — please run inside NetSuite.');
  }
  const existingId = findUserPrefId(employee);
  if (existingId) {
    record.submitFields({
      type: SR_USER_PREF,
      id: existingId,
      values: {
        custrecord_userpref_default_space: params.spaceId || '',
      },
    });
    return { ok: true };
  }
  if (!params.spaceId) {
    return { ok: true };
  }
  const rec = record.create({ type: SR_USER_PREF, isDynamic: false });
  rec.setValue({ fieldId: 'custrecord_userpref_employee', value: employee });
  rec.setValue({
    fieldId: 'custrecord_userpref_default_space',
    value: params.spaceId,
  });
  rec.save({ ignoreMandatoryFields: true });
  return { ok: true };
};

const findUserPrefId = (employeeId: string): string | null => {
  const r = search
    .create({
      type: 'customrecord_sr_user_pref',
      filters: [['custrecord_userpref_employee', 'anyof', employeeId]],
      columns: ['internalid'],
    })
    .run()
    .getRange({ start: 0, end: 1 });
  if (r.length === 0) return null;
  return r[0].id;
};
