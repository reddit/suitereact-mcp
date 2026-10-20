import * as log from 'N/log';

import {
  NsReactTableHeaderProps,
  NsReactTableRowProps,
  TableCellAlignOptions,
} from '../domain/suitereact';
import { getResultsFromSuiteQl } from '../utils/nsQueryUtils';

export const getTableRowsFromSuiteql = ({
  query,
}: {
  query: string;
}): { headers: NsReactTableHeaderProps[]; rows: NsReactTableRowProps[] } => {
  log.debug('Entered getTableRowsFromSuiteql', query);

  const queryResults = getResultsFromSuiteQl(query);
  log.debug('SuiteQL query results', `Length: ${queryResults.length}`);

  // If no results, return empty arrays
  if (!queryResults || queryResults.length === 0) {
    return { headers: [], rows: [] };
  }

  // Generate headers from the first result's keys
  const headers: NsReactTableHeaderProps[] = [];
  const firstResult = queryResults[0];

  for (const key in firstResult) {
    if (Object.prototype.hasOwnProperty.call(firstResult, key)) {
      const header: NsReactTableHeaderProps = {
        id: key,
        label: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
        align: TableCellAlignOptions.CENTER,
      };
      headers.push(header);
    }
  }

  log.debug('Generated Headers', `Length: ${headers.length}`);

  // Generate rows from query results
  const rows: NsReactTableRowProps[] = [];
  queryResults.forEach((result, index) => {
    const rowData: NsReactTableRowProps = {
      id: index,
      type: 'suiteql',
    };

    // Values are returned as NetSuite produced them; strings containing a
    // colon (statuses, times, memos) must not be reshaped.
    headers.forEach(h => {
      const fieldValue = result[h.id];
      rowData[h.id] =
        fieldValue === null || fieldValue === undefined ? null : fieldValue;
    });

    rows.push(rowData);
  });

  log.debug('Generated rows', `Length: ${rows.length}`);

  return { headers, rows };
};
