/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as search from 'N/search';

import { currentEmployeeId, SR_USER_PREF } from './_docSpaces/helpers';

/**
 * Returns the current user's preferences. Falls back to a null default when
 * no record exists.
 */
export const dsGetUserPrefs = (): { defaultSpaceId: string | null } => {
  const employee = currentEmployeeId();
  if (!employee) return { defaultSpaceId: null };
  const r = search
    .create({
      type: SR_USER_PREF as unknown as string,
      filters: [['custrecord_userpref_employee', 'anyof', employee]],
      columns: ['custrecord_userpref_default_space'],
    })
    .run()
    .getRange({ start: 0, end: 1 });
  if (r.length === 0) return { defaultSpaceId: null };
  const v = r[0].getValue('custrecord_userpref_default_space');
  return {
    defaultSpaceId: v ? String(v) : null,
  };
};
