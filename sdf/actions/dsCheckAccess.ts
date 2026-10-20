/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import {
  evaluateAccess,
  type PermissionLevel,
  type TargetType,
} from './_docSpaces/helpers';

/**
 * Returns the strongest level the current user holds against the given
 * target. Returns level: null when the user has no grants.
 */
export const dsCheckAccess = (params: {
  targetType: TargetType;
  targetId: string;
}): { level: PermissionLevel | null } => {
  if (!params || !params.targetType || !params.targetId) {
    throw new Error('targetType and targetId are required');
  }
  const level = evaluateAccess({
    targetType: params.targetType,
    targetId: params.targetId,
  });
  return { level };
};
