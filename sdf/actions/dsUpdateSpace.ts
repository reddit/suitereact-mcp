/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';

import {
  evaluateAccess,
  levelRank,
  SR_SPACE,
  type SpaceType,
} from './_docSpaces/helpers';

/**
 * Updates mutable space metadata. Requires admin on the space.
 */
export const dsUpdateSpace = (params: {
  spaceId: string;
  name?: string;
  description?: string;
  type?: SpaceType;
}): { ok: true } => {
  if (!params || !params.spaceId) throw new Error('spaceId is required');
  const access = evaluateAccess({
    targetType: 'space',
    targetId: params.spaceId,
  });
  if (levelRank(access) < 5) {
    throw new Error('Forbidden: only admins can update space settings.');
  }
  const rec = record.load({
    type: SR_SPACE,
    id: params.spaceId,
    isDynamic: false,
  });
  if (params.name !== undefined) {
    rec.setValue({ fieldId: 'name', value: params.name });
  }
  if (params.description !== undefined) {
    rec.setValue({
      fieldId: 'custrecord_space_description',
      value: params.description,
    });
  }
  if (params.type) {
    rec.setText({ fieldId: 'custrecord_space_type', text: params.type });
  }
  rec.save({ ignoreMandatoryFields: true });
  return { ok: true };
};
