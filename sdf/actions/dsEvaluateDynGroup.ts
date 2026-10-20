/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as search from 'N/search';

import { getResultsFromSuiteQl } from '../utils/nsQueryUtils';

import { buildEmployeeSuiteQL, SR_DYNGROUP } from './_docSpaces/helpers';

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

const DEFAULT_PREVIEW_LIMIT = 50;

/**
 * Evaluates a dynamic-group criteria (or a saved group by id) and returns the
 * matching employee ids plus a total count. When `userId` is supplied, also
 * returns whether that user matches.
 */
export const dsEvaluateDynGroup = (params: {
  criteria?: DynCriteria;
  groupId?: string;
  userId?: string;
  limit?: number;
}): { ids: string[]; total: number; matches?: boolean } => {
  let criteria = params?.criteria;
  if (!criteria && params?.groupId) {
    const lk = search.lookupFields({
      type: SR_DYNGROUP,
      id: params.groupId,
      columns: ['custrecord_dyngroup_criteria'],
    });
    const json = String(lk.custrecord_dyngroup_criteria || '');
    if (!json) throw new Error('Group has no saved criteria.');
    try {
      criteria = JSON.parse(json) as DynCriteria;
    } catch {
      throw new Error('Group criteria JSON is invalid.');
    }
  }
  if (!criteria) {
    throw new Error('criteria or groupId is required');
  }
  const previewLimit = Math.min(
    500,
    Math.max(0, Number(params?.limit ?? DEFAULT_PREVIEW_LIMIT))
  );
  const countSql = buildEmployeeSuiteQL(criteria, { select: 'COUNT(*) AS c' });
  if (!countSql) {
    return { ids: [], total: 0 };
  }
  const totalRows = getResultsFromSuiteQl(countSql);
  const total = Number(
    (totalRows[0] as Record<string, unknown> | undefined)?.c || 0
  );

  let ids: string[] = [];
  if (previewLimit > 0) {
    const sample = buildEmployeeSuiteQL(criteria, {
      select: 'id',
      limit: previewLimit,
    });
    if (sample) {
      const rows = getResultsFromSuiteQl(sample);
      ids = rows.map(r => String((r as Record<string, unknown>).id));
    }
  }

  let matches: boolean | undefined;
  if (params?.userId) {
    const inGroup = buildEmployeeSuiteQL(criteria, {
      select: 'id',
      where: `id = '${String(params.userId).replace(/'/g, "''")}'`,
      limit: 1,
    });
    if (inGroup) {
      const rows = getResultsFromSuiteQl(inGroup);
      matches = rows.length > 0;
    } else {
      matches = false;
    }
  }
  return { ids, total, matches };
};
