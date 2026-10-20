/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';
import * as search from 'N/search';

import { evaluateAccess, levelRank, SR_DOC } from './_docSpaces/helpers';

/**
 * Marks a doc as published. Requires edit on the doc or its parent space.
 */
export const dsPublishDoc = (params: { docId: string }): { ok: true } => {
  if (!params || !params.docId) throw new Error('docId is required');
  const access = evaluateAccess({ targetType: 'doc', targetId: params.docId });
  if (levelRank(access) < 4) {
    throw new Error('Forbidden: edit access is required to publish.');
  }
  record.submitFields({
    type: SR_DOC,
    id: params.docId,
    values: {
      custrecord_doc_status: getPublishedListId(),
    },
  });
  return { ok: true };
};

let publishedId: string | null = null;
const getPublishedListId = (): string => {
  if (publishedId) return publishedId;
  const r = search
    .create({
      type: 'customlist_sr_doc_status',
      filters: [['name', 'is', 'published']],
      columns: ['internalid'],
    })
    .run()
    .getRange({ start: 0, end: 1 });
  if (r.length > 0) {
    publishedId = r[0].id;
    return publishedId;
  }
  return 'published';
};
