import type { GridColDef } from '@mui/x-data-grid';

/** Max rows returned per SuiteQL call (N/query.asMappedResults limit). */
export const PAGE_SIZE = 5000;

/** High-level record family to drive SuiteQL shape */
export type RecordTypeId = 'customer' | 'transaction' | 'employee';

/** Client-side filters applied when building SuiteQL (server-side filtering) */
export interface DataViewerFilters {
  /** Inclusive start date (`YYYY-MM-DD`) */
  dateFrom: string;
  /** Inclusive end date (`YYYY-MM-DD`) */
  dateTo: string;
  /** Case-insensitive substring match on status / status-like columns */
  statusContains: string;
  /** Exact-match on BUILTIN.DF(type) — transactions only */
  typeEquals: string;
  /** Exact match on internal numeric `id` when value is a positive integer */
  internalId: string;
  /** Case-insensitive substring on `tranid` — transactions only */
  tranIdContains: string;
}

export interface FetchRecordsParams {
  recordType: RecordTypeId;
  filters: DataViewerFilters;
  dynamicFilters?: DynamicFilter[];
  /** Extra columns from schema to append to the SELECT clause. */
  dynamicColumns?: DynamicColumn[];
}

/** A user-selected column from the record schema. */
export interface DynamicColumn {
  field: string;
  label: string;
  type: SchemaFieldType;
}

/** Normalized row for MUI DataGrid */
export interface DataViewerGridRow {
  id: string | number;
  /** Grid identity is separate from the NetSuite record ID for line results. */
  __rowId: string;
  [key: string]: unknown;
}

export interface DataViewerCursor {
  id: number;
  lineId?: number;
  /** Position in a deterministically sorted grouped result, excluding lookahead. */
  offset?: number;
}

export interface TransactionSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DataViewerFetchResult {
  columns: GridColDef[];
  rows: DataViewerGridRow[];
  nextCursor?: DataViewerCursor;
}

export const GROUP_PAGE_SIZE = 25;

export interface TransactionLineCounts {
  total: number;
  matching: number;
}

export interface TransactionPage extends DataViewerFetchResult {
  hasMore: boolean;
}

export interface TransactionParentPage extends TransactionPage {
  lineCounts: Record<string, TransactionLineCounts>;
}

export const DEFAULT_FILTERS: DataViewerFilters = {
  dateFrom: '',
  dateTo: '',
  statusContains: '',
  typeEquals: '',
  internalId: '',
  tranIdContains: '',
};

// ─── Field schema from NetSuite Record Catalog ───

export type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum';

export interface SchemaField {
  field: string;
  label: string;
  type: SchemaFieldType;
  required: boolean;
  custom: boolean;
  enumValues?: string[];
}

export interface RecordSchemaResult {
  recordType: string;
  recordTitle: string;
  fieldCount: number;
  fields: SchemaField[];
  transactionLineFieldsIncluded?: boolean;
  warnings?: string[];
}

// ─── Dynamic filters ───

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_equal'
  | 'less_equal'
  | 'is_true'
  | 'is_false'
  | 'before'
  | 'after'
  | 'on';

export interface DynamicFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export const OPERATORS_BY_TYPE: Record<
  SchemaFieldType,
  { value: FilterOperator; label: string }[]
> = {
  string: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'starts_with', label: 'starts with' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'greater_equal', label: '≥' },
    { value: 'less_equal', label: '≤' },
  ],
  date: [
    { value: 'on', label: 'on' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
  ],
  boolean: [
    { value: 'is_true', label: 'is true' },
    { value: 'is_false', label: 'is false' },
  ],
  enum: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
  ],
};
