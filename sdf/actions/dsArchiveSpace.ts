/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';

import { evaluateAccess, levelRank, SR_SPACE } from './_docSpaces/helpers';

/**
 * Marks a space as archived. Docs are preserved. Requires admin.
 */
export const dsArchiveSpace = (params: { spaceId: string }): { ok: true } => {
  if (!params || !params.spaceId) throw new Error('spaceId is required');
  const access = evaluateAccess({
    targetType: 'space',
    targetId: params.spaceId,
  });
  if (levelRank(access) < 5) {
    throw new Error('Forbidden: only admins can archive a space.');
  }
  record.submitFields({
    type: SR_SPACE,
    id: params.spaceId,
    values: { custrecord_space_archived: true },
  });
  return { ok: true };
};
