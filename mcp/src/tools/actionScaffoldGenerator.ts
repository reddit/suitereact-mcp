import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { ActionScaffoldInputSchema } from '../types.js';

export async function handleActionScaffoldGeneratorTool(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  try {
    const inputArgs = ActionScaffoldInputSchema.parse(arguments_);
    const {
      actionName,
      actionType,
      appId,
      description,
      includeAdvancedFeatures = false,
    } = inputArgs;

    const camelCaseActionName =
      actionName.charAt(0).toLowerCase() + actionName.slice(1);
    const pascalCaseActionName =
      actionName.charAt(0).toUpperCase() + actionName.slice(1);

    let scaffoldContent = '';
    let fileName = '';
    let exportExample = '';

    if (actionType === 'client') {
      fileName = `${camelCaseActionName}.ts`;

      scaffoldContent = `// path \`apps/${appId}/src/domain/actions/${fileName}\`
// also have to update \`apps/${appId}/src/domain/actions/index.tsx\` to export the action(s)

${description ? `// ${description}` : ''}
import { useCallback, useState } from 'react';
import { handleRestletAction, toastService } from 'suitereact';

interface ${pascalCaseActionName}Request {
  id?: string;
}

interface ${pascalCaseActionName}Response {
  message: string;
}

const proxyBase = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const proxyToken = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

/**
 * Keeps local UI state and calls the matching SuiteScript action in both
 * Vite development and a hosted NetSuite Suitelet.
 */
export function use${pascalCaseActionName}() {
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (
    payload: ${pascalCaseActionName}Request = {}
  ): Promise<${pascalCaseActionName}Response> => {
    setLoading(true);
    try {
      const result = await handleRestletAction<${pascalCaseActionName}Response>(
        '${camelCaseActionName}',
        payload,
        proxyBase,
        proxyToken
      );
      toastService.showSuccess(result.message, 3000);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      toastService.showError(message, 4000);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, run };
}

${
  includeAdvancedFeatures
    ? `
// Standalone async function (e.g. call from an onClick without a hook):
export async function ${camelCaseActionName}Submit(
  payload: ${pascalCaseActionName}Request
): Promise<${pascalCaseActionName}Response> {
  return handleRestletAction<${pascalCaseActionName}Response>(
    '${camelCaseActionName}',
    payload,
    proxyBase
  );
}
`
    : ''
}
`;

      exportExample = `// Add to apps/${appId}/src/domain/actions/index.tsx:
export * from './${fileName.replace(/\.[tj]s$/, '')}';`;
    } else if (actionType === 'server') {
      fileName = `${camelCaseActionName}.ts`;

      scaffoldContent = `// path \`sdf/actions/${fileName}\`
// also have to update the \`sdf/actions/index.ts\` file to export the action(s)

/**
 *@NApiVersion 2.1
 *@NModuleScope Public
 */

// NetSuite imports - only import what you actually use
import * as log from 'N/log';
${description ? `\n// ${description}` : ''}

${
  includeAdvancedFeatures
    ? `import * as query from 'N/query';

interface ${pascalCaseActionName}Request {
  searchTerm?: string;
  limit?: number;
}

interface CustomerRow {
  id: string;
  customerNumber: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  paymentTerms: string | null;
}

interface ${pascalCaseActionName}Response {
  data: CustomerRow[];
  count: number;
}

export const ${camelCaseActionName} = (
  props: ${pascalCaseActionName}Request
): ${pascalCaseActionName}Response => {
  try {
    log.debug('Entered ${camelCaseActionName}', props);

    const searchTerm = String(props.searchTerm ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(props.limit ?? 100), 1), 1000);
    const filters = ["c.isinactive = 'F'"];
    const params: Array<string | number | boolean> = [];

    if (searchTerm) {
      filters.push('(LOWER(c.companyname) LIKE ? OR LOWER(c.email) LIKE ?)');
      params.push(\`%\${searchTerm}%\`, \`%\${searchTerm}%\`);
    }

    params.push(limit);

    const suiteQL = \`
      SELECT
        c.id,
        c.entityid AS customerNumber,
        c.companyname AS companyName,
        c.email,
        c.phone,
        BUILTIN.DF(c.status) AS status,
        BUILTIN.DF(c.terms) AS paymentTerms
      FROM
        customer c
      WHERE
        \${filters.join(' AND ')}
        AND RowNum <= ?
      ORDER BY
        c.companyname
    \`;

    const resultSet = query.runSuiteQL({ query: suiteQL, params });
    const results = resultSet.asMappedResults() as unknown as CustomerRow[];

    log.debug('SuiteQL Customer Query', \`Found \${results.length} customers\`);

    return {
      data: results,
      count: results.length,
    };
  } catch (error) {
    log.error('Error in ${camelCaseActionName}', error);
    throw error;
  }
};`
    : `interface ${pascalCaseActionName}Request {
  id?: string;
}

interface ${pascalCaseActionName}Response {
  message: string;
}

export const ${camelCaseActionName} = (
  props: ${pascalCaseActionName}Request
): ${pascalCaseActionName}Response => {
  try {
    log.debug('Entered ${camelCaseActionName}', props);

    // Validate required DTO fields before touching NetSuite records or SuiteQL.
    // if (!props.id) throw new Error('id is required');

    // TODO: NetSuite logic (SuiteQL, record.load, etc.) — test SuiteQL with EXECUTE_SUITEQL_QUERY first

    return {
      message: 'Server action completed successfully',
    };
  } catch (error) {
    log.error('Error in ${camelCaseActionName}', error);
    throw error;
  }
};`
}
`;

      exportExample = `// Add to sdf/actions/index.ts:
export * from './${fileName.replace(/\.[tj]s$/, '')}';

// Add the lowercase action name to ACTION_POLICIES in sdf/scripts/sr_rl_rct_action_handler.ts.
// Choose query for data retrieval or mutation for state changes; scoped read actions need their own access checks.
${camelCaseActionName.toLowerCase()}: '${includeAdvancedFeatures ? 'query' : 'mutation'}',`;
    }

    const result = {
      actionType,
      fileName,
      content: scaffoldContent,
      exportInstructions: exportExample,
      criticalFirst: `IMPORTANT: Before implementing, use the "Get SuiteReact Code Sample" tool for current freeform React + MUI patterns (not legacy grid-schema samples).

Recommended queries for ${actionType} actions:
${
  actionType === 'client'
    ? `• sample:handleRestletDevProxy and sample:filterBarWithMUI
• sample:dataGridBasic and sample:dataGridAutoTypes
• app_quality and app_performance for review/performance guidance`
    : `• sample:suiteQlServerAction and sample:handleRestletDevProxy
• NetSuite record and query patterns
• app_performance for governance, pagination, and bulk work`
}`,

      usage:
        actionType === 'client'
          ? `// In a React component:
import { use${pascalCaseActionName} } from '../domain/actions/${fileName.replace(/\.ts$/, '')}';

const { loading, run } = use${pascalCaseActionName}();
// <Button onClick={run} disabled={loading}>Run</Button>`
          : `// Client calls handleRestletAction('${camelCaseActionName}', payload, proxyBase, proxyToken).`,

      notes: [
        `Use "Get SuiteReact Code Sample" for up-to-date examples; ignore samples built around NsReactFormGridElementProps / updateRows.`,
        `This ${actionType} action follows SuiteReact patterns for ${appId}.`,
        `Remember to export the action in the index file.`,
        actionType === 'client'
          ? 'Client code runs in the browser: MUI + React state + handleRestletAction from suitereact.'
          : 'Server actions run in NetSuite: business logic only; no React UI.',
        actionType === 'server'
          ? 'Test SuiteQL with EXECUTE_SUITEQL_QUERY before implementing queries.'
          : 'Use toastService for user-visible feedback.',
        'Run npm run review:app -- <app-name> before commit to catch legacy patterns and performance red flags.',
      ],

      bestPractices: [
        `Prefer freeform MUI layouts (Box, Stack, Grid2) over legacy 12-column form grids.`,
        actionType === 'client'
          ? 'Keep server calls in thin functions or hooks; store results in React state.'
          : 'Return a typed JSON DTO or throw; the action-handler RESTlet owns the transport envelope.',
        actionType === 'server'
          ? 'Accept a plain typed data object from the client. Use legacy elements[] only when maintaining old grid-schema apps.'
          : 'Use TypeScript types from domain/types.ts for request/response shapes.',
        actionType === 'server'
          ? 'For bulk work, cap concurrency, check governance, and return partial success/failure details.'
          : 'For large files or exports, prefer Blob/ArrayBuffer paths and avoid JSZip + atob loops.',
        'Run npm run lint:fix in the app if you see lint issues.',
      ],
    };

    return [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ];
  } catch (error: any) {
    console.error('Error processing action scaffold generator tool:', error);
    return [
      {
        type: 'text',
        text: 'Error: Invalid arguments for action_scaffold_generator',
      },
    ];
  }
}
