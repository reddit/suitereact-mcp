import { TextContent } from '@modelcontextprotocol/sdk/types.js';

const DEPRECATION_MESSAGE = {
  deprecated: true,
  status: 'deprecated',
  summary:
    'The 12-column grid schema (NsReactFormGridElementProps rows, validateSuiteReactPage) is deprecated.',
  migration: [
    'SuiteReact apps now use freeform React + MUI: compose UI with @mui/material, layout with Box/Stack/Grid2, and @mui/x-data-grid for tables.',
    'Manage state with React hooks (useState, useReducer, context) instead of updateRows() / form-grid element APIs.',
    'Call NetSuite from the client with handleRestletAction (and toastService) from suitereact; return typed DTOs or throw from SuiteScript server actions.',
    'Do not build or validate pageSchema arrays; ignore old code samples that reference row widths summing to 12.',
    'Use the app scaffold and action scaffold tools for the current file layout under apps/<appId>/src.',
  ],
  note: 'This tool is kept for backward compatibility and always returns this guidance; pageSchema input is not validated.',
};

/**
 * @deprecated Grid-schema validation is obsolete. Returns migration guidance for freeform React + MUI.
 */
export async function handleValidateSuiteReactPageTool(
  _arguments_: Record<string, any>
): Promise<TextContent[]> {
  void _arguments_;
  return [
    {
      type: 'text',
      text: JSON.stringify(DEPRECATION_MESSAGE, null, 2),
    },
  ];
}
