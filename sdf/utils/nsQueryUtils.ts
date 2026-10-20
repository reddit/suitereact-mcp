import * as query from 'N/query';

import { NetsuiteQueryResult } from '../domain/netsuiteQueryResult';

/**
 * Paginates a query, compiles results to an array, and returns it
 *
 * @param thisQuery - query.Query - Query that has been created or loaded
 * @returns - NetsuiteQueryResult[] - Array of objects representing each Query result row. Objects are populated with key/value pairs of each query column.
 */
export const getPagedResultsFromQuery = (
  thisQuery: query.Query
): NetsuiteQueryResult[] => {
  const queryResults: NetsuiteQueryResult[] = [];
  // Run the query as a paged query with 1000 results per page
  const pagedData: query.PagedData = thisQuery.runPaged({
    pageSize: 1000,
  });
  const iterator = pagedData.iterator();
  iterator.each(page => {
    const currentPage = page.value;
    const pageData = currentPage.data;

    const pageResults = pageData.asMappedResults();
    if (pageResults && pageResults.length) {
      for (const result of pageResults) {
        queryResults.push(result);
      }
    }
    return true;
  });
  return queryResults;
};

/**
 * Runs a SuiteQL query and returns the results as an array of objects containing key-value pairs of field data
 *
 * @param queryStr - string - SuiteQL query string to run
 * @returns - NetsuiteQueryResult[] - Array of objects representing each SuiteQL result row. Objects are populated with key/value pairs of each SuiteQL select column.
 */
export const getResultsFromSuiteQl = (
  queryStr: string
): NetsuiteQueryResult[] => {
  try {
    const queryResults: NetsuiteQueryResult[] = [];

    const pageResults: query.QueryResultMap[] = query
      .runSuiteQL({
        query: queryStr,
      })
      .asMappedResults();
    if (pageResults && pageResults.length) {
      for (const result of pageResults) {
        queryResults.push(result);
      }
    }

    return queryResults;
  } catch (e: any) {
    const name: string = e?.name || 'UNKNOWN_ERROR';
    const msg: string =
      e?.message || e?.cause?.details || 'Unknown SuiteQL error';
    const preview =
      queryStr.length > 300 ? queryStr.substring(0, 300) + '…' : queryStr;

    const enriched: any = {
      name,
      message: `${msg} | Query: ${preview}`,
      cause: e?.cause,
      type: e?.type || 'error.SuiteScriptError',
    };
    throw enriched;
  }
};
