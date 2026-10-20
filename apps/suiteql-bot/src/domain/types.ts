import type { GridColDef, GridRowsProp } from '@mui/x-data-grid';

/** One entry in the left sidebar query history */
export type QueryHistoryEntry = {
  id: string;
  title: string;
  query: string;
  timestamp: number;
  resultCount: number;
};

/** Normalized result for the DataGrid */
export type QueryResultState = {
  columns: GridColDef[];
  rows: GridRowsProp;
};

export type { SuiteqlError } from './actions/clientActions';
