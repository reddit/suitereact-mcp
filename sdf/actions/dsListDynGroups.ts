/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as runtime from 'N/runtime';

import { getResultsFromSuiteQl } from '../utils/nsQueryUtils';
import { currentEmployeeId, sqlString } from './_docSpaces/helpers';

export interface DynGroupRow {
  id: string;
  name: string;
  description: string;
  criteriaJson: string;
  ownerId: string;
}

/**
 * Returns definitions the current employee can administer: their own, or all
 * of them for the Administrator role.
 */
export const dsListDynGroups = (): DynGroupRow[] => {
  const employeeId = currentEmployeeId();
  if (!employeeId)
    throw new Error('A current employee is required to list groups.');
  const isAdministrator = String(runtime.getCurrentUser().role) === '3';
  const rows = getResultsFromSuiteQl(
    `SELECT
       id,
       name,
       custrecord_dyngroup_description AS description,
       custrecord_dyngroup_criteria AS criteria,
       custrecord_dyngroup_owner AS owner_id
     FROM customrecord_sr_dyngroup
     ${isAdministrator ? '' : `WHERE custrecord_dyngroup_owner = ${sqlString(employeeId)}`}
     ORDER BY name`
  );
  return rows
    .filter(r => isAdministrator || String(r.owner_id || '') === employeeId)
    .map(r => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name || ''),
        description: String(row.description || ''),
        criteriaJson: String(row.criteria || ''),
        ownerId: String(row.owner_id || ''),
      };
    });
};
