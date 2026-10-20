export type ResultCell = string | number | boolean | null;
export type ResultColumnKind = 'number' | 'date' | 'text';
export type ResultColumn = { field: string; kind: ResultColumnKind };
export type ResultRow = Record<string, ResultCell>;
export type ResultTable = { columns: ResultColumn[]; rows: ResultRow[] };

/** `query.runSuiteQL().asMappedResults()` stops at this many rows. */
export const SUITEQL_ROW_LIMIT = 5000;

const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const KIND_SAMPLE = 50;

/**
 * Older deployments of the shared `getTableRowsFromSuiteql` action turn any
 * string with exactly one colon into `{ value, label }` (trimming both sides).
 * Rejoin it so the grid and CSV show the value NetSuite returned: digits on both
 * sides were a time (`10:30`), anything else uses NetSuite's ` : ` separator.
 * Current deployments return the string unchanged.
 */
export function restoreValue(raw: unknown): ResultCell {
  if (raw === null || raw === undefined) return null;
  if (
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
  ) {
    return raw;
  }
  if (typeof raw === 'object' && 'label' in raw && 'value' in raw) {
    const { value, label } = raw as { value: unknown; label: unknown };
    const left = String(value ?? '');
    const right = String(label ?? '');
    return /\d$/.test(left) && /^\d/.test(right)
      ? `${left}:${right}`
      : `${left} : ${right}`;
  }
  return JSON.stringify(raw);
}

export function parseDateCell(cell: ResultCell): number | null {
  if (typeof cell !== 'string') return null;
  if (ISO_TIMESTAMP.test(cell)) {
    const time = Date.parse(cell);
    return Number.isNaN(time) ? null : time;
  }
  const us = US_DATE.exec(cell);
  const iso = us ? null : ISO_DATE.exec(cell);
  if (!us && !iso) return null;
  const [year, month, day] = us
    ? [Number(us[3]), Number(us[1]), Number(us[2])]
    : [Number(iso![1]), Number(iso![2]), Number(iso![3])];
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day
    ? date.getTime()
    : null;
}

function isNumeric(cell: ResultCell): boolean {
  if (typeof cell === 'number') return Number.isFinite(cell);
  return typeof cell === 'string' && PLAIN_NUMBER.test(cell);
}

function inferKind(field: string, rows: ResultRow[]): ResultColumnKind {
  const sample: ResultCell[] = [];
  for (const row of rows) {
    const cell = row[field];
    if (cell !== null && cell !== '') sample.push(cell);
    if (sample.length === KIND_SAMPLE) break;
  }
  if (!sample.length) return 'text';
  if (sample.every(isNumeric)) return 'number';
  if (sample.every(cell => parseDateCell(cell) !== null)) return 'date';
  return 'text';
}

// Row keys live outside the row so no selected column alias can replace them.
const ROW_KEYS = new WeakMap<ResultRow, number>();

/** Position of a row in its result; stable grid row id. */
export function rowKey(row: ResultRow): number {
  const key = ROW_KEYS.get(row);
  if (key === undefined)
    throw new Error('Row was not built by buildResultTable');
  return key;
}

/**
 * Builds grid-ready rows keyed by position, so a non-unique `id` column (common
 * with joins) cannot merge rows, and keeps every value as NetSuite returned it.
 */
export function buildResultTable(
  headers: Array<{ id: string }>,
  rawRows: Array<Record<string, unknown>>
): ResultTable {
  const fields = headers.map(header => header.id);
  const rows = rawRows.map((raw, index) => {
    const row: ResultRow = {};
    for (const field of fields) row[field] = restoreValue(raw[field]);
    ROW_KEYS.set(row, index);
    return row;
  });
  return {
    columns: fields.map(field => ({ field, kind: inferKind(field, rows) })),
    rows,
  };
}

/**
 * Typed value for sorting and filtering (the grid still displays the raw cell):
 * a number for number columns, a Date for date columns, the text otherwise.
 */
export function cellValue(
  kind: ResultColumnKind,
  cell: ResultCell
): number | Date | string | null {
  if (cell === null || cell === '') return null;
  if (kind === 'number') return Number(cell);
  if (kind === 'date') {
    const time = parseDateCell(cell);
    return time === null ? null : new Date(time);
  }
  return String(cell);
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text a spreadsheet would evaluate as a formula is prefixed with
 * an apostrophe; plain numbers, including negatives, are left unchanged.
 */
export function csvCell(cell: ResultCell): string {
  let text = cell === null ? '' : String(cell);
  if (
    typeof cell === 'string' &&
    FORMULA_PREFIX.test(text) &&
    !PLAIN_NUMBER.test(text)
  ) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function tableToCsv(table: ResultTable): string {
  const fields = table.columns.map(column => column.field);
  return [
    fields.map(field => csvCell(field)).join(','),
    ...table.rows.map(row =>
      fields.map(field => csvCell(row[field])).join(',')
    ),
  ].join('\r\n');
}
