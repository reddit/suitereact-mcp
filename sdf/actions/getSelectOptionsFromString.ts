import * as log from 'N/log';
import * as query from 'N/query';
import * as search from 'N/search';

import { NsReactSelectOption } from '../domain/suitereact';

export const getSelectOptionsFromString = ({
  sourceStr,
}: {
  sourceStr: string;
}): NsReactSelectOption[] => {
  log.debug('Entered getSelectOptionsFromString', sourceStr);
  let selectOptions: NsReactSelectOption[] = [];
  let selectOptionTextFieldId: string = getSelectOptionTextFieldId(sourceStr);
  log.debug(
    'Retrieved selectOptionTextFieldId',
    'sourceStr: ' +
      sourceStr +
      ' | selectOptionTextFieldId: ' +
      selectOptionTextFieldId
  );

  // If the param string is a value supported by the query module OR a custom record id,
  // Create return values via query
  if (
    isNsQueryRecordString(sourceStr) ||
    sourceStr.indexOf('customrecord') > -1
  ) {
    log.debug(
      'Source String: ' + sourceStr,
      'Populating source list via Record Query'
    );

    const thisQuery = query.create({
      type: sourceStr,
    });

    thisQuery.condition = thisQuery.and(
      thisQuery.createCondition({
        fieldId: 'isinactive',
        operator: query.Operator.IS,
        values: false,
      })
    );

    thisQuery.columns = [
      thisQuery.createColumn({
        fieldId: 'id',
      }),
    ];

    const selectTextColumn: query.Column = thisQuery.createColumn({
      fieldId: selectOptionTextFieldId,
      alias: 'selectText',
    });
    thisQuery.columns.push(selectTextColumn);
    thisQuery.sort = [
      thisQuery.createSort({
        column: selectTextColumn,
      }),
    ];

    // Run the query as a paged query with 1000 results per page
    const myPagedResults = thisQuery.runPaged({
      pageSize: 1000,
    });

    selectOptions = getSelectOptionsFromQueryPagedData(myPagedResults);
  }
  // If the param string is a saved search id, load the search, add custom columns, and return results
  else if (sourceStr.indexOf('customsearch') > -1) {
    const thisSearch: search.Search = search.load({
      id: sourceStr,
    });
    log.debug(
      'Populating source list via Saved Search | ' + sourceStr,
      JSON.stringify(thisSearch.columns)
    );

    // Add column to use for the select option text value
    let addSelectTextColumn = true;
    thisSearch.columns.forEach(col => {
      if (typeof col === 'string') {
        return;
      } else if (col.label === 'selectText') {
        addSelectTextColumn = false;
        selectOptionTextFieldId = col.name;
      }
    });
    if (addSelectTextColumn === true) {
      thisSearch.columns.push(
        search.createColumn({
          name: selectOptionTextFieldId,
          label: 'selectText',
        })
      );
    }

    const myPagedResults = thisSearch.runPaged({
      pageSize: 1000,
    });

    selectOptions = getSelectOptionsFromSearchPagedData(
      myPagedResults,
      selectOptionTextFieldId
    );
  }
  // If the param string is a dataset id, load the dataset, add custom columns, and return results
  else if (sourceStr.indexOf('custdataset') > -1) {
    const thisQuery: query.Query = query.load({
      id: sourceStr,
    });

    log.debug(
      'Populating source list via Custom Dataset | ' + sourceStr,
      JSON.stringify(thisQuery.columns)
    );

    // Add column to use for the select option text value
    let addSelectTextColumn = true;
    thisQuery.columns.forEach(col => {
      if (col.label === 'selectText') {
        addSelectTextColumn = false;
        selectOptionTextFieldId = col.fieldId;
        thisQuery.columns.push(
          thisQuery.createColumn({
            fieldId: selectOptionTextFieldId,
            alias: 'selectText',
          })
        );
        thisQuery.sort = [
          thisQuery.createSort({
            column: col,
          }),
        ];
      }
    });

    if (addSelectTextColumn === true) {
      const selectTextColumn = thisQuery.createColumn({
        fieldId: getSelectOptionTextFieldId(thisQuery.type),
        alias: 'selectText',
      });
      thisQuery.columns.push(selectTextColumn);
      thisQuery.sort = [
        thisQuery.createSort({
          column: selectTextColumn,
        }),
      ];
    }

    thisQuery.columns.push(
      thisQuery.createColumn({
        fieldId: 'id',
      })
    );

    // Run the query as a paged query with 1000 results per page
    const myPagedResults = thisQuery.runPaged({
      pageSize: 1000,
    });

    selectOptions = getSelectOptionsFromQueryPagedData(myPagedResults);
  }
  // Else try to create a new saved search for the provided string, populating the id and name columns
  // This works for customlist id values
  else {
    log.debug(
      'Populating source list via Saved Search | ' + sourceStr,
      'selectOptionTextFieldId: ' + selectOptionTextFieldId
    );
    const thisSearch = search.create({
      type: sourceStr,
      filters: [['isinactive', search.Operator.IS, 'F']],
      columns: [
        search.createColumn({
          name: selectOptionTextFieldId,
          sort: search.Sort.ASC,
          label: 'selectText',
        }),
      ],
    });

    const myPagedResults = thisSearch.runPaged({
      pageSize: 1000,
    });

    selectOptions = getSelectOptionsFromSearchPagedData(
      myPagedResults,
      selectOptionTextFieldId
    );
  }
  return selectOptions;
};

function isNsQueryRecordString(recordStr: string) {
  const values = Object.values(query.Type);
  if (values.includes(recordStr as unknown as query.Type)) {
    return true;
  }
  return false;
}

function getSelectOptionTextFieldId(recordStr: string): string {
  if (recordStr === 'customer') {
    return 'altname';
  }
  if (recordStr === 'employee' || recordStr === 'vendor') {
    return 'entityid';
  }
  if (recordStr === 'savedsearch') {
    return 'title';
  }
  if (recordStr === 'transaction') {
    return 'trandisplayname';
  }
  return 'name';
}

function getSelectOptionsFromQueryPagedData(
  pagedData: query.PagedData,
  inputSelectOptions?: NsReactSelectOption[]
): NsReactSelectOption[] {
  log.debug(
    'Entered getSelectOptionsFromQueryPagedData',
    JSON.stringify(pagedData)
  );
  log.debug('Page Count', pagedData.pageRanges.length);
  log.debug('Result Count', pagedData.count);

  let selectOptions: NsReactSelectOption[] = [];
  if (inputSelectOptions && inputSelectOptions.length) {
    selectOptions = inputSelectOptions;
  }
  // Fetch results using an iterator
  const iterator = pagedData.iterator();
  iterator.each(resultPage => {
    const currentPage = resultPage.value;
    const pageData = currentPage.data;

    const results = pageData.asMappedResults();
    if (results && results.length) {
      results.forEach(r => {
        if (r.id && r.selectText) {
          selectOptions.push({
            value: r.id.toString(),
            label: r.selectText.toString(),
            isSelected: false,
          });
        }
      });
    }
    return true;
  });

  return selectOptions;
}

function getSelectOptionsFromSearchPagedData(
  pagedData: search.PagedData,
  selectOptionTextFieldId: string,
  inputSelectOptions?: NsReactSelectOption[]
): NsReactSelectOption[] {
  let selectOptions: NsReactSelectOption[] = [];
  if (inputSelectOptions && inputSelectOptions.length) {
    selectOptions = inputSelectOptions;
  }

  // Fetch results
  for (let i = 0; i < pagedData.pageRanges.length; i++) {
    const pageData = pagedData.fetch({ index: i });
    pageData.data.forEach(r => {
      selectOptions.push({
        value: r.id.toString(),
        label: r.getValue({ name: selectOptionTextFieldId }).toString(),
        isSelected: false, // Make this not required
      });
    });
  }

  return selectOptions;
}
