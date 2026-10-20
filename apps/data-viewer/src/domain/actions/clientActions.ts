import type { GridColDef } from '@mui/x-data-grid';
import {
  applyColumnTypes,
  buildColumnTypeMap,
  convertRowValues,
  handleRestletAction,
  type NsReactTableHeaderProps,
  type NsReactTableRowProps,
} from 'suitereact';

import {
  buildCountQuery,
  buildSuiteQlQuery,
  buildTransactionChildrenQuery,
  buildTransactionLineCountsQuery,
  buildTransactionParentQuery,
  columnResultId,
  cursorAdvances,
  getNextCursor,
  GROUP_ROW_NUMBER,
  isLineField,
  transactionHeaderParams,
  transactionSortFields,
  usesTransactionLines,
} from '../query';
import {
  type DataViewerCursor,
  type DataViewerFetchResult,
  type DataViewerGridRow,
  type FetchRecordsParams,
  GROUP_PAGE_SIZE,
  type RecordSchemaResult,
  type TransactionLineCounts,
  type TransactionPage,
  type TransactionParentPage,
  type TransactionSort,
} from '../types';

const LOCAL_PROXY_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const LOCAL_PROXY_TOKEN = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

const BASE_LABELS: Record<string, string> = {
  id: 'Internal ID',
  line_id: 'Line ID',
  entityid: 'Entity ID',
  companyname: 'Company',
  email: 'Email',
  phone: 'Phone',
  status: 'Status',
  datecreated: 'Created',
  tranid: 'Transaction',
  type: 'Type',
  trandate: 'Date',
  entity: 'Entity',
  foreigntotal: 'Transaction total',
  firstname: 'First name',
  lastname: 'Last name',
  subsidiary: 'Subsidiary',
  hiredate: 'Hire date',
};

/** Record identifiers keep numeric sorting but never take locale grouping. */
const IDENTIFIER_FIELDS = new Set(['id', 'line_id']);

function baseLabel(header: NsReactTableHeaderProps): string {
  const known = BASE_LABELS[header.id];
  if (known) return known;
  if (header.label.toLowerCase() !== header.id) return header.label;
  const words = header.id.replace(/_/g, ' ');
  return /^[a-z][a-z0-9 ]*$/.test(words)
    ? words.charAt(0).toUpperCase() + words.slice(1)
    : header.label;
}

function headersToColumns(
  headers: NsReactTableHeaderProps[]
): GridColDef<DataViewerGridRow>[] {
  return headers.map(h => ({
    field: h.id,
    headerName: h.label,
    flex: 1,
    minWidth: 120,
    sortable: true,
    filterable: true,
  }));
}

function isErrorPayload(
  value: unknown
): value is { error?: string; message?: string; success?: boolean } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/**
 * Fetch the total row count for the current query parameters.
 * Used to show progress during background pagination.
 */
export async function fetchRecordCount(
  params: FetchRecordsParams
): Promise<number> {
  const query = buildCountQuery(params);
  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    { query },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );
  if (raw == null) return 0;
  const { rows } = raw as { rows?: Array<Record<string, unknown>> };
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0];
  return Number(first.cnt ?? first.CNT ?? 0);
}

export async function fetchDataViewerRecords(
  params: FetchRecordsParams,
  cursor?: DataViewerCursor
): Promise<DataViewerFetchResult> {
  const query = buildSuiteQlQuery(params, cursor);

  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    { query },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  return normalizeRecords(raw, params);
}

function normalizeRecords(
  raw: unknown,
  params: FetchRecordsParams
): DataViewerFetchResult {
  if (raw == null) {
    throw new Error('Empty response from server');
  }

  if (isErrorPayload(raw) && raw.success === false) {
    const msg = raw.message || raw.error || 'Unknown server error';
    throw new Error(String(msg));
  }

  if (isErrorPayload(raw) && raw.error && !('headers' in raw)) {
    throw new Error(String(raw.error));
  }

  const { headers, rows } = raw as {
    headers: NsReactTableHeaderProps[];
    rows: NsReactTableRowProps[];
  };

  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new Error('Unexpected response shape from getTableRowsFromSuiteql');
  }

  // Ensure user-requested dynamic columns always appear even if NetSuite
  // omitted them (all-null columns are dropped from the SuiteQL JSON response).
  const dynCols = params.dynamicColumns ?? [];
  const returnedFieldIds = new Set(headers.map(h => h.id));
  const missingCols = dynCols.filter(
    dc => !returnedFieldIds.has(columnResultId(dc.field))
  );
  const augmentedHeaders: NsReactTableHeaderProps[] = [
    ...headers.map(h => ({
      ...h,
      label:
        dynCols.find(dc => columnResultId(dc.field) === h.id)?.label ??
        baseLabel(h),
    })),
    ...missingCols.map(dc => ({
      id: columnResultId(dc.field),
      label: dc.label,
    })),
  ];

  const baseCols = headersToColumns(augmentedHeaders);
  const baseRows: DataViewerGridRow[] = rows.map((r, i) => {
    const id = r.id ?? i;
    const out: DataViewerGridRow = { id: String(id), __rowId: String(id) };
    for (const h of augmentedHeaders) {
      const v = r[h.id];
      if (v === null || v === undefined) {
        out[h.id] = '';
      } else if (typeof v === 'object' && v !== null && 'label' in v) {
        const o = v as { label?: string; value?: string | number };
        out[h.id] = o.label ?? o.value ?? '';
      } else {
        out[h.id] = v;
      }
    }
    out.__rowId = usesTransactionLines(params)
      ? `${out.id}/${out.line_id}`
      : String(out.id);
    return out;
  });

  const typeMap = buildColumnTypeMap(
    augmentedHeaders.map(h => h.id),
    baseRows
  );

  return {
    columns: applyColumnTypes(baseCols, typeMap)
      .filter(c => c.field !== 'recordtype')
      .map(c =>
        IDENTIFIER_FIELDS.has(c.field)
          ? { ...c, valueFormatter: (value: unknown) => value ?? '' }
          : c
      ),
    rows: convertRowValues(baseRows, typeMap),
    nextCursor: getNextCursor(params, baseRows),
  };
}

function groupPage(
  raw: unknown,
  params: FetchRecordsParams,
  cursor?: DataViewerCursor,
  sort?: TransactionSort
): TransactionPage {
  const result = normalizeRecords(raw, params);
  if (result.rows.length > GROUP_PAGE_SIZE + 1)
    throw new Error('Transaction page exceeded its row limit');
  let previous = cursor;
  const identities = new Set<string>();
  for (const [index, row] of result.rows.entries()) {
    const next = getNextCursor(params, [row])!;
    if (identities.has(row.__rowId))
      throw new Error('Transaction page contains duplicate rows');
    identities.add(row.__rowId);
    if (sort) {
      if (Number(row[GROUP_ROW_NUMBER]) !== (cursor?.offset ?? 0) + index + 1)
        throw new Error('Sorted transaction page is not in cursor order');
    } else if (previous && !cursorAdvances(previous, next))
      throw new Error('Transaction page is not in cursor order');
    previous = next;
  }
  const rows = result.rows.slice(0, GROUP_PAGE_SIZE).map(row => {
    const visible = { ...row };
    delete visible[GROUP_ROW_NUMBER];
    return visible;
  });
  const nextCursor = getNextCursor(params, rows);
  return {
    ...result,
    columns: result.columns.filter(c => c.field !== GROUP_ROW_NUMBER),
    rows,
    hasMore: result.rows.length > GROUP_PAGE_SIZE,
    nextCursor: nextCursor && {
      ...nextCursor,
      ...(sort ? { offset: (cursor?.offset ?? 0) + rows.length } : {}),
    },
  };
}

export async function fetchTransactionParents(
  params: FetchRecordsParams,
  cursor?: DataViewerCursor,
  sort?: TransactionSort
): Promise<TransactionParentPage> {
  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    { query: buildTransactionParentQuery(params, cursor, sort) },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );
  const page = groupPage(raw, transactionHeaderParams(params), cursor, sort);
  const lineCounts: Record<string, TransactionLineCounts> = {};
  if (page.rows.length) {
    const ids = page.rows.map(r => Number(r.id));
    const counts = await handleRestletAction(
      'getTableRowsFromSuiteql',
      { query: buildTransactionLineCountsQuery(params, ids) },
      LOCAL_PROXY_BASE_URL,
      LOCAL_PROXY_TOKEN
    );
    if (
      !counts ||
      isErrorPayload(counts) ||
      !Array.isArray((counts as { rows?: unknown }).rows)
    )
      throw new Error(
        'Transaction line counts could not be loaded. Please retry.'
      );
    for (const row of (counts as { rows: Array<Record<string, unknown>> })
      .rows) {
      const total = Number(row.total_count);
      const matching = Number(row.matching_count);
      if (
        !ids.includes(Number(row.id)) ||
        !Number.isSafeInteger(total) ||
        !Number.isSafeInteger(matching) ||
        matching < 0 ||
        total < matching
      )
        throw new Error('Invalid transaction line counts');
      lineCounts[String(row.id)] = { total, matching };
    }
    for (const id of ids) lineCounts[String(id)] ??= { total: 0, matching: 0 };
  }
  return { ...page, lineCounts };
}

export async function fetchTransactionChildren(
  params: FetchRecordsParams,
  parentId: number,
  showAll: boolean,
  cursor?: DataViewerCursor,
  sort?: TransactionSort
): Promise<TransactionPage> {
  const lineParams: FetchRecordsParams = {
    ...params,
    dynamicColumns: [
      { field: 'transactionline.id', label: 'Line ID', type: 'number' },
      ...(params.dynamicColumns ?? []).filter(
        c => isLineField(c.field) && c.field !== 'transactionline.id'
      ),
    ],
  };
  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    {
      query: buildTransactionChildrenQuery(
        lineParams,
        parentId,
        showAll,
        cursor,
        sort
      ),
    },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );
  const page = groupPage(raw, lineParams, cursor, sort);
  if (page.rows.some(row => Number(row.id) !== parentId))
    throw new Error('Line response contains an unexpected transaction');
  return {
    ...page,
    columns: page.columns
      .filter(c => c.field !== 'id' && c.field !== 'line_matches')
      .map(c => ({
        ...c,
        sortable: transactionSortFields(lineParams, true).includes(c.field),
        filterable: false,
        disableColumnMenu: true,
      })),
  };
}

/**
 * Fetch the field schema for a record type via the same action handler used
 * for all server actions. In local dev this routes through the proxy to the
 * RESTlet; in production it uses REST.post directly — identical code path.
 */
export async function fetchRecordSchema(
  recordType: string
): Promise<RecordSchemaResult> {
  const raw = await handleRestletAction(
    'getRecordFieldSchema',
    { recordType, includeTransactionLineFields: recordType === 'transaction' },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  if (raw == null) {
    throw new Error('Empty response from getRecordFieldSchema');
  }
  if (isErrorPayload(raw) && raw.error) {
    throw new Error(String(raw.message || raw.error));
  }

  const result = raw as RecordSchemaResult;
  if (!result.fields || !Array.isArray(result.fields)) {
    throw new Error('Unexpected schema response shape');
  }
  if (recordType === 'transaction' && !result.transactionLineFieldsIncluded) {
    throw new Error(
      'Transaction line fields are unavailable. The Data Viewer field service needs to be updated.'
    );
  }
  return result;
}

/**
 * Fetch distinct transaction type display values for the Type dropdown.
 * Only meaningful for the `transaction` record type.
 */
export async function fetchDistinctTypes(
  proxyBase?: string
): Promise<string[]> {
  const query = `SELECT DISTINCT BUILTIN.DF(t.type) AS type FROM transaction t WHERE t.posting = 'T' ORDER BY BUILTIN.DF(t.type)`;
  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    { query },
    proxyBase ?? LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  if (raw == null) return [];

  const { rows } = raw as { rows?: Array<Record<string, unknown>> };
  if (!Array.isArray(rows)) return [];

  return rows
    .map(r => {
      const v = r.type;
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && 'label' in v)
        return String((v as { label?: string }).label ?? '');
      return '';
    })
    .filter(Boolean)
    .sort();
}

/**
 * Resolve NetSuite record URL templates via the `resolveRecordUrls` server
 * action (uses N/url.resolveDomain + N/url.resolveRecord on the server).
 * Returns a map of `recordType → urlTemplate` where each template ends with
 * `?id=` — the caller appends the internal ID.
 */
export async function fetchRecordUrlTemplates(
  recordTypes: string[]
): Promise<Record<string, string>> {
  const raw = await handleRestletAction(
    'resolveRecordUrls',
    { recordTypes },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  if (raw == null) return {};

  const result = raw as { domain?: string; templates?: Record<string, string> };
  return result.templates ?? {};
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/**
 * Renders one CSV cell. Text that a spreadsheet would evaluate as a formula is
 * prefixed with an apostrophe so editable NetSuite text (memos, custom fields)
 * opens as inert text; real numbers, including negatives, are left unchanged.
 */
export function csvCell(cell: unknown): string {
  let s: string;
  if (cell === null || cell === undefined) {
    s = '';
  } else if (cell instanceof Date) {
    s = !isNaN(cell.getTime()) ? cell.toLocaleDateString() : '';
  } else if (typeof cell === 'number' || typeof cell === 'boolean') {
    s = String(cell);
  } else {
    s = String(cell);
    if (FORMULA_PREFIX.test(s) && !NUMERIC_TEXT.test(s)) s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportRowsToCsv(
  columns: GridColDef[],
  rows: DataViewerGridRow[],
  filename: string
): void {
  const fields = columns.map(c => c.field);
  const headerLine = fields.join(',');
  const lines = rows.map(row => fields.map(f => csvCell(row[f])).join(','));
  const csv = [headerLine, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
