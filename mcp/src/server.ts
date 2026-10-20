import {
  McpServer,
  RegisteredTool,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

import {
  ensureAuthenticated,
  runInteractiveAuth,
} from './auth/token-manager.js';
import { handleActionScaffoldGeneratorTool } from './tools/actionScaffoldGenerator.js';
import { handleAnalyzeAndPlanTool } from './tools/analyzeAndPlan.js';
import { handleAppScaffoldGeneratorTool } from './tools/appScaffoldGenerator.js';
import { handleHtmlDocsCreateSpace } from './tools/docSpacesSpace.js';
import { handleHtmlDocsTemplate } from './tools/docSpacesTemplate.js';
import { handleHtmlDocsUpload } from './tools/docSpacesUpload.js';
import { handleGetSuiteReactCodeSampleTool } from './tools/getSuiteReactCodeSample.js';
import { handleRecordSchemaTool } from './tools/recordSchema.js';
import { handleSuiteletGeneratorTool } from './tools/suiteletGenerator.js';
import { handleSuiteQLTool } from './tools/suiteql.js';
import { handleSuiteQLQueryAssistant } from './tools/suiteqlQueryAssistant.js';
import { handleValidateSuiteReactPageTool } from './tools/validateSuiteReactPage.js';
import { ServerTools } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function configureServer(): Promise<McpServer> {
  // Avoid pathological SDK/Zod generic inference across every registered tool.
  // Runtime validation still uses the Zod schemas supplied below.
  const server = new McpServer({
    name: 'mcp-server-netsuite',
    version: '1.0.0',
  }) as any;

  const protectedTools: RegisteredTool[] = [];

  function enableProtectedTools() {
    for (const tool of protectedTools) {
      tool.enable();
    }
  }

  async function authenticate(): Promise<string> {
    const message = await runInteractiveAuth({ ignoreCooldown: true });
    enableProtectedTools();
    return message;
  }

  server.registerTool(
    'mcp_auth',
    {
      title: 'Authenticate with NetSuite',
      description:
        'Explicitly authenticate this MCP server with NetSuite. Protected tools also start authentication lazily on their first request; use this tool to retry immediately after a failed automatic attempt.',
      inputSchema: {},
    },
    async () => {
      try {
        const message = await authenticate();
        return { content: [{ type: 'text' as const, text: message }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: 'text' as const, text: `Authentication failed: ${msg}` },
          ],
        };
      }
    }
  );

  server.registerTool(
    'mcp_reauth',
    {
      title: 'Re-authenticate with NetSuite',
      description:
        'Force a fresh NetSuite OAuth login by clearing the stored token and re-running the browser flow. Use this when tools return authentication errors (e.g. "Not authenticated", "Token refresh failed", or a 401 from the NetSuite API) to recover without manually deleting the token file.',
      inputSchema: {},
    },
    async () => {
      try {
        await ensureAuthenticated({
          forceReauth: true,
          ignoreCooldown: true,
        });
        enableProtectedTools();
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Re-authentication successful. NetSuite tools are ready to use.',
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Re-authentication failed: ${msg}`,
            },
          ],
        };
      }
    }
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.SUITEQL_QUERY_ASSISTANT,
      {
        title: '🚨 SuiteQL Query Assistant - USE FIRST',
        description:
          '🚨 IMPORTANT: Use this tool BEFORE executing SuiteQL queries! Provides guidance and context for crafting SuiteQL queries. Use this to get help with query structure, field mappings, and best practices before executing queries. This will help avoid errors and ensure proper query syntax.',
        inputSchema: {
          userQuery: z
            .string()
            .describe('The user query or question about SuiteQL'),
          ragCategory: z
            .enum(['suiteql_pure', 'suiteql', 'netsuite_records'])
            .optional()
            .default('suiteql')
            .describe(
              'Knowledge category to focus on: suiteql_pure (syntax examples), suiteql (general docs), netsuite_records (table/field info)'
            ),
          includeExamples: z
            .boolean()
            .optional()
            .describe('Whether to include example queries'),
          includeFieldMappings: z
            .boolean()
            .optional()
            .describe('Whether to include field mapping information'),
        },
      },
      async (args: any) => {
        const result = await handleSuiteQLQueryAssistant(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.EXECUTE_SUITEQL_QUERY,
      {
        title: 'Execute SuiteQL Query',
        description:
          '⚠️ WARNING: Use the "SuiteQL Query Assistant - USE FIRST" tool before this one! Executes a SuiteQL query against NetSuite REST Web Services. For query guidance, field mappings, and best practices, ALWAYS use the SuiteQL Query Assistant first to avoid syntax errors and get proper query structure. 🚨 IMPORTANT: NEVER use LIMIT clauses in your SQL - use the row_limit parameter instead!',
        inputSchema: {
          query: z.string().describe('The SuiteQL query to execute'),
          offset: z.number().optional().describe('Number of rows to skip'),
          row_limit: z
            .number()
            .optional()
            .describe(
              'Maximum number of rows to return using RowNum-based limiting'
            ),
        },
      },
      async (args: any) => {
        const result = await handleSuiteQLTool(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.GET_RECORD_SCHEMA,
      {
        title: 'NetSuite Record Schema',
        description:
          'Fetches record type metadata from the NetSuite Record Catalog REST API. Without a recordType it lists all available record types. With a recordType (e.g. "customer", "salesOrder") it returns every field with its type, required/readOnly status, and whether it is a custom field. Use fieldFilter to search fields by name, or customFieldsOnly to see only custom fields. Invaluable for writing accurate SuiteQL and building apps with correct field names.',
        inputSchema: {
          recordType: z
            .string()
            .optional()
            .describe(
              'The record type to inspect (e.g. "customer", "salesOrder", "invoice"). Omit to list all available record types.'
            ),
          fieldFilter: z
            .string()
            .optional()
            .describe(
              'Filter fields whose id, label, or description contain this string (case-insensitive). E.g. "email", "cust", "date".'
            ),
          customFieldsOnly: z
            .boolean()
            .optional()
            .default(false)
            .describe(
              'When true, only return custom fields (fields marked x-ns-custom by NetSuite).'
            ),
          refreshCache: z
            .boolean()
            .optional()
            .default(false)
            .describe(
              'Fetch fresh metadata instead of reusing a cached schema. Use after changing record customizations.'
            ),
        },
      },
      async (args: any) => {
        const result = await handleRecordSchemaTool(args);
        return { content: result };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.GENERATE_SUITELET,
      {
        title: 'Generate Suitelet',
        description:
          'Generates a Suitelet script file for a new SuiteReact app.',
        inputSchema: {
          appId: z
            .string()
            .describe(
              'Short ID for params, URLs, folder names, etc. (lowercase, < 15 characters, no spaces)'
            ),
          appName: z.string().describe('The name of the new SuiteReact app'),
          description: z.string().optional().describe('Description of the app'),
        },
      },
      async (args: any) => {
        const result = await handleSuiteletGeneratorTool(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.GENERATE_APP_SCAFFOLD,
      {
        title: 'Generate App Scaffold',
        description:
          'Generates the minimal freeform React + MUI app scaffold (Vite, MUI, @mui/x-data-grid, ToastProvider, REST example) for a new SuiteReact app.',
        inputSchema: {
          appId: z
            .string()
            .describe(
              'Short ID (< 15 characters) for params, URLs, folder names, etc. (lowercase, short, no spaces, dashes between words)'
            ),
          appName: z
            .string()
            .describe(
              'The display name and header title for the new SuiteReact app (human readable)'
            ),
          subheader: z.string().describe('The subheader to display in the app'),
          clientActionsFile: z
            .string()
            .describe('The name of the client actions file'),
          landingPageFile: z
            .string()
            .describe(
              'The landing page view file name (e.g. landingPage.tsx) — a freeform React component, not a grid schema'
            ),
          serverActionFile: z
            .string()
            .describe('The name of the server action file'),
        },
      },
      async (args: any) => {
        const result = await handleAppScaffoldGeneratorTool(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.ANALYZE_AND_PLAN,
      {
        title: 'Analyze and Plan',
        description:
          "Analyzes the user's initial request and creates a plan for what needs to be done, referencing the suitereact resources to guide the agent on which tools/resources to use next.",
        inputSchema: {
          userRequest: z
            .string()
            .describe("The user's initial request or goal"),
        },
      },
      async ({ userRequest }: any) => {
        const result = await handleAnalyzeAndPlanTool({ userRequest });
        return { content: result };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.VALIDATE_SUITEREACT_PAGE,
      {
        title: 'Validate SuiteReact Page (deprecated)',
        description:
          'Deprecated: the 12-column grid schema is no longer used. This tool returns migration guidance for freeform React + MUI. Optional pageSchema is ignored.',
        inputSchema: {
          pageSchema: z
            .any()
            .optional()
            .describe(
              'Optional; ignored. Formerly the grid page layout — new apps use freeform MUI components instead.'
            ),
        },
      },
      async (args: any) => {
        const result = await handleValidateSuiteReactPageTool(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.GENERATE_ACTION_SCAFFOLD,
      {
        title: 'Generate Action Scaffold',
        description:
          'Generates scaffold code for client actions (handleRestletAction + React hooks) or SuiteScript server actions following current SuiteReact patterns.',
        inputSchema: {
          actionName: z.string().describe('The name of the action to generate'),
          actionType: z
            .enum(['client', 'server'])
            .describe('Type of action to generate (client or server)'),
          appId: z.string().describe('The app ID this action belongs to'),
          description: z
            .string()
            .optional()
            .describe('Optional description for the action'),
          includeAdvancedFeatures: z
            .boolean()
            .optional()
            .default(false)
            .describe('Include advanced examples and features in the scaffold'),
        },
      },
      async (args: any) => {
        const result = await handleActionScaffoldGeneratorTool(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      ServerTools.GET_SUITEREACT_CODE_SAMPLE,
      {
        title: '🧩 SuiteReact Code Sample Assistant',
        description:
          'Retrieves relevant SuiteReact code samples, components, and patterns using OpenAI semantic embeddings when configured, with an automatic local lexical fallback.',
        inputSchema: {
          userQuery: z
            .string()
            .describe(
              'The user query or question about SuiteReact code samples, components, or patterns'
            ),
          ragCategory: z
            .enum([
              'action_docs',
              'app_build_steps',
              'app_lifecycle',
              'app_performance',
              'app_quality',
              'suitereact_code_samples',
              'suitereact_component_library',
              'suitereact',
            ])
            .optional()
            .default('suitereact_code_samples')
            .describe(
              'Knowledge category to focus on: action_docs (action patterns), app_build_steps (build process), app_lifecycle (app lifecycle), app_performance (performance patterns), app_quality (review checklist), suitereact_code_samples (code examples), suitereact_component_library (components), suitereact (general framework)'
            ),
          includeExamples: z
            .boolean()
            .optional()
            .default(true)
            .describe('Whether to include code examples'),
          includeComponentInfo: z
            .boolean()
            .optional()
            .default(true)
            .describe(
              'Whether to include component information and usage patterns'
            ),
        },
      },
      async (args: any) => {
        const result = await handleGetSuiteReactCodeSampleTool(args);
        return {
          content: result,
        };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      'upload_html_doc',
      {
        title: 'doc-spaces — Upload HTML document',
        description:
          'Uploads (or overwrites) an HTML document to a doc-spaces space in NetSuite. Creates the space if missing. Optionally publishes and sets the document as the space landing page. Use after `scaffold_html_doc` or with your own HTML.',
        inputSchema: {
          space_slug: z
            .string()
            .describe('Slug of the target space (lowercase, URL-safe).'),
          doc_slug: z
            .string()
            .describe(
              'Slug of the document within the space (lowercase, URL-safe).'
            ),
          title: z.string().describe('Human-readable document title.'),
          html_content: z
            .string()
            .describe(
              'Full HTML document body to upload. Will be sanitized server-side.'
            ),
          set_as_landing: z
            .boolean()
            .optional()
            .describe(
              'When true, publishes the doc and promotes it to the space landing page.'
            ),
          publish: z
            .boolean()
            .optional()
            .describe(
              'When true, marks the document as published. Implied by set_as_landing.'
            ),
          space_name: z
            .string()
            .optional()
            .describe(
              'Used only when the space does not exist yet; defaults to the slug.'
            ),
        },
      },
      async (args: any) => {
        const result = await handleHtmlDocsUpload(args);
        return { content: result };
      }
    )
  );

  protectedTools.push(
    server.registerTool(
      'create_space',
      {
        title: 'doc-spaces — Create space',
        description:
          'Creates a new doc-spaces space in NetSuite. Owner is the authenticated user. Defaults to type=adhoc with everyone:view. Use this before uploading documents to a brand-new space.',
        inputSchema: {
          slug: z
            .string()
            .describe('URL-safe slug; used in the File Cabinet folder path.'),
          name: z
            .string()
            .describe('Display name shown in the doc-spaces sidebar.'),
          type: z
            .enum(['adhoc', 'team', 'personal'])
            .optional()
            .describe('Space type (default: adhoc).'),
          description: z.string().optional().describe('Optional description.'),
          everyone_view: z
            .boolean()
            .optional()
            .describe(
              'When true (default), grants everyone view access on creation.'
            ),
        },
      },
      async (args: any) => {
        const result = await handleHtmlDocsCreateSpace(args);
        return { content: result };
      }
    )
  );

  server.registerTool(
    'scaffold_html_doc',
    {
      title: 'doc-spaces — Scaffold HTML document',
      description:
        'Returns a NetSuite-friendly HTML scaffold (light theme, navy accents) for a new doc-spaces document. The output is a complete standalone HTML document ready to upload via `upload_html_doc`. No NetSuite credentials are required for this tool.',
      inputSchema: {
        topic: z.string().describe('Document topic / title (used as the H1).'),
        style: z
          .enum(['doc', 'runbook', 'rfc', 'overview'])
          .optional()
          .describe('Stylistic flavor of the scaffold (default: doc).'),
        subtitle: z
          .string()
          .optional()
          .describe('Optional one-line subtitle shown beneath the heading.'),
      },
    },
    async (args: any) => {
      const result = await handleHtmlDocsTemplate(args);
      return { content: result };
    }
  );

  // Keep NetSuite-backed tools callable so their first request can authenticate
  // lazily. Server startup itself must remain non-interactive.
  enableProtectedTools();

  // Register resources - dynamically discover all files in resources directory
  const resourcesDir = join(__dirname, 'resources');
  const resourceFiles: Record<string, string> = {};

  try {
    const files = readdirSync(resourcesDir);
    files.forEach(file => {
      // Create resource name by removing file extension
      const resourceName = file.replace(/\.(md|json)$/, '');
      resourceFiles[resourceName] = file;
    });
    console.error('Discovered resources:', Object.keys(resourceFiles));
  } catch (error) {
    console.error('Error reading resources directory:', error);
  }

  // Register documentation resource with all discovered files
  server.registerResource(
    'docs',
    new ResourceTemplate('netsuite:///docs/{doc}', { list: undefined }),
    {
      title: 'NetSuite & SuiteReact Documentation',
      description:
        'Documentation for NetSuite SuiteQL, SuiteReact development, and related topics',
    },
    async (uri: any, { doc }: any) => {
      const docName = Array.isArray(doc) ? doc[0] : doc;
      console.error('Resource requested:', docName);
      if (docName in resourceFiles) {
        try {
          const filePath = join(resourcesDir, resourceFiles[docName]);
          const content = readFileSync(filePath, 'utf-8');
          // Return JSON if the file is .json, otherwise return as text
          if (filePath.endsWith('.json')) {
            return {
              contents: [
                {
                  uri: uri.href,
                  text: content,
                  mimeType: 'application/json',
                },
              ],
            };
          } else {
            return {
              contents: [
                {
                  uri: uri.href,
                  text: content,
                },
              ],
            };
          }
        } catch {
          throw new Error(`Resource file not found: ${resourceFiles[docName]}`);
        }
      } else {
        throw new Error(`Unknown resource: ${docName}`);
      }
    }
  );

  return server;
}

export { configureServer };
