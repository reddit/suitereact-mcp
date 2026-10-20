/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as search from 'N/search';

import {
  evaluateAccess,
  levelRank,
  readHtmlFile,
  SR_DOC,
} from './_docSpaces/helpers';

/**
 * Returns the rendered HTML for a doc. The current user must have at least
 * view-level access on the doc (or its parent space).
 */
export const dsGetDocHtml = (params: {
  docId: string;
  draft?: boolean;
}): { html: string } => {
  if (!params || !params.docId) throw new Error('docId is required');
  const access = evaluateAccess({ targetType: 'doc', targetId: params.docId });
  if (levelRank(access) < 1) {
    throw new Error('Forbidden: you do not have access to this document.');
  }
  const lookup = search.lookupFields({
    type: SR_DOC,
    id: params.docId,
    columns: ['custrecord_doc_fc_file'],
  });
  const fcFileId = Number(lookup.custrecord_doc_fc_file || 0);
  if (!fcFileId) {
    return { html: '' };
  }
  const html = readHtmlFile(fcFileId);
  return { html };
};
