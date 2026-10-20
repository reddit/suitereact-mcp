import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export async function handleAnalyzeAndPlanTool(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  const { userRequest } = arguments_;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const actionDocsPath = join(
    __dirname,
    '../resources/suitereact_action_docs.json'
  );
  const componentLibPath = join(
    __dirname,
    '../resources/suitereact_component_library.json'
  );
  let actionDocs, componentLib;
  try {
    actionDocs = JSON.parse(readFileSync(actionDocsPath, 'utf-8'));
  } catch {
    actionDocs = null;
  }
  try {
    componentLib = JSON.parse(readFileSync(componentLibPath, 'utf-8'));
  } catch {
    componentLib = null;
  }
  const appBuildStepsPath = join(
    __dirname,
    '../resources/suitereact_app_build_steps.md'
  );
  const appLifecyclePath = join(
    __dirname,
    '../resources/suitereact_app_lifecycle.md'
  );
  const appPerformancePath = join(
    __dirname,
    '../resources/suitereact_performance.md'
  );
  const appQualityPath = join(
    __dirname,
    '../resources/suitereact_app_quality.md'
  );
  let appBuildSteps = '';
  let appLifecycle = '';
  let appPerformance = '';
  let appQuality = '';
  try {
    appBuildSteps = readFileSync(appBuildStepsPath, 'utf-8');
  } catch {
    appBuildSteps = '';
  }
  try {
    appLifecycle = readFileSync(appLifecyclePath, 'utf-8');
  } catch {
    appLifecycle = '';
  }
  try {
    appPerformance = readFileSync(appPerformancePath, 'utf-8');
  } catch {
    appPerformance = '';
  }
  try {
    appQuality = readFileSync(appQualityPath, 'utf-8');
  } catch {
    appQuality = '';
  }

  // Load SuiteQL resources when SuiteQL-related questions are detected
  const req = userRequest.toLowerCase();
  let suiteqlResources = '';
  let suiteqlResourcesLoaded = false;
  if (
    req.includes('suiteql') ||
    req.includes('suite ql') ||
    req.includes('query') ||
    req.includes('customer') ||
    req.includes('employee') ||
    req.includes('transaction') ||
    req.includes('sql') ||
    req.includes('analytics') ||
    req.includes('search')
  ) {
    const suiteqlFiles = [
      'suiteql_customers.md',
      'suiteql_employees.md',
      'suiteql_transactions.md',
    ];

    const suiteqlContent = [];
    for (const fileName of suiteqlFiles) {
      try {
        const filePath = join(__dirname, '../resources', fileName);
        const content = readFileSync(filePath, 'utf-8');
        suiteqlContent.push(
          `## ${fileName.replace('.md', '').replace('_', ' ').toUpperCase()}\n\n${content}`
        );
      } catch {
        // File not found, skip
      }
    }

    if (suiteqlContent.length > 0) {
      suiteqlResources = `\n\n# AVAILABLE SUITEQL RESOURCES\n\n${suiteqlContent.join('\n\n')}`;
      suiteqlResourcesLoaded = true;
    }
  }

  const plan = [];

  if (
    req.toLowerCase().includes('new app') ||
    req.toLowerCase().includes('new suitereact app') ||
    req.toLowerCase().includes('create app') ||
    req.toLowerCase().includes('scaffold')
  ) {
    plan.push(
      'Prompt the user to specify BOTH the appId (< 15 characters, lowercase, no spaces, for params/folder) and the appName (display/header, human readable, up to 30 characters).'
    );
    plan.push(
      'IMPORTANT: Use the React App Scaffold Generator tool to create ALL necessary files. This tool generates a complete app structure including package.json, tsconfig files, vite config, and all source files.'
    );
    plan.push(
      'The scaffold generator emits a freeform React + MUI app (Vite, MUI, @mui/x-data-grid, handleRestletAction). Do not copy legacy grid-schema demo apps unless you are maintaining old code.'
    );
    plan.push(
      'CRITICAL: Never copy node_modules or client directories - these are generated/installed directories that should not be copied.'
    );
    plan.push(
      'After scaffolding, parse the generated file list and WRITE each file to disk at the specified path using the provided content. Do not skip this step.'
    );
    plan.push(
      'Use the Suitelet Generator tool to create the corresponding Suitelet files.'
    );
    plan.push(
      'After generating Suitelet files, WRITE each Suitelet file to disk at the specified path using the provided content.'
    );
    plan.push(
      'The validateSuiteReactPage tool is deprecated: it only explains migration from the old 12-column grid. New apps use freeform MUI layouts — do not build pageSchema arrays.'
    );
    plan.push(
      'Add the new app to the NetSuite center category by updating sdf/objects/centerCategories/custcentercategory_suitereact.xml with a new link entry. The link should include: <linklabel>{appName}</linklabel>, <linkobject>[scriptid=customscript_sr_sui_{appId}.customdeploy_sr_sui_{appId}]</linkobject>, <linktasktype>SCRIPT</linktasktype>, and <shortlist>F</shortlist>.'
    );
    plan.push(
      'Review the suitereact_app_build_steps resource for a detailed checklist.'
    );
    plan.push(
      'Run the app through the quality gate before finishing: npm run review:app -- <app-name>, npm run build:app <app-name>, and npm run test:app -- <app-name> --url <vite-url>.'
    );
    if (appBuildSteps) {
      plan.push('Step-by-step build instructions for a new app:');
      plan.push(appBuildSteps.trim());
    }
    if (appLifecycle) {
      plan.push(
        'App lifecycle commands for building, testing, and deployment:'
      );
      plan.push(appLifecycle.trim());
    }
    if (appQuality) {
      plan.push('Quality checklist for new apps:');
      plan.push(appQuality.trim());
    }
  }
  if (req.includes('add field') || req.includes('new field')) {
    plan.push(
      'Add inputs with MUI (TextField, Select, Autocomplete, etc.) and store values in React state or a form library. See sample:filterBarWithMUI for the current action pattern.'
    );
    plan.push(
      'Use the Get SuiteReact Code Sample tool for current freeform patterns; treat legacy grid-field samples as obsolete unless you are patching an old app.'
    );
  }
  if (req.includes('remove field') || req.includes('delete field')) {
    plan.push(
      'Remove the MUI field or controlled state from the component; update types and any server payloads that referenced that field.'
    );
  }
  if (
    req.includes('dynamic options') ||
    req.includes('sourcestr') ||
    req.includes('select from netsuite') ||
    req.includes('populate select') ||
    req.includes('load options')
  ) {
    plan.push(
      'Load options with a typed server action via handleRestletAction, then pass the returned { value, label } DTOs to MUI Select or Autocomplete.'
    );
    plan.push(
      'Query only the option fields the UI needs, cap result counts, and add server-side filtering for large customer, vendor, employee, or item lists.'
    );
    plan.push(
      'Keep option DTOs explicit, for example { value: string, label: string }, and send only the selected value back to server actions.'
    );
  }
  if (
    req.includes('add table') ||
    req.includes('new table') ||
    req.includes('add grid')
  ) {
    plan.push(
      'Use @mui/x-data-grid (DataGrid) or MUI Table with rows/columns from React state. Populate data via handleRestletAction and typed SuiteQL-backed actions.'
    );
    plan.push(
      'Use the Get SuiteReact Code Sample tool for DataGrid / REST integration examples; ignore legacy NsReactTable grid-schema samples unless maintaining old code.'
    );
  }
  if (
    req.includes('landing page') ||
    req.includes('new view') ||
    req.includes('create view') ||
    req.includes('page layout') ||
    req.includes('form layout')
  ) {
    plan.push(
      'Use "Get SuiteReact Code Sample" for freeform MUI layout patterns (AppBar, Container, Stack, Grid2) — not legacy grid-schema row arrays.'
    );
    plan.push(
      'Compose views as normal React components under src/domain/views or src/App; use MUI theme from src/App/theme.ts.'
    );
    plan.push(
      'Do not validate pageSchema with validateSuiteReactPage for new work — that tool is deprecated and only documents migration off the old grid.'
    );
  }
  if (
    req.includes('change table source') ||
    req.includes('change data source')
  ) {
    plan.push(
      'Review the DataGrid and column type inference guidance in suitereact_component_library.json.'
    );
    plan.push(
      'Use Get SuiteReact Code Sample with sample:dataGridAutoTypes and sample:suiteQlServerAction for dynamic table data sources.'
    );
  }
  if (req.includes('add action') || req.includes('new action')) {
    plan.push(
      'FIRST: Use Get SuiteReact Code Sample with sample:handleRestletDevProxy or sample:suiteQlServerAction; skip legacy grid action chains unless maintaining old apps.'
    );
    plan.push(
      'Use the Action Scaffold Generator (actionName, actionType client|server, appId). Client scaffolds use handleRestletAction and React hooks; server scaffolds use SuiteScript with typed payloads.'
    );
    plan.push(
      'Add exports under src/domain/actions or sdf/actions and wire the RESTlet action name to your SuiteScript export.'
    );
  }
  if (req.includes('update action') || req.includes('change action')) {
    plan.push(
      'Review suitereact_action_docs.json for REST and SuiteQL patterns; prefer updating React state and server JSON contracts over grid row manipulation.'
    );
  }
  if (
    req.includes('client action') ||
    req.includes('form action') ||
    req.includes('button action') ||
    req.includes('ui action')
  ) {
    plan.push(
      'Use Get SuiteReact Code Sample with sample:handleRestletDevProxy and sample:filterBarWithMUI for freeform client patterns.'
    );
    plan.push(
      'Use the Action Scaffold Generator with actionType="client" for a hook/async starter that uses handleRestletAction and toastService.'
    );
    plan.push(
      'Call NetSuite via handleRestletAction(action, data, proxyBase); update UI with setState or context, not grid row replacement.'
    );
  }
  if (
    req.includes('server action') ||
    req.includes('netsuite action') ||
    req.includes('data action') ||
    req.includes('backend action')
  ) {
    plan.push(
      'ESSENTIAL FIRST STEP: Use Get SuiteReact Code Sample with sample:suiteQlServerAction and sample:handleRestletDevProxy before creating server actions.'
    );
    plan.push(
      'CRITICAL: Use the Action Scaffold Generator tool with actionType="server" to generate server-side actions that focus ONLY on NetSuite API operations and business logic.'
    );
    plan.push(
      'Server actions should only implement NetSuite logic (SuiteQL, record, search) and return JSON. No React or MUI in SuiteScript.'
    );
    plan.push(
      'Accept a plain typed data object from the client body. Use legacy elements[]/getElementValue only when maintaining old grid-schema apps.'
    );
    plan.push(
      'Return a typed JSON DTO on success or throw an Error. The action-handler RESTlet owns the outer success/data/error transport envelope.'
    );
    plan.push(
      'Set includeAdvancedFeatures=true for server actions that need examples of record loading, search operations, and error handling patterns.'
    );
    plan.push(
      'RECOMMENDED: For server actions using SuiteQL queries, FIRST test your queries using the EXECUTE_SUITEQL_QUERY tool to validate syntax and results before implementing in code.'
    );
    plan.push(
      'SuiteQL TESTING WORKFLOW: (1) Draft your query logic, (2) Test with EXECUTE_SUITEQL_QUERY, (3) Refine based on results, (4) Implement in server action with confidence.'
    );
  }
  if (req.includes('navigation') || req.includes('tabs')) {
    plan.push(
      'Use MUI Tabs, routing, or a simple state-driven tab index; see code samples for navigation patterns in freeform apps.'
    );
  }
  if (
    req.includes('layout') ||
    req.includes('spacing') ||
    req.includes('responsive')
  ) {
    plan.push(
      'Use MUI layout primitives (Box, Stack, Grid2, Container) and breakpoints (sx, theme.breakpoints) for responsive freeform layouts.'
    );
  }
  if (req.includes('pdf') || req.includes('export pdf')) {
    plan.push(
      'Use sample:blobZipExport for browser-side archive assembly and N/render in a typed server action for PDF generation.'
    );
    plan.push(
      'For PDF export or zip generation, review suitereact_performance.md before coding. Prefer Blob/ArrayBuffer paths, @zip.js/zip.js, bounded batches, and progress feedback; avoid JSZip + atob loops for large file sets.'
    );
  }
  if (req.includes('suiteql') || req.includes('analytics')) {
    plan.push(
      'See advanced.suiteQL in suitereact_action_docs.json for SuiteQL query patterns.'
    );
    plan.push(
      'Use Get SuiteReact Code Sample with sample:suiteQlServerAction and sample:dataGridAutoTypes for SuiteQL-backed tables.'
    );
    plan.push(
      'For form-based NetSuite queries, combine sample:filterBarWithMUI, sample:handleRestletDevProxy, and sample:suiteQlServerAction.'
    );
    plan.push(
      'CRITICAL: Before implementing server actions with SuiteQL, ALWAYS test your queries first using the EXECUTE_SUITEQL_QUERY tool to verify syntax, results, and performance.'
    );
    plan.push(
      'RECOMMENDED WORKFLOW: (1) Use EXECUTE_SUITEQL_QUERY to develop and test your query, (2) Refine the query based on results, (3) Implement the tested query in your server action code.'
    );
    plan.push(
      'The EXECUTE_SUITEQL_QUERY tool helps you validate query syntax, check result structure, and optimize performance before committing code.'
    );
    plan.push(
      'Apply performance rules: select only fields the UI needs, parameterize filters, and use RowNum/keyset pagination instead of fetching everything into React.'
    );
  }

  if (
    req.includes('performance') ||
    req.includes('slow') ||
    req.includes('faster') ||
    req.includes('zip') ||
    req.includes('base64') ||
    req.includes('blob') ||
    req.includes('bulk') ||
    req.includes('batch') ||
    req.includes('large') ||
    req.includes('5000') ||
    req.includes('governance')
  ) {
    plan.push(
      'Performance-first plan: identify the largest realistic dataset/payload, measure where time is spent (NetSuite query/render, RESTlet payload, browser conversion, zip/download), and fix the dominant cost first.'
    );
    plan.push(
      'Use bounded batches/concurrency for bulk NetSuite work and return partial success/failure details so the user can retry safely.'
    );
    plan.push(
      'Avoid storing large payloads in React state or localStorage. For files/PDFs, prefer Blob/ArrayBuffer/File Cabinet URLs over base64.'
    );
    if (appPerformance) {
      plan.push('Performance checklist:');
      plan.push(appPerformance.trim());
    }
  }

  if (req.includes('saved search') || req.includes('savedsearch')) {
    plan.push(
      'Prefer SuiteQL for new work; if you must use saved searches, implement server-side search execution and return rows for a MUI DataGrid — avoid legacy grid upsert helpers in new UIs.'
    );
  }

  if (
    req.includes('chatbot') ||
    req.includes('ai') ||
    req.includes('openai') ||
    req.includes('openrouter')
  ) {
    plan.push(
      'Use Get SuiteReact Code Sample with sample:chatbotPanelStructured for the current chatbot panel and structured output pattern.'
    );
    plan.push(
      'For structured AI responses, use sample:chatbotPanelStructured and parse the callback payload before updating React state.'
    );
    plan.push(
      'Use sample:chatbotPanelStructured for Zod schemas and onStructuredResponse processing.'
    );
    plan.push(
      'Configure multiple AI clients simultaneously and let users switch between models from different providers.'
    );
  }

  if (
    req.includes('structured output') ||
    req.includes('structuredoutput') ||
    req.includes('onresponse') ||
    req.includes('zod schema')
  ) {
    plan.push(
      'Use Get SuiteReact Code Sample with sample:chatbotPanelStructured for structuredOutput and onStructuredResponse.'
    );
    plan.push(
      'This sample shows how to define Zod schemas, configure structured AI responses, and automatically process the results in client actions.'
    );
    plan.push(
      'Structured outputs ensure type safety and consistent data formats from AI responses, enabling reliable programmatic processing.'
    );
  }

  if (
    req.includes('form input') ||
    req.includes('user input') ||
    req.includes('filter') ||
    req.includes('query data') ||
    req.includes('netsuite data')
  ) {
    plan.push(
      'Combine sample:filterBarWithMUI, sample:handleRestletDevProxy, and sample:suiteQlServerAction to collect form input and query NetSuite.'
    );
    plan.push(
      'This sample demonstrates form layout, client actions, server actions, and N/query usage for dynamic data filtering.'
    );
    plan.push(
      'Shows how to collect MUI-controlled form state, send typed DTOs, and use handleRestletAction for local proxy/server communication.'
    );
  }

  // Detect the common filter → query → display pattern
  if (
    (req.includes('filter') &&
      (req.includes('data') || req.includes('table'))) ||
    (req.includes('search') &&
      (req.includes('form') || req.includes('criteria'))) ||
    (req.includes('select') &&
      req.includes('customer') &&
      req.includes('data')) ||
    (req.includes('employee') && req.includes('filter')) ||
    (req.includes('department') && req.includes('select')) ||
    (req.includes('load data') && req.includes('based on')) ||
    (req.includes('dynamic') && req.includes('table')) ||
    req.includes('statement') ||
    req.includes('report') ||
    (req.includes('query') && req.includes('display'))
  ) {
    plan.push(
      'Filter → query → display: use MUI controls for criteria, handleRestletAction with a typed payload, tested parameterized SuiteQL, a typed action DTO, React state, and DataGrid.'
    );
    plan.push(
      'Use sample:filterBarWithMUI, sample:suiteQlServerAction, and sample:dataGridAutoTypes; ignore grid upsert chains for new apps.'
    );
  }

  // App lifecycle commands
  if (
    req.includes('build') ||
    req.includes('dev') ||
    req.includes('validate') ||
    req.includes('deploy') ||
    req.includes('test locally') ||
    req.includes('local development')
  ) {
    plan.push(
      'Use the app lifecycle commands documented in suitereact_app_lifecycle.md for building, developing, validating, and deploying apps.'
    );
    if (appLifecycle) {
      plan.push('Available lifecycle commands:');
      plan.push(appLifecycle.trim());
    }
  }

  // Add comprehensive SuiteQL testing guidance when data operations are detected
  if (
    (req.includes('query') &&
      (req.includes('data') || req.includes('netsuite'))) ||
    req.includes('suiteql') ||
    req.includes('suite ql') ||
    req.includes('sql') ||
    req.includes('analytics') ||
    (req.includes('server') &&
      req.includes('action') &&
      (req.includes('data') || req.includes('search')))
  ) {
    plan.push(
      'SUITEQL TESTING BEST PRACTICE: Before writing server action code with SuiteQL queries, use the EXECUTE_SUITEQL_QUERY tool to:'
    );
    plan.push(
      '• Test and validate your query syntax in real-time against NetSuite'
    );
    plan.push(
      '• Verify the query returns the expected data structure and field names'
    );
    plan.push(
      '• Check query performance and result counts before implementation'
    );
    plan.push('• Iterate and refine queries based on actual NetSuite data');
    plan.push(
      '• Ensure proper handling of JOINs, date filters, and complex conditions'
    );
    plan.push(
      'EXECUTE_SUITEQL_QUERY parameters: query (required), limit (optional), offset (optional), row_limit (optional for RowNum-based limiting)'
    );
    plan.push(
      'Once your query is tested and working, copy the validated query into your server action implementation with confidence.'
    );
  }

  if (plan.length === 0) {
    plan.push(
      '🧩 IMPORTANT: Start by using the "Get SuiteReact Code Sample" tool to retrieve relevant patterns and examples for your specific use case!'
    );
    plan.push(
      'Review both suitereact_action_docs.json and suitereact_component_library.json for relevant patterns and components.'
    );
    plan.push(
      'Useful catalog entries: sample:filterBarWithMUI, sample:dataGridBasic, sample:dataGridAutoTypes, sample:handleRestletDevProxy, sample:suiteQlServerAction, sample:chatbotPanelStructured, and sample:blobZipExport.'
    );
    plan.push(
      'Review the suitereact_app_build_steps resource for a detailed checklist.'
    );
    plan.push(
      'For app lifecycle operations (build/dev/validate/deploy), reference suitereact_app_lifecycle.md.'
    );
    plan.push(
      'Run npm run review:app -- <app-name> to catch quality, legacy-pattern, and performance red flags before commit.'
    );
    plan.push(
      'Do not use validateSuiteReactPage for new freeform layouts; it only documents deprecation of the grid schema.'
    );
    plan.push(
      'For creating new client or server actions, FIRST use the Get SuiteReact Code Sample tool, THEN use the Action Scaffold Generator tool to generate properly structured action code following SuiteReact patterns.'
    );
  }
  if (appQuality && !plan.some(item => item.includes('Quality checklist'))) {
    plan.push(
      'Quality gate: before finishing, run npm run review:app -- <app-name> and use suitereact_app_quality.md to check product fit, UI states, NetSuite integration, performance, and deployability.'
    );
  }

  const references = `Resources loaded: actionDocs=${!!actionDocs}, componentLib=${!!componentLib}, appLifecycle=${!!appLifecycle}, appPerformance=${!!appPerformance}, appQuality=${!!appQuality}, suiteqlResources=${suiteqlResourcesLoaded}`;
  return [
    {
      type: 'text',
      text: `Plan:\n- ${plan.join('\n- ')}\n\n${references}${suiteqlResources}`,
    },
  ];
}
