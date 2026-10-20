/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';

import {
  currentEmployeeId,
  ensureSpaceFolder,
  findSpaceIdBySlug,
  normalizeSlug,
  SR_PERMISSION,
  SR_SPACE,
  type SpaceType,
} from './_docSpaces/helpers';

/**
 * Creates a new space. Owner is set to the current user, who is also granted
 * an admin permission. Optionally grants everyone:view at creation time.
 */
export const dsCreateSpace = (params: {
  slug: string;
  name: string;
  type?: SpaceType;
  description?: string;
  everyoneView?: boolean;
}): { spaceId: string } => {
  if (!params || !params.slug || !params.name) {
    throw new Error('slug and name are required');
  }
  const slug = normalizeSlug(params.slug);
  if (!slug) throw new Error('Slug is empty after normalization.');
  const existing = findSpaceIdBySlug(slug);
  if (existing) {
    throw new Error(`Slug "${slug}" is already in use.`);
  }
  const folderId = ensureSpaceFolder(slug);
  const owner = currentEmployeeId();
  const rec = record.create({ type: SR_SPACE, isDynamic: false });
  rec.setValue({ fieldId: 'name', value: params.name });
  rec.setValue({ fieldId: 'custrecord_space_slug', value: slug });
  rec.setText({
    fieldId: 'custrecord_space_type',
    text: params.type || 'adhoc',
  });
  if (params.description) {
    rec.setValue({
      fieldId: 'custrecord_space_description',
      value: params.description,
    });
  }
  if (owner) {
    rec.setValue({ fieldId: 'custrecord_space_owner', value: owner });
  }
  rec.setValue({ fieldId: 'custrecord_space_fc_folder', value: folderId });
  rec.setValue({ fieldId: 'custrecord_space_archived', value: false });
  const spaceId = String(rec.save({ ignoreMandatoryFields: true }));

  if (owner) {
    grantPermission(spaceId, 'employee', owner, 'admin');
  }
  if (params.everyoneView !== false) {
    grantPermission(spaceId, 'everyone', '', 'view');
  }
  return { spaceId };
};

const grantPermission = (
  spaceId: string,
  principalType: 'everyone' | 'employee' | 'dyngroup',
  principalId: string,
  level: 'view' | 'edit' | 'admin' | 'comment' | 'review'
): void => {
  const rec = record.create({ type: SR_PERMISSION, isDynamic: false });
  rec.setValue({
    fieldId: 'name',
    value: `${principalType}:${principalId || 'everyone'}@space:${spaceId}`,
  });
  rec.setText({
    fieldId: 'custrecord_perm_target_type',
    text: 'space',
  });
  rec.setValue({ fieldId: 'custrecord_perm_target_id', value: spaceId });
  rec.setText({
    fieldId: 'custrecord_perm_principal_type',
    text: principalType,
  });
  if (principalId) {
    rec.setValue({
      fieldId: 'custrecord_perm_principal_id',
      value: principalId,
    });
  }
  rec.setText({ fieldId: 'custrecord_perm_level', text: level });
  const grantedBy = currentEmployeeId();
  if (grantedBy) {
    rec.setValue({
      fieldId: 'custrecord_perm_granted_by',
      value: grantedBy,
    });
  }
  rec.save({ ignoreMandatoryFields: true });
};
