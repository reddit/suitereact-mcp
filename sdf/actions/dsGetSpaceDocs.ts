/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import { getResultsFromSuiteQl } from '../utils/nsQueryUtils';

import {
  evaluateAccess,
  levelRank,
  sqlString,
  type DocStatus,
} from './_docSpaces/helpers';

export interface DocRow {
  id: string;
  slug: string;
  title: string;
  spaceId: string;
  fcFileId: number | null;
  status: DocStatus;
  isLanding: boolean;
  archived: boolean;
}

/**
 * Returns all docs in the given space. By default archived docs are hidden.
 */
export const dsGetSpaceDocs = (params: {
  spaceId: string;
  includeArchived?: boolean;
}): DocRow[] => {
  if (!params || !params.spaceId) {
    throw new Error('spaceId is required');
  }
  const access = evaluateAccess({
    targetType: 'space',
    targetId: params.spaceId,
  });
  if (levelRank(access) < 1) {
    throw new Error('Forbidden: view access is required to list documents.');
  }
  const rows = getResultsFromSuiteQl(
    `SELECT
       id,
       custrecord_doc_slug AS slug,
       name AS title,
       custrecord_doc_space AS space_id,
       custrecord_doc_fc_file AS fc_file_id,
       BUILTIN.DF(custrecord_doc_status) AS status,
       custrecord_doc_is_landing AS is_landing,
       custrecord_doc_archived AS archived
     FROM customrecord_sr_doc
     WHERE custrecord_doc_space = ${sqlString(params.spaceId)}
     ORDER BY name`
  );
  const out: DocRow[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const archived =
      String(row.archived || '') === 'T' || row.archived === true;
    if (archived && !params.includeArchived) continue;
    out.push({
      id: String(row.id),
      slug: String(row.slug || ''),
      title: String(row.title || ''),
      spaceId: String(row.space_id || params.spaceId),
      fcFileId: row.fc_file_id ? Number(row.fc_file_id) : null,
      status:
        (String(row.status || 'draft').toLowerCase() as DocStatus) || 'draft',
      isLanding: row.is_landing === true || String(row.is_landing) === 'T',
      archived,
    });
  }
  return out;
};
