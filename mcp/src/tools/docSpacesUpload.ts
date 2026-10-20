import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { netsuiteFetch } from '../auth/netsuiteFetch.js';

interface UploadHtmlDocArgs {
  space_slug: string;
  doc_slug: string;
  title: string;
  html_content: string;
  set_as_landing?: boolean;
  publish?: boolean;
  space_name?: string;
}

const buildRestletUrl = (accountId: string): string =>
  `https://${accountId}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_sr_rl_rct_action_handler&deploy=customdeploy_sr_rl_rct_action_handler`;

const callDocSpacesAction = async (
  action: string,
  data: Record<string, unknown>
): Promise<unknown> => {
  const rawAccountId = process.env.NETSUITE_ACCOUNT_ID;
  const accountId = rawAccountId?.replace(/_/g, '-');
  if (!accountId) {
    throw new Error('NETSUITE_ACCOUNT_ID environment variable is not set');
  }
  const url = buildRestletUrl(accountId);
  const response = await netsuiteFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...data }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Action ${action} failed: ${response.status} ${text.substring(0, 400)}`
    );
  }
  const body = (await response.json()) as
    | { success: boolean; data?: unknown; error?: string; message?: string }
    | unknown;
  if (typeof body === 'object' && body !== null && 'success' in body) {
    const wrapped = body as {
      success: boolean;
      data?: unknown;
      error?: string;
      message?: string;
    };
    if (!wrapped.success) {
      throw new Error(
        `Action ${action} returned error: ${wrapped.error ?? wrapped.message ?? 'unknown'}`
      );
    }
    return wrapped.data;
  }
  return body;
};

/**
 * Uploads (or overwrites) an HTML document to a doc-spaces space.
 *
 * Implements the `upload_html_doc` MCP tool contract. The space is created if
 * it does not already exist (type: adhoc). When `set_as_landing` is true the
 * doc is also published and promoted to landing.
 */
export async function handleHtmlDocsUpload(
  args: Record<string, unknown>
): Promise<TextContent[]> {
  try {
    const input = args as unknown as UploadHtmlDocArgs;
    if (!input.space_slug || !input.doc_slug || !input.html_content) {
      throw new Error(
        'space_slug, doc_slug, and html_content are required arguments'
      );
    }
    const result = (await callDocSpacesAction('dsUploadHtmlFile', {
      spaceSlug: input.space_slug,
      docSlug: input.doc_slug,
      title: input.title || input.doc_slug,
      html: input.html_content,
      publish: input.publish ?? input.set_as_landing ?? false,
      setAsLanding: input.set_as_landing ?? false,
      spaceName: input.space_name,
    })) as { docId: string; fileId: number; spaceId: string };
    return [
      {
        type: 'text',
        text: JSON.stringify(
          {
            tool: 'upload_html_doc',
            ok: true,
            spaceSlug: input.space_slug,
            docSlug: input.doc_slug,
            spaceId: result.spaceId,
            docId: result.docId,
            fileCabinetFileId: result.fileId,
            setAsLanding: !!input.set_as_landing,
            published: !!(input.publish ?? input.set_as_landing),
          },
          null,
          2
        ),
      },
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return [
      {
        type: 'text',
        text: JSON.stringify(
          { tool: 'upload_html_doc', ok: false, error: message },
          null,
          2
        ),
      },
    ];
  }
}
