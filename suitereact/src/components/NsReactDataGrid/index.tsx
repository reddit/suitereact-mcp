import { Box, LinearProgress, Typography } from '@mui/material';
import {
  DataGrid,
  GridAlignment,
  GridColDef,
  GridColumnVisibilityModel,
  GridComparatorFn,
  GridFilterItem,
  GridFilterModel,
  GridRenderCellParams,
  GridRowSelectionModel,
  GridSortDirection,
  GridSortModel,
} from '@mui/x-data-grid';
import axios from 'axios';
import dayjs from 'dayjs';
import advanced from 'dayjs/plugin/advancedFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import * as React from 'react';

import {
  NsReactButtonProps,
  NsReactDataGridFilterOperator,
  NsReactFormGridElementProps,
  NsReactHandleActionInputProps,
  NsReactHandleChangeInputProps,
  NsReactPropTypeMap,
  NsReactSelectOption,
  NsReactTableDataType,
  NsReactTableHeaderProps,
  NsReactTableRowProps,
  NsReactTableSource,
  NsReactTableSourceType,
  NsReactUrlField,
  NsReactUserProps,
} from '../../domain';
import { isEmptyValue, REST } from '../../utils';
import NsReactDataGridToolbar from '../NsReactDataGridToolbar';

// Filters the provided rows array based on type and filter params passed in
const filterRowByTypeFilter = (
  row: NsReactTableRowProps,
  type: NsReactTableDataType,
  filter: GridFilterItem
): boolean => {
  // Get the operator by casting the filter.operator to the NsReactDataGridFilterOperator enum
  const operator: NsReactDataGridFilterOperator | null = filter.operator
    ? (filter.operator as NsReactDataGridFilterOperator)
    : null;
  // If there is no operator match, don't filter
  if (!operator) {
    return true;
  }
  // Handle boolean column filtering
  if (type === NsReactTableDataType.BOOLEAN) {
    const value: boolean = row[filter.field] as boolean;
    // If operator = 'is', find rows that match the selected filter value as a string ('true' or 'false')
    // If the selected filter value is 'false', also match null value
    if (operator === NsReactDataGridFilterOperator.IS) {
      if (value) {
        if (value.toString() === filter.value) {
          return true;
        }
        return false;
      } else {
        if (filter.value === 'false') {
          return true;
        }
        return false;
      }
    }
  }

  // Handle date column filtering
  if (type === NsReactTableDataType.DATE) {
    const value: Date = row[filter.field] as Date;
    if (operator === NsReactDataGridFilterOperator.IS) {
      if (value && dayjs(value).format('YYYY-MM-DD') === filter.value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.IS_NOT) {
      if (value && dayjs(value).format('YYYY-MM-DD') === filter.value) {
        return false;
      }
      return true;
    }
    if (operator === NsReactDataGridFilterOperator.AFTER) {
      if (value && dayjs(value).diff(dayjs(filter.value)) > 0) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.ON_OR_AFTER) {
      if (value && dayjs(value).diff(dayjs(filter.value)) >= 0) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.BEFORE) {
      if (value && dayjs(value).diff(dayjs(filter.value)) < 0) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.ON_OR_BEFORE) {
      if (value && dayjs(value).diff(dayjs(filter.value)) <= 0) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY) {
      if (!value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY_NOT) {
      if (value) {
        return true;
      }
      return false;
    }
  }

  // Handle date/time column filtering
  if (type === NsReactTableDataType.DATETIME) {
    // Adding dayjs timezone client localization to align timezone comparison with built-in MUI DataGrid DateTime filter
    dayjs.extend(timezone);
    dayjs.extend(utc);
    dayjs.extend(advanced);
    dayjs.tz.guess();
    const value: Date = row[filter.field] as Date;
    if (operator === NsReactDataGridFilterOperator.IS) {
      if (value && dayjs(value).format('YYYY-MM-DDTHH:mm') === filter.value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.IS_NOT) {
      if (value && dayjs(value).format('YYYY-MM-DDTHH:mm') === filter.value) {
        return false;
      }
      return true;
    }
    if (operator === NsReactDataGridFilterOperator.AFTER) {
      if (
        value &&
        dayjs(dayjs(value).format('YYYY-MM-DDTHH:mm')).diff(
          dayjs(filter.value)
        ) > 0
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.ON_OR_AFTER) {
      if (
        value &&
        dayjs(dayjs(value).format('YYYY-MM-DDTHH:mm')).diff(
          dayjs(filter.value)
        ) >= 0
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.BEFORE) {
      if (
        value &&
        dayjs(dayjs(value).format('YYYY-MM-DDTHH:mm')).diff(
          dayjs(filter.value)
        ) < 0
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.ON_OR_BEFORE) {
      if (
        value &&
        dayjs(dayjs(value).format('YYYY-MM-DDTHH:mm')).diff(
          dayjs(filter.value)
        ) <= 0
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY) {
      if (!value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY_NOT) {
      if (value) {
        return true;
      }
      return false;
    }
  }

  // Handle number filtering
  if (type === NsReactTableDataType.NUMBER) {
    const value: number = row[filter.field] as number;
    if (operator === NsReactDataGridFilterOperator.EQUAL) {
      if (value && value === parseFloat(filter.value)) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EQUAL_NOT) {
      if (value && value === parseFloat(filter.value)) {
        return false;
      }
      return true;
    }
    if (operator === NsReactDataGridFilterOperator.GREATER) {
      if (value && value > parseFloat(filter.value)) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.GREATER_OR_EQUAL) {
      if (value && value >= parseFloat(filter.value)) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.LESS) {
      if (value && value < parseFloat(filter.value)) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.LESS_OR_EQUAL) {
      if (value && value <= parseFloat(filter.value)) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY) {
      if (!value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY_NOT) {
      if (value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.ANY_OF) {
      const numberStringArr: string[] = filter.value; // Gets the array of number strings from filter
      if (numberStringArr && numberStringArr.length > 0) {
        if (value && numberStringArr.includes(value.toString())) {
          return true;
        }
        return false;
      }
    }
  }

  // Handle select filtering
  if (type === NsReactTableDataType.SELECT) {
    const value: NsReactSelectOption = row[filter.field] as NsReactSelectOption;
    if (operator === NsReactDataGridFilterOperator.IS) {
      if (value && value.label === filter.value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.IS_NOT) {
      if (value && value.label === filter.value) {
        return false;
      }
      return true;
    }
    if (operator === NsReactDataGridFilterOperator.ANY_OF) {
      const selectLabelArr: string[] = filter.value; // Gets the array of number strings from filter
      if (selectLabelArr && selectLabelArr.length > 0) {
        if (value && selectLabelArr.includes(value.label)) {
          return true;
        }
        return false;
      }
    }
  }

  // Handle string filtering
  if (type === NsReactTableDataType.STRING) {
    const value: string = row[filter.field] as string;
    if (operator === NsReactDataGridFilterOperator.CONTAIN) {
      if (
        value &&
        value.toLowerCase().trim().includes(filter.value.toLowerCase().trim())
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EQUAL_STRING) {
      if (
        value &&
        value.toLowerCase().trim() === filter.value.toLowerCase().trim()
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.START_WITH) {
      if (
        value &&
        value.toLowerCase().trim().startsWith(filter.value.toLowerCase().trim())
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.END_WITH) {
      if (
        value &&
        value.toLowerCase().trim().endsWith(filter.value.toLowerCase().trim())
      ) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY) {
      if (!value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.EMPTY_NOT) {
      if (value) {
        return true;
      }
      return false;
    }
    if (operator === NsReactDataGridFilterOperator.ANY_OF) {
      const strArr: string[] = filter.value as string[];
      const lowercaseStrArr: string[] = strArr.map(str =>
        str.toLowerCase().trim()
      );
      if (lowercaseStrArr && lowercaseStrArr.length > 0) {
        if (value && lowercaseStrArr.includes(value.toLowerCase().trim())) {
          return true;
        }
        return false;
      }
    }
  }
  return true;
};

// Returns a formatted row value based on the type
const formatValueByType = (
  val: any,
  type: NsReactTableDataType
): boolean | Date | number | string | NsReactSelectOption | NsReactUrlField => {
  if (type === NsReactTableDataType.BOOLEAN) {
    return val.toString().trim().toLowerCase() === 'true';
  }
  if (
    type === NsReactTableDataType.DATE ||
    type === NsReactTableDataType.DATETIME
  ) {
    return new Date(val.toString().trim());
  }
  if (type === NsReactTableDataType.NUMBER) {
    return parseFloat(val.toString().trim());
  }
  if (type === NsReactTableDataType.SELECT) {
    return val as NsReactSelectOption;
  }
  if (type === NsReactTableDataType.URL) {
    return val as NsReactUrlField;
  }
  return val.toString().trim();
};

const getDataTypeFromPropStr = (
  propStr: string,
  rows: NsReactTableRowProps[]
): NsReactTableDataType => {
  if (rows && rows.length) {
    // Check if property is a select field
    const notSelect = (e: NsReactTableRowProps) => {
      // Returns true if not select, returns false if it's a select field
      const val: any = e[propStr];
      if (isEmptyValue(val)) {
        return false;
      }
      if (typeof val === 'object' && val.label) {
        return false;
      }
      return true;
    };

    if (!rows.some(notSelect)) {
      return NsReactTableDataType.SELECT;
    }
    // Check if property is a url field
    const notUrl = (e: NsReactTableRowProps) => {
      // Returns true if not select, returns false if it's a select field
      const val: any = e[propStr];
      if (isEmptyValue(val)) {
        return false;
      }
      if (typeof val === 'object' && val.url) {
        return false;
      }
      return true;
    };

    if (!rows.some(notUrl)) {
      return NsReactTableDataType.URL;
    }
    // Check if property is a number
    const notNumeric = (e: NsReactTableRowProps) => {
      // Returns true if not numeric, returns false if it's a number
      const val: any = e[propStr];
      if (isEmptyValue(val)) {
        return false;
      }
      return isNaN(val.toString());
    };

    if (!rows.some(notNumeric)) {
      return NsReactTableDataType.NUMBER;
    }

    // Check if property is a boolean
    const notBoolean = (e: NsReactTableRowProps) => {
      // Returns true if not boolean, returns false if it's a boolean
      const val: any = e[propStr];
      if (isEmptyValue(val)) {
        return false;
      }

      return !(
        val.toString().toLowerCase() === 'true' ||
        val.toString().toLowerCase() === 'false'
      );
    };

    if (!rows.some(notBoolean)) {
      return NsReactTableDataType.BOOLEAN;
    }

    // Check if property is a DATE
    const notDate = (e: NsReactTableRowProps) => {
      // Returns true if not date, returns false if it's a date
      const val: any = e[propStr];
      if (isEmptyValue(val)) {
        return false;
      }

      return !(
        val.toString().includes('/') &&
        val.toString().indexOf(':') === -1 &&
        dayjs(val.toString()).isValid()
      );
    };

    if (!rows.some(notDate)) {
      return NsReactTableDataType.DATE;
    }

    // Check if property is a DATETIME
    const notDateTime = (e: NsReactTableRowProps) => {
      // Returns true if not datetime, returns false if it's a datetime
      const val: any = e[propStr];
      if (isEmptyValue(val)) {
        return false;
      }

      return !(
        val.toString().indexOf(':') > -1 && dayjs(val.toString()).isValid()
      );
    };

    if (!rows.some(notDateTime)) {
      return NsReactTableDataType.DATETIME;
    }
  }
  return NsReactTableDataType.STRING;
};

const getHeaderCellFromId = (
  id: string,
  headerCells: NsReactTableHeaderProps[]
): NsReactTableHeaderProps | null => {
  const index: number = headerCells.findIndex(e => e.id === id);
  if (index > -1) {
    return headerCells[index];
  }
  return null;
};

const getGridColumnVisiblityModel = (
  headerCells: NsReactTableHeaderProps[]
): GridColumnVisibilityModel => {
  const model: GridColumnVisibilityModel = {};

  for (const h of headerCells) {
    if (h.visible === undefined) {
      h.visible = true;
      model[h.id] = true;
      continue;
    }
    if (h.visible === false) {
      model[h.id] = false;
      continue;
    }
    model[h.id] = true;
  }

  return model;
};

const getPropTypeArr = (
  rows: NsReactTableRowProps[]
): Array<{
  id: string;
  type: NsReactTableDataType;
}> => {
  const propTypeArr: Array<{ id: string; type: NsReactTableDataType }> = [];
  if (rows && rows.length) {
    const firstRow: NsReactTableRowProps = rows[0];
    for (const [key] of Object.entries(firstRow)) {
      propTypeArr.push({ id: key, type: getDataTypeFromPropStr(key, rows) });
    }
  }
  return propTypeArr;
};

const getTypeById = (
  id: string,
  propTypes: NsReactPropTypeMap[]
): NsReactTableDataType | null => {
  if (propTypes && propTypes.length) {
    const propTypeIndex: number = propTypes.findIndex(e => e.id === id);
    if (propTypeIndex > -1) {
      return propTypes[propTypeIndex].type;
    }
  }
  return null;
};

// Sets the datagrid row visibility based on the column filters selected on the datagrid
const getRowVisibilityFromColumnFilters = (
  row: NsReactTableRowProps,
  filterModel: GridFilterModel,
  headerCells: NsReactTableHeaderProps[],
  propTypes: NsReactPropTypeMap[]
): boolean => {
  // Then pass each row through the column filter items to update visibility
  const filters: GridFilterItem[] = filterModel.items;
  for (let i = 0; i < filters.length; i++) {
    const headerCell: NsReactTableHeaderProps | null = getHeaderCellFromId(
      filters[i].field,
      headerCells
    );
    if (
      headerCell &&
      ((filters[i].value && filters[i].value !== '') ||
        filters[i].operator === NsReactDataGridFilterOperator.EMPTY ||
        filters[i].operator === NsReactDataGridFilterOperator.EMPTY_NOT)
    ) {
      const type: NsReactTableDataType | null = getTypeById(
        headerCell.id,
        propTypes
      );
      if (type) {
        return filterRowByTypeFilter(row, type, filters[i]);
      }
    }
  }
  return true;
};

// Sets the datagrid row visibility based on how it matches the space-delimited quick filter input strings, in sequence (i.e. matches string 1 AND string 2 AND string 3, etc.)
const getRowVisibilityFromQuickValues = (
  row: NsReactTableRowProps,
  propTypes: NsReactPropTypeMap[],
  filterValues: string[]
): boolean => {
  if (!propTypes || !propTypes.length) {
    return true;
  }
  for (let i = 0; i < filterValues.length; i++) {
    if (filterValues[i] && row.visible === true) {
      row.visible = false;
      for (const key in row) {
        if (isEmptyValue(row[key])) {
          continue;
        }
        const val: any = row[key];
        const propTypeIndex: number = propTypes.findIndex(e => e.id === key);

        // If no propType match, don't filter on quick value
        if (propTypeIndex === -1) {
          continue;
        }

        const type: NsReactTableDataType = propTypes[propTypeIndex].type;

        // Match whole number value only
        if (type === NsReactTableDataType.NUMBER) {
          if (val.toString().trim() === filterValues[i].trim()) {
            row.visible = true;
          }
        }

        // Match if select label startsWith filter value
        if (type === NsReactTableDataType.SELECT) {
          const selectVal: NsReactSelectOption = val as NsReactSelectOption;
          if (
            selectVal.label
              .toLowerCase()
              .trim()
              .startsWith(filterValues[i].toLowerCase().trim())
          ) {
            row.visible = true;
          }
        }

        // Match if string contains filter value
        if (type === NsReactTableDataType.STRING) {
          if (
            val
              .toString()
              .toLowerCase()
              .trim()
              .includes(filterValues[i].toLowerCase().trim())
          ) {
            row.visible = true;
          }
        }
      }
    }
  }
  return row.visible === true ? true : false;
};

// Value getter for select option fields
const getSelectOption = (value: any) => {
  if (value) {
    const selectOption: NsReactSelectOption = value as NsReactSelectOption;
    return selectOption.label ? selectOption.label : '- None -';
  }
};

// Returns an array of unique select option values for a provided property id
const getSelectValueOptions = (
  id: string,
  rows: NsReactTableRowProps[]
): string[] => {
  const selectOptions: string[] = [];
  rows.forEach(row => {
    if (isEmptyValue(row[id]) === false) {
      const selectOption: NsReactSelectOption = row[id] as NsReactSelectOption;
      if (
        selectOption.value &&
        selectOptions.findIndex(e => e === selectOption.label) === -1
      ) {
        selectOptions.push(selectOption.label);
      }
    }
  });
  return selectOptions;
};

// Basic date comparator to use in grid column definitions only
const dayJsDateComparator: GridComparatorFn<Date> = (v1, v2) => {
  return dayjs(v1).diff(dayjs(v2));
};

function getSortComparator(
  order: GridSortDirection,
  orderBy: string,
  propTypes: NsReactPropTypeMap[],
  sortType?: NsReactTableDataType // Used to override the native use of the propTypes array. Useful for scenario where you want to sort based on a property that's not a header cell
): (r1: NsReactTableRowProps, r2: NsReactTableRowProps) => number {
  // Default sort type is string
  let type: NsReactTableDataType = NsReactTableDataType.STRING;

  // If a sortType was passed as a param, use it
  if (sortType) {
    type = sortType;
  } else {
    // Else, try getting the type from the propTypes array
    if (propTypes && propTypes.length) {
      const propTypeIndex: number = propTypes.findIndex(e => e.id === orderBy);
      if (propTypeIndex > -1) {
        type = propTypes[propTypeIndex].type;
      }
    }
  }

  if (type === NsReactTableDataType.BOOLEAN) {
    return order === 'asc'
      ? (r1, r2) => booleanComparator(r1, r2, orderBy)
      : (r1, r2) => -booleanComparator(r1, r2, orderBy);
  }
  if (type === NsReactTableDataType.DATE) {
    return order === 'asc'
      ? (r1, r2) => dateComparator(r1, r2, orderBy)
      : (r1, r2) => -dateComparator(r1, r2, orderBy);
  }
  if (type === NsReactTableDataType.DATETIME) {
    return order === 'asc'
      ? (r1, r2) => dateComparator(r1, r2, orderBy)
      : (r1, r2) => -dateComparator(r1, r2, orderBy);
  }
  if (type === NsReactTableDataType.NUMBER) {
    return order === 'asc'
      ? (r1, r2) => numberComparator(r1, r2, orderBy)
      : (r1, r2) => -numberComparator(r1, r2, orderBy);
  }
  if (type === NsReactTableDataType.SELECT) {
    return order === 'asc'
      ? (r1, r2) => selectComparator(r1, r2, orderBy)
      : (r1, r2) => -selectComparator(r1, r2, orderBy);
  }
  return order === 'asc'
    ? (r1, r2) => stringComparator(r1, r2, orderBy)
    : (r1, r2) => -stringComparator(r1, r2, orderBy);
}

const getVisibleRowCount = (rows: NsReactTableRowProps[]): number => {
  let i = 0;
  for (const r of rows) {
    if (r.visible === undefined || r.visible === true) {
      i++;
    }
  }
  return i;
};

const booleanComparator = (
  r1: NsReactTableRowProps,
  r2: NsReactTableRowProps,
  orderBy: string
) => {
  const v1: boolean = r1[orderBy] as boolean;
  const v2: boolean = r2[orderBy] as boolean;
  if (v1 === v2) {
    return r1.id - r2.id;
  } else {
    if (v1 === true) {
      return 1;
    }
    return -1;
  }
};
const dateComparator = (
  r1: NsReactTableRowProps,
  r2: NsReactTableRowProps,
  orderBy: string
) => {
  const v1: string = r1[orderBy] as string;
  const v2: string = r2[orderBy] as string;
  const diff: number = dayjs(v1).diff(dayjs(v2));
  if (diff > 0) {
    return 1;
  }
  if (diff < 0) {
    return -1;
  }
  return r1.id - r2.id;
};
const numberComparator = (
  r1: NsReactTableRowProps,
  r2: NsReactTableRowProps,
  orderBy: string
) => {
  const v1: number = r1[orderBy] as number;
  const v2: number = r2[orderBy] as number;
  if (v1 === v2) {
    return r1.id - r2.id;
  }
  return v1 - v2;
};
const selectComparator = (
  r1: NsReactTableRowProps,
  r2: NsReactTableRowProps,
  orderBy: string
) => {
  const v1 = r1[orderBy] as NsReactSelectOption;
  const v2 = r2[orderBy] as NsReactSelectOption;
  if (!v1 && !v2) {
    return r1.id - r2.id;
  }
  if (!v1 && v2) {
    return -1;
  }
  if (v1 && !v2) {
    return 1;
  }
  const localeCompare: number = v1.label.localeCompare(v2.label);
  if (localeCompare === 0) {
    return r1.id - r2.id;
  }
  return localeCompare;
};
const stringComparator = (
  r1: NsReactTableRowProps,
  r2: NsReactTableRowProps,
  orderBy: string
) => {
  const v1: string = r1[orderBy] ? (r1[orderBy] as string) : '';
  const v2: string = r2[orderBy] ? (r2[orderBy] as string) : '';
  const localeCompare = v1.localeCompare(v2);
  if (localeCompare === 0) {
    return r1.id - r2.id;
  }
  return localeCompare;
};

// Custom sort function for select option fields
function sortSelectOption(v1: any, v2: any) {
  return v1.toString().localeCompare(v2.toString());
}

// Custom loading overlay component
const CustomLoadingOverlay = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    height="100%"
    gap={2}
  >
    <LinearProgress sx={{ width: '100%' }} />
    <Typography
      variant="h6"
      color="text.secondary"
      sx={{ marginBottom: '20px' }}
    >
      Loading...
    </Typography>
  </Box>
);

// Custom no rows overlay component
const CustomNoRowsOverlay = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    height="100%"
    gap={2}
  >
    <Typography
      variant="h6"
      color="text.secondary"
      sx={{ marginBottom: '20px' }}
    >
      No Rows
    </Typography>
  </Box>
);

export default function NsReactDataGrid(props: {
  id: string;
  title?: string;
  pageSize: number;
  hideToolbar: boolean;
  checkboxSelection: boolean;
  userProps: NsReactUserProps;
  loading: boolean;
  exportFileNameTemplate: string;
  actionButtons?: NsReactButtonProps[];
  source?: NsReactTableSource;
  headerCells?: NsReactTableHeaderProps[];
  value?: NsReactTableRowProps[];
  visibleRows?: NsReactTableRowProps[];
  formElements: NsReactFormGridElementProps[];
  handleAction: (props: NsReactHandleActionInputProps) => Promise<any>;
  onChange: (props: NsReactHandleChangeInputProps) => void;
  apiBaseUrl?: string;
  apiToken?: string;
}) {
  const [tableHeaders, setTableHeaders] = React.useState<
    NsReactTableHeaderProps[]
  >([]);
  const [tableRows, setTableRows] = React.useState<NsReactTableRowProps[]>([]);
  const [propTypes, setPropTypes] = React.useState<
    Array<{
      id: string;
      type: NsReactTableDataType;
    }>
  >(props.value ? getPropTypeArr(props.value) : []);
  const [loading, setLoading] = React.useState(
    props.loading === true || (props.source && tableHeaders.length === 0)
      ? true
      : false
  );

  // Update loading state when props.loading changes
  React.useEffect(() => {
    setLoading(props.loading);
  }, [props.loading]);

  // Use state to track the source and only update when values actually change
  const [currentSource, setCurrentSource] =
    React.useState<NsReactTableSource | null>(null);

  // Update currentSource only when the actual values change
  React.useEffect(() => {
    if (props.source) {
      if (
        !currentSource ||
        currentSource.type !== props.source.type ||
        currentSource.id !== props.source.id
      ) {
        setCurrentSource({ type: props.source.type, id: props.source.id });
      }
    } else if (currentSource) {
      setCurrentSource(null);
    }
  }, [props.source?.type, props.source?.id]);

  // Handle source changes and value prop changes
  React.useEffect(() => {
    // declare the data fetching function
    const getRowsFromTableProps = async (): Promise<NsReactTableRowProps[]> => {
      if (props.value) {
        setLoading(false); // Data is already available, no loading needed

        // Update propTypes first
        const newPropTypes = getPropTypeArr(props.value);
        setPropTypes(newPropTypes);

        // Generate headers from data if not provided
        let headers = props.headerCells ? props.headerCells : [];
        if (headers.length === 0 && props.value && props.value.length > 0) {
          const firstRow = props.value[0];
          headers = Object.keys(firstRow)
            .filter(
              key =>
                key !== 'initIndex' &&
                key !== 'selected' &&
                key !== 'visible' &&
                key !== 'drilldown'
            )
            .map(key => ({
              id: key,
              label: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
              visible: true,
            }));
        }

        setTableHeaders(headers);
        props.onChange({
          elementId: props.id,
          key: 'headerCells',
          newValue: headers,
        });

        const cleanRowData: NsReactTableRowProps[] =
          sanitizeRowDataWithPropTypes(props.value, newPropTypes);
        setTableRows(cleanRowData);
        props.onChange({
          elementId: props.id,
          key: 'value',
          newValue: cleanRowData,
        });
      } else if (currentSource) {
        if (currentSource.type === NsReactTableSourceType.SEARCH) {
          getTableRowsFromSavedSearch(currentSource.id);
        }
        if (currentSource.type === NsReactTableSourceType.QUERY) {
          getTableRowsFromDataset(currentSource.id);
        }
        if (currentSource.type === NsReactTableSourceType.SUITEQL) {
          getTableRowsFromSuiteql(currentSource.id);
        }
      }
      return [];
    };

    // Handle value prop changes
    if (props.value && props.value.length > 0) {
      getRowsFromTableProps().catch(console.error);
    }
    // Handle source changes
    else if (currentSource && !props.value) {
      setLoading(true);
      // Clear existing data when source changes
      setTableHeaders([]);
      setTableRows([]);
      setPropTypes([]);
      // call the function
      getRowsFromTableProps().catch(console.error);
    }
  }, [currentSource, props.value, props.headerCells]);
  const [gridColumnVisibilityModel, setGridColumnVisibilityModel] =
    React.useState<GridColumnVisibilityModel>(
      getGridColumnVisiblityModel(tableHeaders)
    );
  const [exportFileName, setExportFileName] = React.useState<string>(
    `${props.title} - ${dayjs().format('MDDYYYY')}`
  );
  const [visibleRows, setVisibleRows] = React.useState<NsReactTableRowProps[]>(
    []
  );

  // Set rows per page options
  const rowsPerPageOptions: number[] = [5, 10, 15, 25, 50, 100];

  // Converts the tableHeaders input array to Material's DataGrid GridColDef objects
  const getDataGridColumns = (): GridColDef[] => {
    const gridHeaderCells: GridColDef[] = [];

    tableHeaders.forEach(cell => {
      // Default type is string
      let type: NsReactTableDataType = NsReactTableDataType.STRING;

      // Try getting the type from the propTypes array
      if (propTypes && propTypes.length) {
        const propTypeIndex: number = propTypes.findIndex(
          e => e.id === cell.id
        );
        if (propTypeIndex > -1) {
          type = propTypes[propTypeIndex].type;
        }
      }

      if (type === NsReactTableDataType.DATE) {
        gridHeaderCells.push({
          field: cell.id,
          headerName: cell.label,
          type,
          headerAlign: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          align: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          flex: cell.appWidth ? cell.appWidth : 1,
          valueFormatter(value: any) {
            dayjs.extend(timezone);
            dayjs.extend(utc);
            dayjs.extend(advanced);
            if (props.userProps.timezone) {
              return dayjs(value)
                .tz(props.userProps.timezone)
                .format('MM/DD/YYYY');
            }
            dayjs.tz.guess();
            return dayjs(value).tz().format('MM/DD/YYYY');
          },
          sortComparator: dayJsDateComparator,
        });
        return;
      }

      /** Custom Date/Time handling
       *  - valueFormatter uses dayjs to set timezone based on dayjs.tz.guess() function
       *    and format the Date/Time value as MM/DD/YYYY hh:mm:ss A z (e.g. 01/30/2022 08:53:00 PM PST)
       */
      if (type === NsReactTableDataType.DATETIME) {
        gridHeaderCells.push({
          field: cell.id,
          headerName: cell.label,
          type,
          headerAlign: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          align: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          flex: cell.appWidth ? cell.appWidth : 1,
          valueFormatter(value: any) {
            dayjs.extend(timezone);
            dayjs.extend(utc);
            dayjs.extend(advanced);
            if (props.userProps.timezone) {
              return dayjs(value)
                .tz(props.userProps.timezone)
                .format('MM/DD/YYYY hh:mm:ss A z');
            }
            dayjs.tz.guess();
            return dayjs(value).tz().format('MM/DD/YYYY hh:mm:ss A z');
          },
          sortComparator: dayJsDateComparator,
        });
        return;
      }

      /** Custom Select Option handling
       *  - valueOptions populated by getSelectValueOptions function
       *  - sortComparator calls sortSelectOption function
       *  - valueGetter gets the selectOption label
       */
      if (type === NsReactTableDataType.SELECT) {
        gridHeaderCells.push({
          field: cell.id,
          headerName: cell.label,
          type,
          headerAlign: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          align: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          flex: cell.appWidth ? cell.appWidth : 1,
          valueOptions: getSelectValueOptions(cell.id, tableRows),
          sortComparator: (v1, v2) =>
            sortSelectOption(v1 ? v1 : '', v2 ? v2 : ''),
          valueGetter: getSelectOption,
        });
        return;
      }

      /** Custom URL field handling
       *  - valueOptions populated by getSelectValueOptions function
       *  - sortComparator calls sortSelectOption function
       *  - valueGetter gets the selectOption label
       */
      if (type === NsReactTableDataType.URL) {
        gridHeaderCells.push({
          field: cell.id,
          headerName: cell.label,
          type: 'string',
          headerAlign: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          align: cell.align
            ? (cell.align.toString() as GridAlignment)
            : 'center',
          flex: cell.appWidth ? cell.appWidth : 1,
          sortable: false,
          renderCell: (params: GridRenderCellParams) => {
            if (params.value) {
              const urlField: NsReactUrlField = params.value as NsReactUrlField;
              if (urlField.newWindow === false) {
                return <a href={urlField.url}>{urlField.displayText}</a>;
              }
              return (
                <a
                  href={urlField.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {urlField.displayText}
                </a>
              );
            }
            return null;
          },
        });
        return;
      }

      // Standard cell type handling
      gridHeaderCells.push({
        field: cell.id,
        headerName: cell.label,
        type,
        headerAlign: cell.align
          ? (cell.align.toString() as GridAlignment)
          : 'center',
        align: cell.align ? (cell.align.toString() as GridAlignment) : 'center',
        flex: cell.appWidth ? cell.appWidth : 1,
      });
    });

    return gridHeaderCells;
  };

  const getFileNameFromTemplateStr = (
    templateStr: string,
    vars = {}
  ): string => {
    const handler = new Function(
      'vars',
      [
        'const tagged = ( ' + Object.keys(vars).join(', ') + ' ) =>',
        '`' + templateStr + '`',
        'return tagged(...Object.values(vars))',
      ].join('\n')
    );

    return handler(vars);
  };

  const getExportFileName = (props: {
    exportFileNameTemplate: string;
    visibleRows: NsReactTableRowProps[];
    title?: string;
  }) => {
    try {
      const { exportFileNameTemplate } = props;
      const fileName: string = getFileNameFromTemplateStr(
        exportFileNameTemplate,
        {
          props,
          dayjs,
        }
      );
      setExportFileName(fileName);
    } catch (e) {
      console.error('getExportFileName Error', e);
    }
  };

  const getTableRowsFromSavedSearch = async (id: string) => {
    setLoading(true);
    let data: any;

    try {
      if (props.apiBaseUrl && props.apiBaseUrl.length > 0) {
        const apiClient = axios.create({
          baseURL: props.apiBaseUrl,
          headers: props.apiToken
            ? { 'X-SuiteReact-Proxy-Token': props.apiToken }
            : undefined,
        });
        const response = await apiClient.post('/api/handle-action', {
          params: {
            actionProps: {
              action: 'getTableRowsFromSavedSearch',
            },
          },
          inputData: {
            id,
          },
        });

        if (response.data.error) {
          console.error('Error fetching select options:', response.data.error);
          return [];
        }

        data = response.data;
      } else {
        const { data: responseData, error } = await REST.get({
          action: 'getTableRowsFromSavedSearch',
          data: {
            id,
          },
        });

        if (error) {
          return error;
        }

        data = responseData;
      }
      setPropTypes(getPropTypeArr(data.rows));
      setTableHeaders(data.headers);
      props.onChange({
        elementId: props.id,
        key: 'headerCells',
        newValue: data.headers,
      });

      const cleanRowData: NsReactTableRowProps[] = sanitizeRowData(data.rows);
      setTableRows(cleanRowData);
      props.onChange({
        elementId: props.id,
        key: 'value',
        newValue: cleanRowData,
      });
    } catch (error: any) {
      console.error('Error fetching table rows from saved search', {
        status: error?.response?.status,
      });
    } finally {
      setLoading(false);
    }
  };

  const getTableRowsFromDataset = async (id: string) => {
    setLoading(true);

    try {
      const { data, error } = await REST.get({
        action: 'getTableRowsFromDataset',
        data: {
          id,
        },
      });

      if (error) {
        return error;
      }

      setPropTypes(getPropTypeArr(data.rows));
      setTableHeaders(data.headers);
      props.onChange({
        elementId: props.id,
        key: 'headerCells',
        newValue: data.headers,
      });

      const cleanRowData: NsReactTableRowProps[] = sanitizeRowData(data.rows);
      setTableRows(cleanRowData);
      props.onChange({
        elementId: props.id,
        key: 'value',
        newValue: cleanRowData,
      });
    } catch (error) {
      console.error('Error fetching table rows from dataset:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTableRowsFromSuiteql = async (query: string) => {
    setLoading(true);
    let data: any;

    try {
      if (props.apiBaseUrl && props.apiBaseUrl.length > 0) {
        const apiClient = axios.create({
          baseURL: props.apiBaseUrl,
          headers: props.apiToken
            ? { 'X-SuiteReact-Proxy-Token': props.apiToken }
            : undefined,
        });
        const response = await apiClient.post('/api/handle-action', {
          params: {
            actionProps: {
              action: 'getTableRowsFromSuiteql',
            },
          },
          inputData: {
            query,
          },
        });

        if (response.data.error) {
          console.error('Error fetching SuiteQL data:', response.data.error);
          return [];
        }

        data = response.data;
      } else {
        const { data: responseData, error } = await REST.get({
          action: 'getTableRowsFromSuiteql',
          data: {
            query,
          },
        });

        if (error) {
          return error;
        }

        data = responseData;
      }
      setPropTypes(getPropTypeArr(data.rows));
      setTableHeaders(data.headers);
      props.onChange({
        elementId: props.id,
        key: 'headerCells',
        newValue: data.headers,
      });

      const cleanRowData: NsReactTableRowProps[] = sanitizeRowData(data.rows);
      setTableRows(cleanRowData);
      props.onChange({
        elementId: props.id,
        key: 'value',
        newValue: cleanRowData,
      });
    } catch (error: any) {
      console.error('Error fetching table rows from SuiteQL', {
        status: error?.response?.status,
      });
    } finally {
      setLoading(false);
    }
  };

  const getToolbar = (): JSX.Element | null => {
    return (
      <NsReactDataGridToolbar
        tableId={props.id}
        title={props.title}
        hideToolbar={props.hideToolbar}
        actionButtons={props.actionButtons}
        formElements={props.formElements}
        handleAction={props.handleAction}
        rowCount={
          tableRows && tableRows.length ? getVisibleRowCount(tableRows) : 0
        }
        rowsPerPageOptions={rowsPerPageOptions}
        exportFileName={exportFileName}
      />
    );
  };

  // Iterates through the props.row array and formats the property values
  const sanitizeRowData = (
    rows: NsReactTableRowProps[]
  ): NsReactTableRowProps[] => {
    const cleanRowData: NsReactTableRowProps[] = [];
    rows.forEach((row: NsReactTableRowProps, index: number) => {
      // Ensure each row has an id property for MUI DataGrid
      if (row.id === undefined || row.id === null) {
        row.id = index;
      }

      if (row.initIndex === null || row.initIndex === undefined) {
        row.initIndex = index;
        for (const key in row) {
          if (isEmptyValue(row[key])) {
            row[key] = null;
          } else {
            const val: any = row[key];
            if (propTypes && propTypes.length) {
              const propTypeIndex: number = propTypes.findIndex(
                e => e.id === key
              );
              if (propTypeIndex > -1) {
                const type: NsReactTableDataType =
                  propTypes[propTypeIndex].type;
                row[key] = formatValueByType(row[key], type);
              } else {
                row[key] = val.toString().trim();
              }
            }
          }
        }
      }
      if (!row.selected) {
        row.selected = false;
      }
      cleanRowData.push(row);
    });
    if (cleanRowData.length > 0) {
      setVisibleRows(cleanRowData);
      getExportFileName({
        exportFileNameTemplate: props.exportFileNameTemplate,
        visibleRows: cleanRowData,
        title: props.title,
      });
    }
    return cleanRowData;
  };

  // Iterates through the props.row array and formats the property values with specific propTypes
  const sanitizeRowDataWithPropTypes = (
    rows: NsReactTableRowProps[],
    propTypesArr: Array<{ id: string; type: NsReactTableDataType }>
  ): NsReactTableRowProps[] => {
    const cleanRowData: NsReactTableRowProps[] = [];
    rows.forEach((row: NsReactTableRowProps, index: number) => {
      // Ensure each row has an id property for MUI DataGrid
      if (row.id === undefined || row.id === null) {
        row.id = index;
      }

      if (row.initIndex === null || row.initIndex === undefined) {
        row.initIndex = index;
        for (const key in row) {
          if (isEmptyValue(row[key])) {
            row[key] = null;
          } else {
            const val: any = row[key];
            if (propTypesArr && propTypesArr.length) {
              const propTypeIndex: number = propTypesArr.findIndex(
                e => e.id === key
              );
              if (propTypeIndex > -1) {
                const type: NsReactTableDataType =
                  propTypesArr[propTypeIndex].type;
                row[key] = formatValueByType(row[key], type);
              } else {
                row[key] = val.toString().trim();
              }
            }
          }
        }
      }
      if (!row.selected) {
        row.selected = false;
      }
      cleanRowData.push(row);
    });
    if (cleanRowData.length > 0) {
      setVisibleRows(cleanRowData);
      getExportFileName({
        exportFileNameTemplate: props.exportFileNameTemplate,
        visibleRows: cleanRowData,
        title: props.title,
      });
    }
    return cleanRowData;
  };

  // Update the headerCells visibility on column visibility change
  const handleColumnVisiblityChange = async (
    model: GridColumnVisibilityModel
  ) => {
    if (Object.keys(model).length) {
      for (const [key, value] of Object.entries(model)) {
        for (const h of tableHeaders) {
          if (h.id === key) {
            h.visible = value;
          }
        }
      }
    } else {
      for (const h of tableHeaders) {
        h.visible = true;
      }
    }

    setGridColumnVisibilityModel(getGridColumnVisiblityModel(tableHeaders));
  };

  // Update row visibility on filter change
  const handleFilterModelChange = async (model: GridFilterModel) => {
    const newVisibleRows: NsReactTableRowProps[] = [];
    // Iterate through rows async
    for (const row of tableRows) {
      // Default set row to be visible
      row.visible = true;

      // First, use the datagrid column filters to determine row visibility
      row.visible = getRowVisibilityFromColumnFilters(
        row,
        model,
        tableHeaders,
        propTypes
      );

      // Then, if row is still visible && quickFilterValues are present, filter row using MUI datagrid logic for quickFilterValues
      if (row.visible === true && model.quickFilterValues) {
        if (model.quickFilterValues && model.quickFilterValues.length > 0) {
          row.visible = getRowVisibilityFromQuickValues(
            row,
            propTypes,
            model.quickFilterValues
          );
        }
      }

      if (row.visible === true) {
        newVisibleRows.push(row);
      }
    }
    setVisibleRows(newVisibleRows);
    getExportFileName({
      exportFileNameTemplate: props.exportFileNameTemplate,
      title: props.title,
      visibleRows: newVisibleRows,
    });
  };

  // Update select property value on selection model change
  const handleSelectionModelChange = async (model: GridRowSelectionModel) => {
    if (model.ids.size === tableRows.length) {
      for (const row of tableRows) {
        row.selected = true;
      }
    } else {
      for (const row of tableRows) {
        if (model.ids.has(row.id)) {
          row.selected = true;
        } else {
          row.selected = false;
        }
      }
    }
  };

  // Sort tableRows on sort model change
  const handleSortModelChange = async (model: GridSortModel) => {
    if (model.length === 0) {
      tableRows.sort(
        getSortComparator(
          'asc',
          'initIndex',
          propTypes,
          NsReactTableDataType.NUMBER
        )
      );
      if (props.visibleRows && props.visibleRows.length > 0) {
        props.visibleRows.sort(
          getSortComparator(
            'asc',
            'initIndex',
            propTypes,
            NsReactTableDataType.NUMBER
          )
        );
      }
    } else {
      model.forEach(item => {
        tableRows.sort(getSortComparator(item.sort, item.field, propTypes));
        if (props.visibleRows && props.visibleRows.length > 0) {
          props.visibleRows.sort(
            getSortComparator(item.sort, item.field, propTypes)
          );
        }
      });
    }
    getExportFileName({
      exportFileNameTemplate: props.exportFileNameTemplate,
      title: props.title,
      visibleRows: visibleRows,
    });
  };

  return (
    <div style={{ height: 'auto', width: '100%' }}>
      <DataGrid
        rows={tableRows}
        columnVisibilityModel={getGridColumnVisiblityModel(tableHeaders)}
        columns={getDataGridColumns()}
        pageSizeOptions={rowsPerPageOptions}
        checkboxSelection={props.checkboxSelection}
        showToolbar={props.hideToolbar === true ? false : true}
        hideFooterSelectedRowCount={
          props.checkboxSelection === true ? false : true
        }
        slots={{
          toolbar: props.hideToolbar ? undefined : getToolbar,
          loadingOverlay: CustomLoadingOverlay,
          noRowsOverlay: CustomNoRowsOverlay,
        }}
        initialState={{
          columns: {
            columnVisibilityModel: { ...gridColumnVisibilityModel },
          },
          pagination: {
            paginationModel: { pageSize: props.pageSize },
          },
        }}
        loading={loading}
        filterDebounceMs={500}
        onColumnVisibilityModelChange={async (
          model: GridColumnVisibilityModel
        ) => {
          await handleColumnVisiblityChange(model);
        }}
        onFilterModelChange={async (model: GridFilterModel) => {
          await handleFilterModelChange(model);
        }}
        onRowSelectionModelChange={async (model: GridRowSelectionModel) => {
          await handleSelectionModelChange(model);
        }}
        onSortModelChange={async (model: GridSortModel) => {
          await handleSortModelChange(model);
        }}
      />
    </div>
  );
}
