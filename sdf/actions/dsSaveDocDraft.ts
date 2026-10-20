/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as record from 'N/record';
import * as search from 'N/search';

import {
  currentEmployeeId,
  evaluateAccess,
  findDocIdBySlug,
  levelRank,
  normalizeSlug,
  sanitizeHtml,
  SR_DOC,
  SR_SPACE,
  writeHtmlFile,
} from './_docSpaces/helpers';

/**
 * Saves an HTML draft for a doc. Creates the doc record if it does not yet
 * exist. Requires edit on the parent space (or doc, if pre-existing).
 */
export const dsSaveDocDraft = (params: {
  spaceId: string;
  docSlug: string;
  title: string;
  html: string;
}): { docId: string } => {
  if (!params || !params.spaceId || !params.docSlug) {
    throw new Error('spaceId and docSlug are required');
  }
  const slug = normalizeSlug(params.docSlug);
  if (!slug) throw new Error('Slug is empty after normalization.');
  const access = evaluateAccess({
    targetType: 'space',
    targetId: params.spaceId,
  });
  if (levelRank(access) < 4) {
    throw new Error('Forbidden: edit access is required to save drafts.');
  }
  const folderId = getFolderIdForSpace(params.spaceId);
  if (!folderId) {
    throw new Error('Space has no File Cabinet folder configured.');
  }
  const fileId = writeHtmlFile({
    fileName: slug,
    html: sanitizeHtml(params.html),
    folderId,
    description: `doc-spaces draft for ${slug}`,
  });
  const existingDocId = findDocIdBySlug(params.spaceId, slug);
  let docId: string;
  if (existingDocId) {
    record.submitFields({
      type: SR_DOC,
      id: existingDocId,
      values: {
        name: params.title || slug,
        custrecord_doc_fc_file: fileId,
        custrecord_doc_status: getStatusListId('draft'),
      },
    });
    docId = existingDocId;
  } else {
    const rec = record.create({ type: SR_DOC, isDynamic: false });
    rec.setValue({ fieldId: 'name', value: params.title || slug });
    rec.setValue({ fieldId: 'custrecord_doc_slug', value: slug });
    rec.setValue({ fieldId: 'custrecord_doc_space', value: params.spaceId });
    rec.setValue({ fieldId: 'custrecord_doc_fc_file', value: fileId });
    rec.setText({ fieldId: 'custrecord_doc_status', text: 'draft' });
    rec.setValue({ fieldId: 'custrecord_doc_archived', value: false });
    rec.setValue({ fieldId: 'custrecord_doc_is_landing', value: false });
    const author = currentEmployeeId();
    if (author) {
      rec.setValue({ fieldId: 'custrecord_doc_author', value: author });
    }
    docId = String(rec.save({ ignoreMandatoryFields: true }));
  }
  return { docId };
};

const getFolderIdForSpace = (spaceId: string): number | null => {
  try {
    const lk = search.lookupFields({
      type: SR_SPACE,
      id: spaceId,
      columns: ['custrecord_space_fc_folder'],
    });
    const v = Number(lk.custrecord_space_fc_folder || 0);
    return v || null;
  } catch {
    return null;
  }
};

/**
 * Resolves the customlist value internalid for the requested status text.
 * Lazily cached per execution. Returns the text directly if not found —
 * setText fallback in caller will surface a clearer error.
 */
const statusCache: Record<string, string> = {};

const getStatusListId = (status: 'draft' | 'published'): string => {
  if (statusCache[status]) return statusCache[status];
  const r = search
    .create({
      type: 'customlist_sr_doc_status',
      filters: [['name', 'is', status]],
      columns: ['internalid'],
    })
    .run()
    .getRange({ start: 0, end: 1 });
  if (r.length > 0) {
    statusCache[status] = r[0].id;
    return r[0].id;
  }
  return status;
};
