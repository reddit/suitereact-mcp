export type InferredColType = 'date' | 'number' | 'string';

const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Samples up to `sampleSize` non-empty values for `fieldId` across rows and
 * returns the detected column type. Falls back to `'string'`.
 */
export function inferColumnType(
  fieldId: string,
  rows: Record<string, unknown>[],
  sampleSize = 30
): InferredColType {
  const values: unknown[] = [];
  for (let i = 0; i < Math.min(rows.length, sampleSize); i++) {
    const raw = rows[i][fieldId];
    const v = normalizeValue(raw);
    if (v !== '' && v !== null && v !== undefined) values.push(v);
  }
  if (values.length === 0) return 'string';

  if (
    values.every(v => {
      return v instanceof Date
        ? !isNaN(v.getTime())
        : typeof v === 'string' && parseDateValue(v) !== null;
    })
  )
    return 'date';

  if (
    values.every(v => {
      if (typeof v === 'number') return true;
      const n = Number(v);
      return !isNaN(n) && isFinite(n) && String(v).trim() !== '';
    })
  )
    return 'number';

  return 'string';
}

/**
 * Builds a `{ [fieldId]: InferredColType }` map for every field in `fields`.
 * Pass the result to `applyColumnTypes` and `convertRowValues`.
 */
export function buildColumnTypeMap(
  fields: string[],
  rows: Record<string, unknown>[]
): Record<string, InferredColType> {
  const map: Record<string, InferredColType> = {};
  for (const f of fields) {
    map[f] = inferColumnType(f, rows);
  }
  return map;
}

/**
 * Applies `type`, `valueFormatter`, etc. to each column definition based on
 * the inferred type map. Returns a new array (does not mutate the input).
 * Works with MUI `GridColDef` or any object with a `field` property.
 */
export function applyColumnTypes<C extends { field: string }>(
  columns: C[],
  typeMap: Record<string, InferredColType>
): C[] {
  return columns.map(col => {
    const ct = typeMap[col.field];
    if (!ct || ct === 'string') return col;

    // Spread + assign avoids coupling to a specific GridColDef version
    const patched: any = { ...col };
    if (ct === 'date') {
      patched.type = 'date';
      patched.valueFormatter = (value: unknown) =>
        value instanceof Date && !isNaN(value.getTime())
          ? value.toLocaleDateString()
          : '';
    } else if (ct === 'number') {
      patched.type = 'number';
    }
    return patched as C;
  });
}

/**
 * Converts raw row values to native JS types based on the type map.
 * Date strings become `Date` objects; numeric strings become `number`.
 * Returns a new array (does not mutate the input).
 */
export function convertRowValues<
  R extends Record<string, unknown> = Record<string, unknown>,
>(rows: R[], typeMap: Record<string, InferredColType>): R[] {
  return rows.map(row => {
    const out = { ...row };
    for (const [field, ct] of Object.entries(typeMap)) {
      const v = normalizeValue(out[field]);
      if (ct === 'date' && v instanceof Date) {
        (out as Record<string, unknown>)[field] = v;
      } else if (ct === 'date' && typeof v === 'string' && v !== '') {
        (out as Record<string, unknown>)[field] = parseDateValue(v);
      } else if (ct === 'number') {
        (out as Record<string, unknown>)[field] = v === '' ? null : Number(v);
      } else {
        (out as Record<string, unknown>)[field] = v;
      }
    }
    return out;
  });
}

/**
 * Parses date-only values in local time so calendar dates do not shift across
 * time zones. ISO timestamps retain their timestamp semantics.
 */
export function parseDateValue(value: string): Date | null {
  if (ISO_DATE_RE.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return buildLocalDate(year, month, day);
  }

  if (US_DATE_RE.test(value)) {
    const [month, day, year] = value.split('/').map(Number);
    return buildLocalDate(year, month, day);
  }

  if (ISO_TIMESTAMP_RE.test(value)) {
    const timestamp = new Date(value);
    return isNaN(timestamp.getTime()) ? null : timestamp;
  }

  return null;
}

function buildLocalDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null && 'label' in value) {
    const o = value as { label?: string; value?: string | number };
    return o.label ?? o.value ?? '';
  }
  return value;
}
