/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import { getResultsFromSuiteQl } from '../utils/nsQueryUtils';

import {
  evaluateAccess,
  levelRank,
  type SpaceType,
} from './_docSpaces/helpers';

export interface SpaceRow {
  id: string;
  slug: string;
  name: string;
  type: SpaceType;
  description: string;
  ownerId: string;
  landingDocId: string | null;
  fcFolderId: number | null;
  archived: boolean;
}

/**
 * Returns non-archived spaces where the current user has at least view access.
 */
export const dsGetSpaces = (): SpaceRow[] => {
  const rows = getResultsFromSuiteQl(
    `SELECT
       id,
       custrecord_space_slug AS slug,
       name,
       BUILTIN.DF(custrecord_space_type) AS type,
       custrecord_space_description AS description,
       custrecord_space_owner AS owner_id,
       custrecord_space_landing_doc AS landing_doc_id,
       custrecord_space_fc_folder AS fc_folder_id,
       custrecord_space_archived AS archived
     FROM customrecord_sr_space
     ORDER BY name`
  );
  const out: SpaceRow[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const archived =
      String(row.archived || '') === 'T' || row.archived === true;
    if (archived) continue;
    const id = String(row.id);
    const access = evaluateAccess({ targetType: 'space', targetId: id });
    if (levelRank(access) < 1) continue;
    out.push({
      id,
      slug: String(row.slug || ''),
      name: String(row.name || ''),
      type: (String(row.type || 'adhoc').toLowerCase() as SpaceType) || 'adhoc',
      description: String(row.description || ''),
      ownerId: String(row.owner_id || ''),
      landingDocId: row.landing_doc_id ? String(row.landing_doc_id) : null,
      fcFolderId: row.fc_folder_id ? Number(row.fc_folder_id) : null,
      archived: false,
    });
  }
  return out;
};
