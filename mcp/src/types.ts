import { z } from 'zod';

// SuiteQL Input Schema
export const SuiteQLInputSchema = z.object({
  query: z.string().describe('The SuiteQL query to execute'),
  limit: z.number().optional().describe('Maximum number of rows to return'),
  offset: z.number().optional().describe('Number of rows to skip'),
  row_limit: z
    .number()
    .optional()
    .describe('Maximum number of rows to return using RowNum-based limiting'),
});

export type SuiteQLInput = z.infer<typeof SuiteQLInputSchema>;

// SuiteQL Output Schema
export const SuiteQLOutputSchema = z.object({
  hasMore: z.boolean().optional(),
  count: z.number().optional(),
  offset: z.number().optional(),
  items: z.array(z.record(z.any())).optional(),
  links: z.array(z.record(z.any())).optional(),
});

export type SuiteQLOutput = z.infer<typeof SuiteQLOutputSchema>;

// SuiteQL Error Output Schema
export const SuiteQLErrorOutputSchema = z.object({
  error: z.string(),
  details: z.string(),
});

export type SuiteQLErrorOutput = z.infer<typeof SuiteQLErrorOutputSchema>;

// Echo Input Schema
export const EchoInputSchema = z.object({
  message: z.string().describe('The message to echo back'),
  prefix: z
    .string()
    .optional()
    .describe('Optional prefix to add to the message'),
});

export type EchoInput = z.infer<typeof EchoInputSchema>;

// Suitelet Generator Input Schema
export const SuiteletGeneratorInputSchema = z.object({
  appName: z.string().describe('The name of the new SuiteReact app'),
  appId: z
    .string()
    .describe(
      'Short ID for params, URLs, folder names, etc. (lowercase, < 15 characters, no spaces)'
    ),
  description: z.string().optional().describe('Description of the app'),
});

export type SuiteletGeneratorInput = z.infer<
  typeof SuiteletGeneratorInputSchema
>;

// React App Scaffold Input Schema
export const ReactAppScaffoldInputSchema = z.object({
  appName: z
    .string()
    .describe(
      'The display name and header title for the new SuiteReact app (human readable)'
    ),
  appId: z
    .string()
    .describe(
      'Short ID for params, URLs, folder names, etc. (lowercase, < 15 characters, no spaces)'
    ),
  subheader: z.string().describe('The subheader to display in the app'),
  clientActionsFile: z.string().describe('The name of the client actions file'),
  landingPageFile: z.string().describe('The name of the landing page file'),
  serverActionFile: z.string().describe('The name of the server action file'),
});

export type ReactAppScaffoldInput = z.infer<typeof ReactAppScaffoldInputSchema>;

// Action Scaffold Input Schema
export const ActionScaffoldInputSchema = z.object({
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
});

export type ActionScaffoldInput = z.infer<typeof ActionScaffoldInputSchema>;

// Get SuiteReact Code Sample Input Schema
export const GetSuiteReactCodeSampleInputSchema = z.object({
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
    .describe('Whether to include component information and usage patterns'),
});

export type GetSuiteReactCodeSampleInput = z.infer<
  typeof GetSuiteReactCodeSampleInputSchema
>;

// Build App Input Schema
export const BuildAppInputSchema = z.object({
  appName: z.string().describe('The name of the app to build'),
});

export type BuildAppInput = z.infer<typeof BuildAppInputSchema>;

// Deploy App Input Schema
export const DeployAppInputSchema = z.object({
  appName: z.string().describe('The name of the app to deploy'),
});

export type DeployAppInput = z.infer<typeof DeployAppInputSchema>;

// Dev App Input Schema
export const DevAppInputSchema = z.object({
  appName: z.string().describe('The name of the app to run in dev mode'),
});

export type DevAppInput = z.infer<typeof DevAppInputSchema>;

/** @deprecated Grid layout validation removed; input is ignored by the tool handler. */
export const ValidateSuiteReactPageInputSchema = z.object({
  pageSchema: z
    .any()
    .optional()
    .describe(
      'Deprecated. Formerly a 12-column grid pageSchema; the validate tool now only returns migration guidance.'
    ),
});

export type ValidateSuiteReactPageInput = z.infer<
  typeof ValidateSuiteReactPageInputSchema
>;

// Server Tools Enum
export enum ServerTools {
  ECHO_MESSAGE = 'echo_message',
  SUITEQL_QUERY_ASSISTANT = 'suiteql_query_assistant',
  EXECUTE_SUITEQL_QUERY = 'execute_suiteql_query',
  GENERATE_SUITELET = 'generate_suitelet',
  GENERATE_APP_SCAFFOLD = 'mcp_suitereact-mcp_generate_app_scaffold',
  ANALYZE_AND_PLAN = 'mcp_suitereact-mcp_analyze_and_plan',
  VALIDATE_SUITEREACT_PAGE = 'validate_suitereact_page',
  GENERATE_ACTION_SCAFFOLD = 'generate_action_scaffold',
  GET_SUITEREACT_CODE_SAMPLE = 'get_suitereact_code_sample',
  GET_RECORD_SCHEMA = 'get_netsuite_record_schema',
}
