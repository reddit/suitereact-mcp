import {
  type DataViewerCursor,
  type DataViewerGridRow,
  type DynamicColumn,
  type DynamicFilter,
  type FetchRecordsParams,
  GROUP_PAGE_SIZE,
  type TransactionSort,
} from './types';

export function transactionHeaderParams(
  params: FetchRecordsParams
): FetchRecordsParams {
  if (params.recordType !== 'transaction')
    throw new Error('Expected transactions');
  const defaults: DynamicColumn[] = [
    { field: 'tranid', label: 'Transaction', type: 'string' },
    { field: 'type', label: 'Type', type: 'enum' },
    { field: 'trandate', label: 'Date', type: 'date' },
    { field: 'entity', label: 'Entity', type: 'enum' },
    { field: 'status', label: 'Status', type: 'enum' },
    { field: 'foreigntotal', label: 'Transaction total', type: 'number' },
    { field: 'currency', label: 'Currency', type: 'enum' },
  ];
  return {
    ...params,
    dynamicColumns: [
      ...defaults,
      ...(params.dynamicColumns ?? []).filter(
        c => !isLineField(c.field) && !defaults.some(d => d.field === c.field)
      ),
    ],
  };
}

export function buildTransactionParentQuery(
  params: FetchRecordsParams,
  cursor?: DataViewerCursor,
  sort?: TransactionSort
): string {
  if (sort) {
    const base = buildSuiteQlQuery(transactionHeaderParams(params)).replace(
      / ORDER BY t\.id ASC$/,
      ''
    );
    return sortedGroupQuery(
      `${base} ORDER BY ${transactionSortOrder(params, sort, false)}`,
      cursor
    );
  }
  return boundedGroupQuery(
    buildSuiteQlQuery(transactionHeaderParams(params), cursor)
  );
}

export const GROUP_ROW_NUMBER = 'sr_page_row';

export function transactionSortFields(
  params: FetchRecordsParams,
  lines: boolean
): string[] {
  if (params.recordType !== 'transaction')
    throw new Error('Expected transactions');
  const columns = lines
    ? (params.dynamicColumns ?? []).filter(c => isLineField(c.field))
    : (transactionHeaderParams(params).dynamicColumns ?? []);
  return [
    ...new Set([
      lines ? 'line_id' : 'id',
      ...columns.map(c => columnResultId(c.field)),
    ]),
  ];
}

function transactionSortOrder(
  params: FetchRecordsParams,
  sort: TransactionSort,
  lines: boolean
): string {
  if (
    !['asc', 'desc'].includes(sort.direction) ||
    !/^[a-z][a-z0-9_]*$/i.test(sort.field) ||
    !transactionSortFields(params, lines).includes(sort.field)
  )
    throw new Error('Unsupported transaction sort');
  const id = lines ? 'line_id' : 'id';
  return `${sort.field} ${sort.direction.toUpperCase()} NULLS LAST${sort.field === id ? '' : `, ${id} ASC`}`;
}

function sortedGroupQuery(query: string, cursor?: DataViewerCursor): string {
  const offset = cursor?.offset ?? 0;
  if (
    (cursor && cursor.offset == null) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset % GROUP_PAGE_SIZE !== 0 ||
    !Number.isSafeInteger(offset + GROUP_PAGE_SIZE + 1)
  )
    throw new Error('Invalid sorted page cursor');
  // Number rows after sorting. The outer bound skips prior pages; the inner
  // bound limits work to this page plus its lookahead without returning all rows.
  return `SELECT * FROM (SELECT sr_sorted.*, ROWNUM AS ${GROUP_ROW_NUMBER} FROM (${query}) sr_sorted WHERE ROWNUM <= ${offset + GROUP_PAGE_SIZE + 1}) WHERE ${GROUP_ROW_NUMBER} > ${offset} ORDER BY ${GROUP_ROW_NUMBER}`;
}

function boundedGroupQuery(query: string): string {
  // Apply the limit outside the ordered query so the cursor cannot skip rows.
  return `SELECT * FROM (${query}) WHERE ROWNUM <= ${GROUP_PAGE_SIZE + 1}`;
}

function checkedParentId(id: number): number {
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error('Invalid transaction ID');
  return id;
}

function lineFilterSql(params: FetchRecordsParams): string {
  if (params.recordType !== 'transaction')
    throw new Error('Expected transactions');
  return buildDynamicFilterClauses(
    'transaction',
    (params.dynamicFilters ?? []).filter(f => isLineField(f.field))
  );
}

export function buildTransactionLineCountsQuery(
  params: FetchRecordsParams,
  parentIds: number[]
): string {
  if (!parentIds.length || parentIds.length > GROUP_PAGE_SIZE)
    throw new Error('Invalid transaction count scope');
  const ids = parentIds.map(checkedParentId);
  return `SELECT tl.transaction AS id, COUNT(*) AS total_count, SUM(CASE WHEN 1 = 1${lineFilterSql(params)} THEN 1 ELSE 0 END) AS matching_count FROM TransactionLine tl WHERE tl.transaction IN (${ids.join(', ')}) GROUP BY tl.transaction`;
}

export function buildTransactionChildrenQuery(
  params: FetchRecordsParams,
  parentId: number,
  showAll: boolean,
  cursor?: DataViewerCursor,
  sort?: TransactionSort
): string {
  checkedParentId(parentId);
  if (
    cursor &&
    (cursor.id !== parentId ||
      !Number.isSafeInteger(cursor.lineId) ||
      cursor.lineId! < 0)
  )
    throw new Error('Invalid transaction line cursor');
  const filter = lineFilterSql(params);
  const columns = (params.dynamicColumns ?? []).filter(c =>
    isLineField(c.field)
  );
  const select = buildDynamicColumnsSql('transaction', columns);
  const base = `SELECT tl.transaction AS id, tl.id AS line_id, CASE WHEN 1 = 1${filter} THEN 'T' ELSE 'F' END AS line_matches${select} FROM TransactionLine tl WHERE tl.transaction = ${parentId}${showAll ? '' : filter}`;
  return sort
    ? sortedGroupQuery(
        `${base} ORDER BY ${transactionSortOrder(params, sort, true)}`,
        cursor
      )
    : boundedGroupQuery(
        `${base}${cursor ? ` AND tl.id > ${cursor.lineId}` : ''} ORDER BY tl.id ASC`
      );
}

export function isLineField(field: string): boolean {
  return field.startsWith('transactionline.');
}

export function isActiveFilter(filter: DynamicFilter): boolean {
  return Boolean(
    filter.field &&
    (filter.operator === 'is_true' ||
      filter.operator === 'is_false' ||
      filter.value.trim())
  );
}

export function usesTransactionLines(params: FetchRecordsParams): boolean {
  return (
    params.recordType === 'transaction' &&
    Boolean(params.dynamicColumns?.some(column => isLineField(column.field)))
  );
}

export function columnResultId(field: string): string {
  return isLineField(field)
    ? `line_${field.slice('transactionline.'.length)}`
    : field;
}

function fieldExpression(recordType: string, field: string): string {
  const line = isLineField(field);
  const name = line ? field.slice('transactionline.'.length) : field;
  if (
    !/^[a-z][a-z0-9_]*$/i.test(name) ||
    (line && recordType !== 'transaction')
  ) {
    throw new Error(`Unsupported field: ${field}`);
  }
  return `${line ? 'tl' : TABLE_ALIAS[recordType]}.${name}`;
}

export function cursorAdvances(
  previous: DataViewerCursor,
  next: DataViewerCursor
): boolean {
  return (
    next.id > previous.id ||
    (next.id === previous.id &&
      next.lineId != null &&
      previous.lineId != null &&
      next.lineId > previous.lineId)
  );
}

export function getNextCursor(
  params: FetchRecordsParams,
  rows: DataViewerGridRow[]
): DataViewerCursor | undefined {
  const last = rows[rows.length - 1];
  if (!last) return undefined;
  const id = Number(last.id);
  const lineId = usesTransactionLines(params)
    ? Number(last.line_id)
    : undefined;
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    (usesTransactionLines(params) &&
      (last.line_id == null ||
        last.line_id === '' ||
        !Number.isSafeInteger(lineId) ||
        lineId! < 0))
  ) {
    throw new Error(
      'Invalid record or line ID in query results; pagination cannot continue safely.'
    );
  }
  return { id, ...(lineId == null ? {} : { lineId }) };
}

function escapeSuiteQlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function buildDatePredicate(
  dateColumn: string,
  dateFrom: string,
  dateTo: string
): string {
  const from = escapeSuiteQlLiteral(dateFrom.trim());
  const to = escapeSuiteQlLiteral(dateTo.trim());
  if (from.length > 0 && to.length > 0) {
    return ` AND ${dateColumn} >= DATE '${from}' AND ${dateColumn} <= DATE '${to}'`;
  }
  if (from.length > 0) {
    return ` AND ${dateColumn} >= DATE '${from}'`;
  }
  if (to.length > 0) {
    return ` AND ${dateColumn} <= DATE '${to}'`;
  }
  return '';
}

function buildStatusLikeClause(expression: string, status: string): string {
  const s = status.trim();
  if (!s.length) {
    return '';
  }
  return ` AND UPPER(${expression}) LIKE UPPER('%${escapeSuiteQlLiteral(s)}%')`;
}

const TABLE_ALIAS: Record<string, string> = {
  customer: 'c',
  transaction: 't',
  employee: 'e',
};

function buildDynamicFilterClauses(
  recordType: string,
  dynamicFilters: DynamicFilter[]
): string {
  return dynamicFilters
    .filter(isActiveFilter)
    .map(f => {
      const col = fieldExpression(recordType, f.field);
      const val = escapeSuiteQlLiteral(f.value);

      switch (f.operator) {
        case 'equals':
          return ` AND ${col} = '${val}'`;
        case 'not_equals':
          return ` AND ${col} != '${val}'`;
        case 'contains':
          return ` AND UPPER(${col}) LIKE UPPER('%${val}%')`;
        case 'starts_with':
          return ` AND UPPER(${col}) LIKE UPPER('${val}%')`;
        case 'greater_than':
          return ` AND ${col} > ${Number(f.value) || 0}`;
        case 'less_than':
          return ` AND ${col} < ${Number(f.value) || 0}`;
        case 'greater_equal':
          return ` AND ${col} >= ${Number(f.value) || 0}`;
        case 'less_equal':
          return ` AND ${col} <= ${Number(f.value) || 0}`;
        case 'before':
          return ` AND ${col} < DATE '${val}'`;
        case 'after':
          return ` AND ${col} > DATE '${val}'`;
        case 'on':
          return ` AND ${col} = DATE '${val}'`;
        case 'is_true':
          return ` AND ${col} = 'T'`;
        case 'is_false':
          return ` AND ${col} = 'F'`;
        default:
          return '';
      }
    })
    .join('');
}

/** Known base columns per record type — used to avoid duplicating them. */
const BASE_COLUMNS: Record<string, Set<string>> = {
  customer: new Set([
    'id',
    'entityid',
    'companyname',
    'email',
    'phone',
    'entitystatus',
    'datecreated',
  ]),
  transaction: new Set([
    'id',
    'tranid',
    'type',
    'recordtype',
    'trandate',
    'entity',
    'status',
    'foreigntotal',
  ]),
  employee: new Set([
    'id',
    'entityid',
    'firstname',
    'lastname',
    'email',
    'subsidiary',
    'hiredate',
    'isinactive',
  ]),
};

/**
 * Build a comma-separated list of extra SELECT expressions for user-chosen
 * dynamic columns, skipping any that already exist in the base query.
 */
function buildDynamicColumnsSql(
  recordType: string,
  dynamicColumns: DynamicColumn[]
): string {
  if (!dynamicColumns.length) return '';
  const existing = BASE_COLUMNS[recordType] ?? new Set();

  const fragments = dynamicColumns
    .filter(dc => !existing.has(dc.field))
    .filter(dc => dc.field !== 'transactionline.id')
    .map(dc => {
      const expression = fieldExpression(recordType, dc.field);
      const resultId = columnResultId(dc.field);
      if (dc.type === 'enum') {
        return `BUILTIN.DF(${expression}) AS ${resultId}`;
      }
      return `${expression} AS ${resultId}`;
    });

  return fragments.length ? ', ' + fragments.join(', ') : '';
}

function buildTypeClause(typeEquals: string): string {
  const t = typeEquals.trim();
  if (!t) return '';
  return ` AND BUILTIN.DF(t.type) = '${escapeSuiteQlLiteral(t)}'`;
}

/** When `raw` is a positive integer, restrict to that internal id; otherwise omit. */
function buildInternalIdClause(idColumn: string, raw: string): string {
  const s = raw.trim();
  if (!s.length) return '';
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return '';
  return ` AND ${idColumn} = ${n}`;
}

/**
 * Shared WHERE-clause fragments for a given record type + filters.
 * Reused by both the data query and the count query.
 */
function buildWhereClauses(params: FetchRecordsParams): {
  alias: string;
  filterSql: string;
} {
  const { recordType, filters, dynamicFilters = [] } = params;
  const status = filters.statusContains;
  const lineFilters = dynamicFilters.filter(
    f => isLineField(f.field) && isActiveFilter(f)
  );
  const headerFilters = dynamicFilters.filter(f => !isLineField(f.field));
  const lineSql = buildDynamicFilterClauses(recordType, lineFilters);
  const dynSql =
    buildDynamicFilterClauses(recordType, headerFilters) +
    (lineSql && !usesTransactionLines(params)
      ? ` AND EXISTS (SELECT 1 FROM TransactionLine tl WHERE tl.transaction = t.id${lineSql})`
      : lineSql);
  const alias = TABLE_ALIAS[recordType] ?? '';

  switch (recordType) {
    case 'customer': {
      const dateSql = buildDatePredicate(
        'c.datecreated',
        filters.dateFrom,
        filters.dateTo
      );
      const statusSql = buildStatusLikeClause(
        'BUILTIN.DF(c.entitystatus)',
        status
      );
      const idSql = buildInternalIdClause('c.id', filters.internalId);
      return { alias, filterSql: `${idSql} ${dateSql} ${statusSql} ${dynSql}` };
    }
    case 'transaction': {
      const dateSql = buildDatePredicate(
        't.trandate',
        filters.dateFrom,
        filters.dateTo
      );
      const statusSql = buildStatusLikeClause('BUILTIN.DF(t.status)', status);
      const typeSql = buildTypeClause(filters.typeEquals);
      const idSql = buildInternalIdClause('t.id', filters.internalId);
      const tranSql = buildStatusLikeClause('t.tranid', filters.tranIdContains);
      return {
        alias,
        filterSql: `${typeSql} ${idSql} ${tranSql} ${dateSql} ${statusSql} ${dynSql}`,
      };
    }
    case 'employee': {
      const dateSql = buildDatePredicate(
        'e.hiredate',
        filters.dateFrom,
        filters.dateTo
      );
      const statusSql = buildStatusLikeClause(
        `CASE WHEN e.isinactive = 'T' THEN 'Inactive' ELSE 'Active' END`,
        status
      );
      const idSql = buildInternalIdClause('e.id', filters.internalId);
      return { alias, filterSql: `${idSql} ${dateSql} ${statusSql} ${dynSql}` };
    }
    default: {
      const exhaustive: never = recordType;
      throw new Error(`Unsupported record type: ${exhaustive}`);
    }
  }
}

/**
 * Build a SELECT COUNT(*) query for the same record type + filters.
 */
export function buildCountQuery(params: FetchRecordsParams): string {
  const { recordType } = params;
  const { alias, filterSql } = buildWhereClauses(params);

  const baseMap: Record<string, string> = {
    customer: `SELECT COUNT(*) AS cnt FROM customer ${alias} WHERE ${alias}.isinactive = 'F'`,
    transaction: `SELECT COUNT(*) AS cnt FROM transaction ${alias}${usesTransactionLines(params) ? ' INNER JOIN TransactionLine tl ON tl.transaction = t.id' : ''} WHERE ${alias}.posting = 'T'`,
    employee: `SELECT COUNT(*) AS cnt FROM employee ${alias} WHERE 1 = 1`,
  };

  return `${baseMap[recordType]} ${filterSql}`;
}

/**
 * The composite cursor preserves lines when a page ends within a transaction.
 */
export function buildSuiteQlQuery(
  params: FetchRecordsParams,
  cursor?: DataViewerCursor
): string {
  const { recordType, dynamicColumns = [] } = params;
  const dynCols = buildDynamicColumnsSql(recordType, dynamicColumns);
  const { alias, filterSql } = buildWhereClauses(params);
  const lineRows = usesTransactionLines(params);
  let cursorSql = '';
  if (cursor) {
    if (
      !Number.isSafeInteger(cursor.id) ||
      cursor.id < 1 ||
      (lineRows && (!Number.isSafeInteger(cursor.lineId) || cursor.lineId! < 0))
    ) {
      throw new Error('Invalid pagination cursor');
    }
    cursorSql = lineRows
      ? ` AND (t.id > ${cursor.id} OR (t.id = ${cursor.id} AND tl.id > ${cursor.lineId}))`
      : ` AND ${alias}.id > ${cursor.id}`;
  }

  let sql: string;

  switch (recordType) {
    case 'customer': {
      const base = `
        SELECT c.id,
               c.entityid,
               c.companyname,
               c.email,
               c.phone,
               BUILTIN.DF(c.entitystatus) AS status,
               c.datecreated
               ${dynCols}
        FROM customer c
        WHERE c.isinactive = 'F'
      `
        .replace(/\s+/g, ' ')
        .trim();
      sql = `${base} ${filterSql}${cursorSql} ORDER BY c.id ASC`;
      break;
    }
    case 'transaction': {
      const base = `
        SELECT t.id,
               ${lineRows ? 'tl.id AS line_id,' : ''}
               t.tranid,
               BUILTIN.DF(t.type) AS type,
               t.recordtype,
               t.trandate,
               BUILTIN.DF(t.entity) AS entity,
               BUILTIN.DF(t.status) AS status,
               t.foreigntotal
               ${dynCols}
        FROM transaction t
        ${lineRows ? 'INNER JOIN TransactionLine tl ON tl.transaction = t.id' : ''}
        WHERE t.posting = 'T'
      `
        .replace(/\s+/g, ' ')
        .trim();
      sql = `${base} ${filterSql}${cursorSql} ORDER BY t.id ASC${lineRows ? ', tl.id ASC' : ''}`;
      break;
    }
    case 'employee': {
      const base = `
        SELECT e.id,
               e.entityid,
               e.firstname,
               e.lastname,
               e.email,
               BUILTIN.DF(e.subsidiary) AS subsidiary,
               e.hiredate,
               CASE WHEN e.isinactive = 'T' THEN 'Inactive' ELSE 'Active' END AS status
               ${dynCols}
        FROM employee e
        WHERE 1 = 1
      `
        .replace(/\s+/g, ' ')
        .trim();
      sql = `${base} ${filterSql}${cursorSql} ORDER BY e.id ASC`;
      break;
    }
    default: {
      const exhaustive: never = recordType;
      throw new Error(`Unsupported record type: ${exhaustive}`);
    }
  }

  return sql;
}
