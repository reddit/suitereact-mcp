/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';

import {
  evaluateAccess,
  levelRank,
  SR_DOC,
  SR_SPACE,
} from './_docSpaces/helpers';

/**
 * Sets (or clears) the landing doc for a space. The previously-flagged doc
 * has its is_landing flag cleared. Requires admin on the space.
 */
export const dsSetLandingDoc = (params: {
  spaceId: string;
  docId: string | null;
}): { ok: true } => {
  if (!params || !params.spaceId) throw new Error('spaceId is required');
  const access = evaluateAccess({
    targetType: 'space',
    targetId: params.spaceId,
  });
  if (levelRank(access) < 5) {
    throw new Error('Forbidden: only admins can set the landing doc.');
  }
  const space = record.load({
    type: SR_SPACE,
    id: params.spaceId,
    isDynamic: false,
  });
  const previousLanding = String(
    space.getValue('custrecord_space_landing_doc') || ''
  );
  if (previousLanding && previousLanding !== params.docId) {
    try {
      record.submitFields({
        type: SR_DOC,
        id: previousLanding,
        values: { custrecord_doc_is_landing: false },
      });
    } catch {
      // ignore: stale references are acceptable
    }
  }
  space.setValue({
    fieldId: 'custrecord_space_landing_doc',
    value: params.docId || '',
  });
  space.save({ ignoreMandatoryFields: true });
  if (params.docId) {
    record.submitFields({
      type: SR_DOC,
      id: params.docId,
      values: { custrecord_doc_is_landing: true },
    });
  }
  return { ok: true };
};
