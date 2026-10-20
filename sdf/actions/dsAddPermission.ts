/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';

import {
  currentEmployeeId,
  evaluateAccess,
  levelRank,
  SR_PERMISSION,
  type PermissionLevel,
  type PrincipalType,
  type TargetType,
} from './_docSpaces/helpers';

/**
 * Grants a permission on a target. The current user must be admin on the
 * target. Returns the new permission record id.
 */
export const dsAddPermission = (params: {
  targetType: TargetType;
  targetId: string;
  principalType: PrincipalType;
  principalId?: string;
  level: PermissionLevel;
}): { permissionId: string } => {
  if (
    !params ||
    !params.targetType ||
    !params.targetId ||
    !params.principalType ||
    !params.level
  ) {
    throw new Error(
      'targetType, targetId, principalType, and level are required'
    );
  }
  if (params.principalType !== 'everyone' && !params.principalId) {
    throw new Error('principalId is required for non-everyone grants');
  }
  const access = evaluateAccess({
    targetType: params.targetType,
    targetId: params.targetId,
  });
  if (levelRank(access) < 5) {
    throw new Error(
      'Forbidden: admin access is required to grant permissions.'
    );
  }
  const rec = record.create({ type: SR_PERMISSION, isDynamic: false });
  rec.setValue({
    fieldId: 'name',
    value: `${params.principalType}:${
      params.principalId || 'everyone'
    }@${params.targetType}:${params.targetId}`,
  });
  rec.setText({
    fieldId: 'custrecord_perm_target_type',
    text: params.targetType,
  });
  rec.setValue({
    fieldId: 'custrecord_perm_target_id',
    value: params.targetId,
  });
  rec.setText({
    fieldId: 'custrecord_perm_principal_type',
    text: params.principalType,
  });
  if (params.principalId) {
    rec.setValue({
      fieldId: 'custrecord_perm_principal_id',
      value: params.principalId,
    });
  }
  rec.setText({ fieldId: 'custrecord_perm_level', text: params.level });
  const grantedBy = currentEmployeeId();
  if (grantedBy) {
    rec.setValue({
      fieldId: 'custrecord_perm_granted_by',
      value: grantedBy,
    });
  }
  const id = rec.save({ ignoreMandatoryFields: true });
  return { permissionId: String(id) };
};
