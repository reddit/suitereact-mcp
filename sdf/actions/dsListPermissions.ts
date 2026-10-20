/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import {
  evaluateAccess,
  levelRank,
  listPermissionsRows,
  type TargetType,
} from './_docSpaces/helpers';

/**
 * Lists ACL grants on a target. Requires at least review access to view.
 */
export const dsListPermissions = (params: {
  targetType: TargetType;
  targetId: string;
}) => {
  if (!params || !params.targetType || !params.targetId) {
    throw new Error('targetType and targetId are required');
  }
  const access = evaluateAccess({
    targetType: params.targetType,
    targetId: params.targetId,
  });
  if (levelRank(access) < 3) {
    throw new Error(
      'Forbidden: at least review access is required to view permissions.'
    );
  }
  return listPermissionsRows(params);
};
