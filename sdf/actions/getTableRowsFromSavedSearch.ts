import * as log from 'N/log';
import * as search from 'N/search';

import {
  NsReactSelectOption,
  NsReactTableHeaderProps,
  NsReactTableRowProps,
  TableCellAlignOptions,
} from '../domain/suitereact';

export const getTableRowsFromSavedSearch = ({
  id,
}: {
  id: string;
}): { headers: NsReactTableHeaderProps[]; rows: NsReactTableRowProps[] } => {
  log.debug('Entered getTableRowsFromSavedSearch', id);

  const searchObj: search.Search = search.load({
    id,
  });
  log.debug('Saved search loaded', { id, columns: searchObj.columns.length });

  // Populate headers from paged data
  const headers: NsReactTableHeaderProps[] = [];

  searchObj.columns.forEach(col => {
    if (typeof col !== 'string') {
      const header: NsReactTableHeaderProps = {
        id: col.name,
        label: col.label ? col.label : '',
        align: TableCellAlignOptions.CENTER,
        join: col.join ? col.join : undefined,
        summary: col.summary ? col.summary : undefined,
      };
      let headerIdCnt = 0;
      headers.forEach(h => {
        if (h.id.startsWith(header.id)) {
          headerIdCnt++;
        }
      });
      if (headerIdCnt > 0) {
        header.id = header.id + '_duplicate_' + headerIdCnt;
      }
      headers.push(header);
    }
  });

  log.debug('Populated Headers', `Length: ${headers.length}`);

  const pagedData = searchObj.runPaged({
    pageSize: 1000,
  });

  // Fetch results
  const rows: NsReactTableRowProps[] = [];
  for (let i = 0; i < pagedData.pageRanges.length; i++) {
    const pageData = pagedData.fetch({ index: i });
    pageData.data.forEach((r: search.Result, index: number) => {
      const rowData: NsReactTableRowProps = {
        id: r.id ? parseInt(r.id.toString(), 10) : index,
        type: searchObj.searchType.toString(),
      };

      headers.forEach(h => {
        let fieldId: string = h.id;
        const duplicateIndex: number = fieldId.indexOf('_duplicate_');
        if (duplicateIndex > -1) {
          fieldId = fieldId.substring(0, duplicateIndex);
        }
        const fieldText: string = r.getText({
          name: fieldId,
          join: h.join,
          summary: h.summary,
        });
        const fieldValue: boolean | string | string[] = r.getValue({
          name: fieldId,
          join: h.join,
          summary: h.summary,
        });
        if (fieldText && fieldText.length) {
          const selectOption: NsReactSelectOption = {
            value: fieldValue.toString(),
            label: fieldText,
          };
          rowData[h.id] = selectOption;
        } else {
          rowData[h.id] = fieldValue;
        }
      });
      rows.push(rowData);
    });
  }

  log.debug('Populated rows', `Length: ${rows.length}`);

  return { headers, rows };
};
