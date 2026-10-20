/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import { getResultsFromSuiteQl } from '../utils/nsQueryUtils';

import { evaluateAccess, levelRank, sqlString } from './_docSpaces/helpers';

export interface EmployeeRow {
  id: string;
  entityId: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  department: string;
  subsidiary: string;
  inactive: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Searches the employee table by name, entityid, or email. Returns up to
 * `limit` rows (default 50, capped at 200). Inactive employees are excluded
 * by default.
 */
export const dsGetEmployees = (params: {
  spaceId: string;
  q?: string;
  limit?: number;
  includeInactive?: boolean;
}): EmployeeRow[] => {
  if (!params?.spaceId) throw new Error('spaceId is required');
  const access = evaluateAccess({
    targetType: 'space',
    targetId: params.spaceId,
  });
  if (levelRank(access) < 5) {
    throw new Error(
      'Forbidden: space admin access is required to search employees.'
    );
  }
  const q = String((params && params.q) || '').trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(params?.limit) || DEFAULT_LIMIT)
  );
  const where: string[] = [];
  if (!params?.includeInactive) {
    where.push("isinactive = 'F'");
  }
  if (q) {
    const like = sqlString(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(entityid) LIKE ${like} OR LOWER(firstname) LIKE ${like} OR LOWER(lastname) LIKE ${like} OR LOWER(email) LIKE ${like})`
    );
  }
  const sql = `SELECT id, entityid, firstname, lastname, email, title, BUILTIN.DF(department) AS department_name, BUILTIN.DF(subsidiary) AS subsidiary_name, isinactive
     FROM employee
     ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY lastname, firstname
     FETCH FIRST ${limit} ROWS ONLY`;
  const rows = getResultsFromSuiteQl(sql);
  return rows.map(r => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      entityId: String(row.entityid || ''),
      firstName: String(row.firstname || ''),
      lastName: String(row.lastname || ''),
      email: String(row.email || ''),
      title: String(row.title || ''),
      department: String(row.department_name || ''),
      subsidiary: String(row.subsidiary_name || ''),
      inactive: String(row.isinactive || '') === 'T' || row.isinactive === true,
    };
  });
};
