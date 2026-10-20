import { z } from 'zod';

export const QueryFieldSchema = z.object({
  name: z.string().describe('Field name in the query result'),
  type: z.string().describe('Expected data type'),
  description: z.string().describe('Description of the field'),
});

export const NetSuiteQueryResponseSchema = z.object({
  historyTitle: z
    .string()
    .describe(
      "A concise 3-8 word title for query history based on the user's request"
    ),
  suggestedQuery: z.string().describe('The SuiteQL query to execute'),
  queryType: z
    .enum(['suiteql', 'saved_search', 'record_lookup'])
    .describe('Query type'),
  expectedFields: z.array(QueryFieldSchema).describe('Expected result fields'),
  confidence: z.number().describe('Confidence level 0-1'),
  explanation: z.string().describe('Natural language explanation of the query'),
});

export type NetSuiteQueryResponse = z.infer<typeof NetSuiteQueryResponseSchema>;
