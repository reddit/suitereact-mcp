import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { netsuiteFetch } from '../auth/netsuiteFetch.js';
import {
  SuiteQLErrorOutput,
  SuiteQLInputSchema,
  SuiteQLOutput,
} from '../types.js';

export async function handleSuiteQLTool(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  let originalQuery = '';
  let finalQuery = '';
  let limitWarning = '';

  try {
    const inputArgs = SuiteQLInputSchema.parse(arguments_);
    originalQuery = inputArgs.query;

    const rawAccountId = process.env.NETSUITE_ACCOUNT_ID;
    const accountId = rawAccountId?.replace(/_/g, '-');
    if (!accountId) {
      throw new Error('NETSUITE_ACCOUNT_ID environment variable is not set');
    }

    const baseUrl = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
    const headers = {
      'Content-Type': 'application/json',
      Prefer: 'transient',
    };

    const params: Record<string, any> = {};
    if (inputArgs.offset !== undefined) {
      params.offset = inputArgs.offset;
    }

    // Process query - remove any LIMIT clauses and apply RowNum limiting
    let query = inputArgs.query;

    // Remove carriage returns and normalize whitespace
    query = query
      .replace(/\r\n/g, ' ') // Replace Windows line endings
      .replace(/\r/g, ' ') // Replace Mac line endings
      .replace(/\n/g, ' ') // Replace Unix line endings
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing whitespace

    // Check for and remove LIMIT clauses
    const limitRegex = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i;
    if (limitRegex.test(query)) {
      query = query.replace(limitRegex, '');
      limitWarning =
        'WARNING: LIMIT clause removed from query. Use the row_limit parameter instead.';
    }

    // Apply RowNum limiting if row_limit is specified
    if (inputArgs.row_limit !== undefined) {
      const rowLimit = inputArgs.row_limit;
      if (rowLimit > 0) {
        // More robust RowNum injection logic
        const upperQuery = query.toUpperCase();

        if (upperQuery.includes('WHERE')) {
          // Find the first WHERE and add RowNum condition
          const whereIndex = upperQuery.indexOf('WHERE');
          const beforeWhere = query.slice(0, whereIndex + 5); // Include 'WHERE'
          const afterWhere = query.slice(whereIndex + 5);
          // Add space after WHERE and before the AND
          query = `${beforeWhere} RowNum <= ${rowLimit} AND ${afterWhere.trim()}`;
        } else {
          // Need to add WHERE clause - find the right position
          const groupByIndex = upperQuery.indexOf('GROUP BY');
          const orderByIndex = upperQuery.indexOf('ORDER BY');

          // Find the earliest of these clauses to insert WHERE before it
          let insertIndex = query.length;
          if (groupByIndex !== -1)
            insertIndex = Math.min(insertIndex, groupByIndex);
          if (orderByIndex !== -1)
            insertIndex = Math.min(insertIndex, orderByIndex);

          if (insertIndex < query.length) {
            // Insert before GROUP BY or ORDER BY
            query =
              query.slice(0, insertIndex).trim() +
              ` WHERE RowNum <= ${rowLimit} ` +
              query.slice(insertIndex);
          } else {
            // Add at the end
            query = query.trim() + ` WHERE RowNum <= ${rowLimit}`;
          }
        }
      }
    }

    finalQuery = query;
    const requestBody = { q: query };

    // Make the request
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value.toString());
    });

    const response = await netsuiteFetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NetSuite API request failed: ${response.status} ${errorText}`
      );
    }

    const netsuiteResponseData = await response.json();

    // Add debug information to successful response
    const resultData: SuiteQLOutput = {
      ...netsuiteResponseData,
      _debug: {
        finalQuery,
        requestUrl: url.toString(),
        params,
      },
    };

    const jsonOutput = JSON.stringify(resultData, null, 2);
    return [{ type: 'text', text: jsonOutput }];
  } catch (error) {
    console.error('Error processing SuiteQL query:', error);

    let errorDetails = 'Unknown error';
    if (error instanceof Error) {
      errorDetails = error.message;
    }

    const resultData: SuiteQLErrorOutput = {
      error: 'Error processing SuiteQL query',
      details: errorDetails,
      _debug: {
        originalQuery,
        finalQuery: finalQuery || originalQuery,
        timestamp: new Date().toISOString(),
        ...(limitWarning && { limitWarning }),
      },
    } as SuiteQLErrorOutput;

    const jsonOutput = JSON.stringify(resultData, null, 2);
    return [{ type: 'text', text: jsonOutput }];
  }
}
