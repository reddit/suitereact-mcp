/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import {
  currentEmployeeId,
  ensureSpaceFolder,
  evaluateAccess,
  findDocIdBySlug,
  findSpaceIdBySlug,
  levelRank,
  normalizeSlug,
  sanitizeHtml,
  writeHtmlFile,
} from './_docSpaces/helpers';
import { dsCreateSpace } from './dsCreateSpace';
import { dsPublishDoc } from './dsPublishDoc';
import { dsSaveDocDraft } from './dsSaveDocDraft';
import { dsSetLandingDoc } from './dsSetLandingDoc';

/**
 * Server-side counterpart to the MCP upload_html_doc tool. Idempotent:
 * if the (space_slug, doc_slug) pair already exists the file is overwritten;
 * otherwise the doc record is created. The result includes the doc id and
 * file id. The caller may opt into auto-publishing and landing-page promotion.
 */
export const dsUploadHtmlFile = (params: {
  spaceSlug: string;
  docSlug: string;
  title: string;
  html: string;
  publish?: boolean;
  setAsLanding?: boolean;
  spaceName?: string;
}): { docId: string; fileId: number; spaceId: string } => {
  if (!params || !params.spaceSlug || !params.docSlug || !params.html) {
    throw new Error('spaceSlug, docSlug, and html are required');
  }
  const spaceSlug = normalizeSlug(params.spaceSlug);
  const docSlug = normalizeSlug(params.docSlug);
  let spaceId = findSpaceIdBySlug(spaceSlug);
  if (!spaceId) {
    const created = dsCreateSpace({
      slug: spaceSlug,
      name: params.spaceName || spaceSlug,
      type: 'adhoc',
      description: '',
      everyoneView: true,
    });
    spaceId = created.spaceId;
  }
  const access = evaluateAccess({ targetType: 'space', targetId: spaceId });
  if (levelRank(access) < 4) {
    throw new Error('Forbidden: edit access is required to upload.');
  }
  const folder = ensureSpaceFolder(spaceSlug);
  const fileId = writeHtmlFile({
    fileName: docSlug,
    html: sanitizeHtml(params.html),
    folderId: folder,
    description: `doc-spaces upload by ${currentEmployeeId() ?? 'unknown'}`,
  });
  const existing = findDocIdBySlug(spaceId, docSlug);
  let docId = existing;
  if (!docId) {
    const result = dsSaveDocDraft({
      spaceId,
      docSlug,
      title: params.title || docSlug,
      html: params.html,
    });
    docId = result.docId;
  }
  if (params.publish || params.setAsLanding) {
    if (docId) {
      dsPublishDoc({ docId });
    }
  }
  if (params.setAsLanding && docId) {
    dsSetLandingDoc({ spaceId, docId });
  }
  return {
    docId: docId || '',
    fileId,
    spaceId,
  };
};
