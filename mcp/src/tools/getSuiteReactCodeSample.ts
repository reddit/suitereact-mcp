import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { ragService } from '../services/ragService.js';
import { GetSuiteReactCodeSampleInputSchema } from '../types.js';

/**
 * SuiteReact Code Sample Assistant - Uses RAG to provide relevant code samples and guidance
 */
export async function handleGetSuiteReactCodeSampleTool(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  try {
    const inputArgs = GetSuiteReactCodeSampleInputSchema.parse(arguments_);

    if (!inputArgs.userQuery) {
      return [
        {
          type: 'text',
          text: 'Error: userQuery parameter is required. Please provide a query describing what SuiteReact code samples or patterns you need.',
        },
      ];
    }

    // Initialize RAG service if needed
    await ragService.initialize();

    // Determine search category and enhance query based on RAG category
    let searchCategory: string | undefined = inputArgs.ragCategory;
    let searchQuery = inputArgs.userQuery;

    switch (inputArgs.ragCategory) {
      case 'action_docs':
        searchQuery = `${inputArgs.userQuery} actions client server patterns`;
        break;
      case 'app_build_steps':
        searchQuery = `${inputArgs.userQuery} build deployment steps process`;
        break;
      case 'app_lifecycle':
        searchQuery = `${inputArgs.userQuery} lifecycle management app state`;
        break;
      case 'app_performance':
        searchQuery = `${inputArgs.userQuery} performance pdf zip base64 blob suiteql pagination governance`;
        break;
      case 'app_quality':
        searchQuery = `${inputArgs.userQuery} review checklist quality testing deployability rookie`;
        break;
      case 'suitereact_code_samples':
        searchQuery = `${inputArgs.userQuery} code examples samples patterns`;
        break;
      case 'suitereact_component_library':
        searchQuery = `${inputArgs.userQuery} components UI elements library`;
        break;
      case 'suitereact':
        // Let it search across all suitereact categories
        searchCategory = undefined;
        break;
    }

    // Retrieve relevant context from RAG with expanded chunks for better code context
    const retrieval = await ragService.retrieveExpandedContextWithMode(
      searchQuery,
      8, // Result count
      0.3, // Lower threshold for broader matches
      searchCategory,
      4 // Each match to include 4 chunks
    );
    const relevantContext = retrieval.results;

    // Build response
    let response = `# SuiteReact Code Sample Assistant\n\n`;
    response += `**Your Query:** ${inputArgs.userQuery}\n\n`;
    response += `**Focus Category:** ${inputArgs.ragCategory}\n\n`;
    response += `**Retrieval Mode:** ${
      retrieval.mode === 'semantic'
        ? 'Semantic (OpenAI embeddings)'
        : 'Lexical fallback (local, no API key required)'
    }\n\n`;

    if (retrieval.mode === 'lexical') {
      response += `> Semantic retrieval was unavailable or returned no matches. Results were ranked locally from the packaged SuiteReact resources.\n\n`;
    }

    if (relevantContext.length === 0) {
      response += `⚠️ **No specific code samples found for your query.**\n\n`;
      response += `## General SuiteReact Resources:\n\n`;
      response += `### Available Categories:\n`;
      response += `- **action_docs** - Client and server action patterns\n`;
      response += `- **app_build_steps** - Build and deployment processes\n`;
      response += `- **app_lifecycle** - App lifecycle management\n`;
      response += `- **app_performance** - Performance guidance for exports, SuiteQL, bulk work, and NetSuite governance\n`;
      response += `- **app_quality** - App review checklist and rookie-friendly quality bar\n`;
      response += `- **suitereact_code_samples** - Code examples and patterns\n`;
      response += `- **suitereact_component_library** - UI components and usage\n`;
      response += `- **suitereact** - General framework documentation\n\n`;

      response += `### Common Patterns:\n`;
      response += `- Use MUI \`TextField\`, \`Select\`, \`Button\`, \`Stack\`, and \`Box\` for app UI\n`;
      response += `- Use \`DataGrid\` from \`@mui/x-data-grid\` for custom tables\n`;
      response += `- Use \`NsReactDataGrid\` only when you need SuiteReact's NetSuite-specific grid wrapper\n`;
      response += `- Use \`NsReactChatbot\` for AI interactions\n`;
      response += `- Structure apps with typed client DTOs and \`sdf/actions\` server actions\n\n`;
      response += `### Quality and Performance:\n`;
      response += `- Run \`npm run review:app -- <app-name>\` before calling an app done\n`;
      response += `- For PDF/zip/export flows, prefer Blob/ArrayBuffer paths and \`@zip.js/zip.js\`; avoid \`JSZip + atob\` loops for large file sets\n`;
      response += `- For large SuiteQL datasets, use pagination/keyset loading and select only fields the UI needs\n\n`;
    } else {
      response += `## 📚 Relevant Code Samples & Documentation\n\n`;

      // Group results by category for better organization
      const groupedResults = relevantContext.reduce(
        (acc, result) => {
          const category = result.metadata.category;
          if (!acc[category]) acc[category] = [];
          acc[category].push(result);
          return acc;
        },
        {} as Record<string, typeof relevantContext>
      );

      for (const [category, results] of Object.entries(groupedResults)) {
        response += `### ${category.replace(/_/g, ' ').toUpperCase()}\n\n`;

        for (const result of results.slice(0, 4)) {
          // Limit per category
          response += `**Relevance Score:** ${(result.score * 100).toFixed(1)}%\n\n`;

          // Try to extract and highlight code blocks if present
          const content = result.content;
          if (
            content.includes('```') ||
            content.includes('typescript') ||
            content.includes('jsx')
          ) {
            response += `${content}\n\n`;
          } else {
            response += `${content}\n\n`;
          }
          response += `---\n\n`;
        }
      }
    }

    // Add component information if requested
    if (inputArgs.includeComponentInfo) {
      response += `## 🧩 Component Usage Guidelines\n\n`;
      response += `### UI Defaults:\n`;
      response += `- **MUI controls** - Use \`TextField\`, \`Select\`, \`Checkbox\`, \`Autocomplete\`, and \`Button\` for app input/actions\n`;
      response += `- **MUI layout** - Use \`Box\`, \`Stack\`, \`Grid2\`, \`Container\`, and \`Tabs\` for page composition\n`;
      response += `- **DataGrid** - Use \`@mui/x-data-grid\` directly for custom rows/columns\n`;
      response += `- **NsReactDataGrid** - Use when you need SuiteReact's NetSuite-specific grid wrapper\n`;
      response += `- **NsReactChatbot** - Use for AI-powered chat interfaces\n\n`;

      response += `### Deprecated:\n`;
      response += `- Do not create new 12-column page schemas or \`NsReactField\` form-grid layouts.\n`;
      response += `- \`validate_suitereact_page\` is migration guidance only; new apps use freeform React + MUI.\n\n`;
    }

    // Add example patterns if requested
    if (inputArgs.includeExamples) {
      response += `## 🔍 Common Code Patterns\n\n`;
      response += `### Basic MUI Form State:\n`;
      response += `\`\`\`typescript\n`;
      response += `const [customerName, setCustomerName] = useState('');\n\n`;
      response += `<TextField\n`;
      response += `  label="Customer Name"\n`;
      response += `  value={customerName}\n`;
      response += `  onChange={event => setCustomerName(event.target.value)}\n`;
      response += `  size="small"\n`;
      response += `/>\n`;
      response += `\`\`\`\n\n`;

      response += `### Button with Server Action:\n`;
      response += `\`\`\`typescript\n`;
      response += `const result = await handleRestletAction(\n`;
      response += `  'loadCustomers',\n`;
      response += `  { customerName },\n`;
      response += `  import.meta.env.DEV\n`;
      response += `    ? import.meta.env.VITE_PROXY_SERVER_BASE_URL\n`;
      response += `    : undefined,\n`;
      response += `  import.meta.env.DEV\n`;
      response += `    ? import.meta.env.VITE_PROXY_SERVER_TOKEN\n`;
      response += `    : undefined\n`;
      response += `);\n`;
      response += `\`\`\`\n\n`;

      response += `### MUI Data Grid:\n`;
      response += `\`\`\`typescript\n`;
      response += `<DataGrid\n`;
      response += `  rows={rows}\n`;
      response += `  columns={columns}\n`;
      response += `  pageSizeOptions={[25, 50, 100]}\n`;
      response += `  disableRowSelectionOnClick\n`;
      response += `/>\n`;
      response += `\`\`\`\n\n`;
    }

    // Add important reminders
    response += `## ⚠️ Important Guidelines\n\n`;
    response += `1. **Freeform UI** - Build screens with React + MUI, not legacy page schemas\n`;
    response += `2. **Typed DTOs** - Define request/response shapes for client/server actions\n`;
    response += `3. **Server Actions** - Put NetSuite business logic in \`sdf/actions\`\n`;
    response += `4. **SuiteQL Safety** - Validate queries with SuiteQL tools before shipping\n`;
    response += `5. **Performance** - Paginate large datasets and avoid huge RESTlet payloads where possible\n`;
    response += `6. **Review Gate** - Run \`npm run review:app -- <app-name>\` and resolve errors before commit/deploy\n\n`;

    response += `## 🚀 Next Steps\n\n`;
    response += `1. Use the provided code samples as templates\n`;
    response += `2. Customize MUI fields, columns, and actions for your use case\n`;
    response += `3. For changed server actions, narrowly deploy the exact compiled action and run \`npm run test:action -- <action-name> --data-file <payload.json>\`\n`;
    response += `4. Run \`npm run review:app -- <app-name>\`\n`;
    response += `5. Test UI rendering with \`npm run test:app -- <app-name> --url http://localhost:5173\`\n`;
    response += `6. Validate live NetSuite calls with \`npm run test:app -- <app-name> --url http://localhost:5173 --live\` when credentials are configured\n\n`;

    response += `---\n\n`;
    response += `*💡 This guidance used ${retrieval.mode} retrieval with ${relevantContext.length} relevant document chunks.*`;

    return [{ type: 'text', text: response }];
  } catch (error) {
    console.error('Error in SuiteReact Code Sample Assistant:', error);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    const errorResponse = {
      error: 'SuiteReact Code Sample Assistant Error',
      details: errorMessage,
      timestamp: new Date().toISOString(),
    };

    return [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }];
  }
}
