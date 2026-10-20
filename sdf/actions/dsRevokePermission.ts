/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';
import * as search from 'N/search';

import { evaluateAccess, levelRank, SR_PERMISSION } from './_docSpaces/helpers';

/**
 * Removes a permission record. Requires admin on the original target.
 */
export const dsRevokePermission = (params: {
  permissionId: string;
}): { ok: true } => {
  if (!params || !params.permissionId) {
    throw new Error('permissionId is required');
  }
  const lookup = search.lookupFields({
    type: SR_PERMISSION,
    id: params.permissionId,
    columns: ['custrecord_perm_target_type', 'custrecord_perm_target_id'],
  });
  const targetTypeRaw = Array.isArray(lookup.custrecord_perm_target_type)
    ? lookup.custrecord_perm_target_type[0]?.text || ''
    : String(lookup.custrecord_perm_target_type || '');
  const targetType = String(targetTypeRaw || '').toLowerCase() as
    | 'space'
    | 'doc';
  const targetId = String(lookup.custrecord_perm_target_id || '');
  if (targetType !== 'space' && targetType !== 'doc') {
    throw new Error('Permission record is malformed.');
  }
  const access = evaluateAccess({ targetType, targetId });
  if (levelRank(access) < 5) {
    throw new Error(
      'Forbidden: admin access is required to revoke permissions.'
    );
  }
  record.delete({ type: SR_PERMISSION, id: params.permissionId });
  return { ok: true };
};
