import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { netsuiteFetch } from '../auth/netsuiteFetch.js';

interface CreateSpaceArgs {
  slug: string;
  name: string;
  type?: 'adhoc' | 'team' | 'personal';
  description?: string;
  everyone_view?: boolean;
}

const buildRestletUrl = (accountId: string): string =>
  `https://${accountId}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_sr_rl_rct_action_handler&deploy=customdeploy_sr_rl_rct_action_handler`;

/**
 * Creates a new doc-spaces space.
 *
 * Implements the `create_space` MCP tool. Caller must already be authorized
 * to create spaces (server-side enforced).
 */
export async function handleHtmlDocsCreateSpace(
  args: Record<string, unknown>
): Promise<TextContent[]> {
  try {
    const input = args as unknown as CreateSpaceArgs;
    if (!input.slug || !input.name) {
      throw new Error('slug and name are required arguments');
    }
    const rawAccountId = process.env.NETSUITE_ACCOUNT_ID;
    const accountId = rawAccountId?.replace(/_/g, '-');
    if (!accountId) {
      throw new Error('NETSUITE_ACCOUNT_ID environment variable is not set');
    }
    const url = buildRestletUrl(accountId);
    const response = await netsuiteFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'dsCreateSpace',
        slug: input.slug,
        name: input.name,
        type: input.type || 'adhoc',
        description: input.description || '',
        everyoneView: input.everyone_view !== false,
      }),
    });
    const body = (await response.json()) as {
      success?: boolean;
      data?: { spaceId: string };
      error?: string;
      message?: string;
    };
    if (!response.ok || body.success === false) {
      throw new Error(body.error || body.message || `HTTP ${response.status}`);
    }
    return [
      {
        type: 'text',
        text: JSON.stringify(
          {
            tool: 'create_space',
            ok: true,
            slug: input.slug,
            name: input.name,
            type: input.type || 'adhoc',
            spaceId: body.data?.spaceId,
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
          { tool: 'create_space', ok: false, error: message },
          null,
          2
        ),
      },
    ];
  }
}
