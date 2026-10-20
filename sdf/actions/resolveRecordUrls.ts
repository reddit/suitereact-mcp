import * as log from 'N/log';
import * as url from 'N/url';

/**
 * Resolves NetSuite record URL templates using N/url.resolveDomain and
 * N/url.resolveRecord. Returns a domain and a map of record-type → URL
 * template (ending with `?id=` or `&id=`), so the client can append the
 * internal ID for any row.
 */
export const resolveRecordUrls = ({
  recordTypes,
}: {
  recordTypes: string[];
}): { domain: string; templates: Record<string, string> } => {
  const domain = url.resolveDomain({
    hostType: url.HostType.APPLICATION,
  });

  const templates: Record<string, string> = {};

  for (const rt of recordTypes) {
    try {
      const resolved = url.resolveRecord({
        recordType: rt as any,
        recordId: 1,
        isEditMode: false,
      });
      templates[rt] = `https://${domain}${resolved.replace(/id=1\b/, 'id=')}`;
    } catch (e) {
      log.debug('resolveRecordUrls', `Could not resolve ${rt}: ${e}`);
      templates[rt] =
        `https://${domain}/app/common/search/searchresults.nl?rectype=&id=`;
    }
  }

  return { domain, templates };
};
